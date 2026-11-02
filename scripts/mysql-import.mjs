import { DatabaseSync, backup } from 'node:sqlite';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';
import { loadEnvironment } from './mysql-env.mjs';
import { migrate } from './mysql-migrate.mjs';

const quote = (value) => '`' + value.replaceAll('`', '``') + '`';
const digest = (rows, columns) =>
  createHash('sha256')
    .update(
      JSON.stringify(
        rows
          .map((row) => columns.map((c) => row[c]))
          .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
      ),
    )
    .digest('hex');

export async function importLegacy({
  url = process.env.DATABASE_URL,
  source: supplied,
  folder: output,
} = {}) {
  const map = JSON.parse(
    readFileSync(new URL('../db/table-map.json', import.meta.url), 'utf8'),
  );
  const files = supplied
    ? [resolve(supplied)]
    : existsSync('data/v3/d1')
      ? readdirSync('data/v3/d1', { recursive: true })
          .filter(
            (f) => f.endsWith('.sqlite') && !f.endsWith('metadata.sqlite'),
          )
          .map((f) => resolve('data/v3/d1', f))
      : [];
  if (files.length !== 1)
    throw new Error('请用 --source=路径 指定唯一的旧 SQLite 数据文件');
  const folder = resolve(
    output ||
      'data/mysql-backups/' + new Date().toISOString().replace(/[:.]/g, '-'),
  );
  mkdirSync(folder, { recursive: true });
  const original = new DatabaseSync(files[0], { readOnly: true });
  const snapshot = resolve(folder, 'before-mysql.sqlite');
  try {
    await backup(original, snapshot);
  } finally {
    original.close();
  }
  const source = new DatabaseSync(snapshot, { readOnly: true });
  const sourceHash = createHash('sha256')
    .update(readFileSync(snapshot))
    .digest('hex');
  const c = await mysql.createConnection({
    uri: url,
    charset: 'utf8mb4',
    supportBigNumbers: true,
    decimalNumbers: true,
  });
  const report = {
    source: files[0],
    backup: snapshot,
    target: decodeURIComponent(new URL(url).pathname.slice(1)),
    sourceHash,
    tables: [],
    verified: false,
  };
  try {
    const [[old]] = await c.query(
      'SELECT report FROM treasure_data_imports WHERE sourceHash=?',
      [sourceHash],
    );
    if (old) {
      console.log('此快照已迁入，未重复写入');
      return JSON.parse(old.report);
    }
    await c.query('SET TRANSACTION ISOLATION LEVEL READ COMMITTED');
    await c.beginTransaction();
    await c.query(
      'SELECT id FROM treasure_transaction_lock WHERE id=1 FOR UPDATE',
    );
    for (const target of Object.values(map)) {
      const [[row]] = await c.query(
        `SELECT COUNT(*) AS n FROM ${quote(target)}`,
      );
      if (Number(row.n))
        throw new Error('目标表已有数据，已停止导入，避免覆盖：' + target);
    }
    await c.query('SET @treasure_importing=1');
    // Insert parent rows before their children without disabling foreign keys.
    const pending = new Set(Object.keys(map)),
      sorted = [];
    while (pending.size) {
      let progress = false;
      for (const table of pending) {
        const parents = source
          .prepare(`PRAGMA foreign_key_list(${JSON.stringify(table)})`)
          .all()
          .map((r) => r.table);
        if (parents.some((p) => pending.has(p) && p !== table)) continue;
        sorted.push(table);
        pending.delete(table);
        progress = true;
      }
      if (!progress) throw new Error('旧结构含循环外键，请先处理');
    }
    for (const table of sorted) {
      const columns = source
        .prepare(`PRAGMA table_info(${JSON.stringify(table)})`)
        .all()
        .map((c) => c.name);
      if (!columns.length) throw new Error('旧库缺少已知表：' + table);
      const rows = source
        .prepare(`SELECT * FROM ${quote(table)} ORDER BY rowid`)
        .all();
      const sql = `INSERT INTO ${quote(map[table])} (${columns.map(quote).join(',')}) VALUES (${columns.map(() => '?').join(',')})`;
      // Match SQLite insertion order for Agent tasks; the new sortOrder fills automatically.
      for (const row of rows)
        await c.query(
          sql,
          columns.map((k) => row[k]),
        );
      const [copied] = await c.query(
        `SELECT ${columns.map(quote).join(',')} FROM ${quote(map[table])}`,
      );
      const sourceDigest = digest(rows, columns),
        targetDigest = digest(copied, columns);
      if (rows.length !== copied.length || sourceDigest !== targetDigest)
        throw new Error('导入内容校验失败：' + table);
      report.tables.push({
        source: table,
        target: map[table],
        rows: rows.length,
        sha256: sourceDigest,
        verified: true,
      });
    }
    report.verified = true;
    report.completedAt = new Date().toISOString();
    await c.query('INSERT INTO treasure_data_imports VALUES(?,?,?)', [
      sourceHash,
      report.completedAt,
      JSON.stringify(report),
    ]);
    await c.commit();
    writeFileSync(
      resolve(folder, 'verification.json'),
      JSON.stringify(report, null, 2),
    );
    console.log(
      `迁入 ${report.tables.length} 张表、${report.tables.reduce((n, t) => n + t.rows, 0)} 条记录；逐表数量与内容 SHA-256 校验通过`,
    );
    return report;
  } catch (e) {
    await c.rollback();
    throw new Error(e.sqlMessage || e.message);
  } finally {
    source.close();
    await c.query('SET @treasure_importing=0').catch(() => {});
    await c.end();
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  loadEnvironment();
  try {
    await migrate();
    await importLegacy({
      source: process.argv.find((a) => a.startsWith('--source='))?.slice(9),
    });
  } catch (e) {
    console.error(e.message);
    process.exitCode = 1;
  }
}
