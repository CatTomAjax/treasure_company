import assert from 'node:assert/strict';
import { mkdirSync, openSync, closeSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { MySqlDatabase, createPool } from '../db/mysql.ts';
import { isolatedDatabase } from './mysql-runtime.mjs';

const target = await isolatedDatabase(),
  folder = resolve('work/mysql8-migration/qa-' + target.name);
mkdirSync(folder, { recursive: true });
const db = new MySqlDatabase(createPool(target.url)),
  stamp = new Date().toISOString();
const report = { database: target.name, cases: [], suites: [], passed: false };
let child;
try {
  const [tables] = await db.pool.query(
    'SELECT TABLE_NAME AS name FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE()',
  );
  assert.ok(tables.every((t) => t.name.startsWith('treasure_')));
  report.cases.push('All tables use treasure_ prefix');
  await db
    .prepare('INSERT INTO treasure_finance_companies VALUES(?,?,?)')
    .bind('case-sensitive', '测试😀', stamp)
    .run();
  await assert.rejects(
    db.batch([
      db
        .prepare('INSERT INTO treasure_finance_companies VALUES(?,?,?)')
        .bind('rollback', '回滚', stamp),
      db
        .prepare('INSERT INTO treasure_finance_companies VALUES(?,?,?)')
        .bind('case-sensitive', '冲突', stamp),
    ]),
    /UNIQUE/,
  );
  assert.equal(
    await db
      .prepare('SELECT * FROM treasure_finance_companies WHERE id=?')
      .bind('rollback')
      .first(),
    null,
  );
  report.cases.push('Atomic rollback and duplicate conflict');
  const ignored = await db
    .prepare(
      'INSERT INTO treasure_finance_companies VALUES(?,?,?) ON DUPLICATE KEY UPDATE id=id',
    )
    .bind('case-sensitive', '测试😀', stamp)
    .run();
  assert.equal(ignored.meta.changes, 0);
  report.cases.push('No-op upsert reports zero');
  assert.equal(
    await db
      .prepare('SELECT * FROM treasure_finance_companies WHERE id=?')
      .bind('CASE-SENSITIVE')
      .first(),
    null,
  );
  report.cases.push('Binary collation preserves identifiers');
  await db
    .prepare('DELETE FROM treasure_finance_companies WHERE id=?')
    .bind('case-sensitive')
    .run();
  const log = openSync(resolve(folder, 'server.log'), 'w');
  child = spawn(process.execPath, ['scripts/serve-built.mjs'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      DATABASE_URL: target.url,
      PORT: '3004',
      LOCAL_DATA_DIR: resolve(folder, 'data'),
      LOCAL_AI_DISABLED: '1',
      DEEPSEEK_API_KEY: '',
    },
    stdio: ['ignore', log, log],
    windowsHide: true,
  });
  closeSync(log);
  let ready = false;
  for (let i = 0; i < 100; i++) {
    if (child.exitCode !== null) throw Error('Test server exited');
    try {
      const r = await fetch('http://127.0.0.1:3004/api/platform/auth');
      if (r.ok) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((done) => setTimeout(done, 200));
  }
  assert.ok(ready, 'Test server ready');
  const suites = [
    'platform',
    'platform-modules',
    'platform-v2',
    'platform-concurrency',
    'finance-business',
    'tax',
    'workspace',
    'park',
    'ppt',
    'ppt-operations',
    'ppt-complete',
  ];
  for (const suite of suites) {
    const result = await new Promise((done, reject) => {
      let output = '';
      const p = spawn(
        process.execPath,
        [
          '--experimental-strip-types',
          '--import',
          './tests/register-types.mjs',
          '--import',
          './tests/session-fixture.mjs',
          `tests/${suite}.integration.mjs`,
        ],
        {
          env: {
            ...process.env,
            TEST_BASE_URL: 'http://127.0.0.1:3004',
            ...(!['platform', 'ppt', 'ppt-operations', 'ppt-complete'].includes(
              suite,
            )
              ? { TEST_SESSION_FILE: resolve('work/platform-test-cookie.txt') }
              : {}),
          },
          windowsHide: true,
          stdio: ['ignore', 'pipe', 'pipe'],
        },
      );
      p.stdout.on('data', (d) => (output += d));
      p.stderr.on('data', (d) => (output += d));
      p.once('error', reject);
      p.once('exit', (code) => done({ suite, code, output }));
    });
    writeFileSync(resolve(folder, suite + '.log'), result.output);
    report.suites.push({
      suite,
      code: result.code,
      summary: result.output.trim().split('\n').at(-1),
    });
    console.log(suite + ': ' + (result.code === 0 ? 'PASS' : 'FAIL'));
    if (result.code !== 0)
      throw Error(suite + ' failed: ' + result.output.slice(-1800));
  }
  report.passed = true;
} finally {
  if (child && child.exitCode === null) {
    child.kill();
    await new Promise((done) => child.once('exit', done));
  }
  await db.pool.end();
  writeFileSync(
    resolve(folder, 'report.json'),
    JSON.stringify(report, null, 2),
  );
  console.log('Report: ' + resolve(folder, 'report.json'));
  if (report.passed) await target.drop();
}
