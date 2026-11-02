import mysql from 'mysql2/promise';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { loadEnvironment } from './mysql-env.mjs';

export async function migrate(url = process.env.DATABASE_URL) {
  if (!url) throw new Error('请在 .env 配置 DATABASE_URL');
  const target = new URL(url),
    name = decodeURIComponent(target.pathname.slice(1));
  if (
    target.protocol !== 'mysql:' ||
    !name ||
    name.length > 64 ||
    name.includes(String.fromCharCode(0)) ||
    name.includes('/') ||
    name.includes('\\')
  )
    throw new Error('无效的 MySQL 库名');
  const serverUrl = new URL(target);
  serverUrl.pathname = '/';
  const c = await mysql.createConnection({
    uri: serverUrl.href,
    multipleStatements: false,
    charset: 'utf8mb4',
  });
  const lock =
    'treasure_migrate_' +
    createHash('sha256').update(name).digest('hex').slice(0, 32);
  try {
    const [[version]] = await c.query('SELECT VERSION() AS version');
    if (!version.version.startsWith('8.'))
      throw new Error('此项目要求 MySQL 8，当前为 ' + version.version);
    await c.query(
      'CREATE DATABASE IF NOT EXISTS ?? CHARACTER SET utf8mb4 COLLATE utf8mb4_bin',
      [name],
    );
    await c.changeUser({ database: name });
    const [[held]] = await c.query('SELECT GET_LOCK(?, 30) AS held', [lock]);
    if (!held.held) throw new Error('数据库迁移正在由其他进程执行');
    await c.query(
      'CREATE TABLE IF NOT EXISTS treasure_schema_migrations (name varchar(255) NOT NULL, step int NOT NULL, checksum char(64) NOT NULL, appliedAt varchar(32) NOT NULL, PRIMARY KEY(name,step)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin',
    );
    const folder = resolve(
      fileURLToPath(new URL('../drizzle/mysql/', import.meta.url)),
    );
    let applied = 0;
    for (const file of readdirSync(folder)
      .filter((f) => f.endsWith('.sql'))
      .sort()) {
      const statements = readFileSync(resolve(folder, file), 'utf8')
        .split('--> statement-breakpoint')
        .map((s) => s.trim())
        .filter(Boolean);
      for (const [step, sql] of statements.entries()) {
        const checksum = createHash('sha256').update(sql).digest('hex');
        const [[old]] = await c.query(
          'SELECT checksum FROM treasure_schema_migrations WHERE name=? AND step=?',
          [file, step],
        );
        if (old) {
          if (old.checksum !== checksum)
            throw new Error('已应用迁移被修改：' + file);
          continue;
        }
        try {
          await c.query(sql);
        } catch (e) {
          throw new Error(
            `${file} 第 ${step + 1} 条失败：${e.sqlMessage || e.code}`,
          );
        }
        await c.query(
          'INSERT INTO treasure_schema_migrations VALUES(?,?,?,?)',
          [file, step, checksum, new Date().toISOString()],
        );
        applied++;
      }
    }
    console.log(
      `MySQL ${version.version} / ${name}：迁移完成（新执行 ${applied} 条）`,
    );
  } finally {
    await c.query('SELECT RELEASE_LOCK(?)', [lock]).catch(() => {});
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
  } catch (e) {
    console.error(e.message);
    process.exitCode = 1;
  }
}
