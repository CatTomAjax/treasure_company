import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startProdServer } from 'vinext/server/prod-server';
import { database } from '../db/mysql.ts';
import { loadEnvironment } from './mysql-env.mjs';
import { startAgentWorker } from './agent-worker.mjs';
import { snapshotBuild } from './build-snapshot.mjs';

process.chdir(fileURLToPath(new URL('../', import.meta.url)));
loadEnvironment();
const data = resolve(process.env.LOCAL_DATA_DIR || 'data');
mkdirSync(data, { recursive: true });
const vault = resolve(data, 'integration-master.key');
if (!process.env.PLATFORM_MASTER_KEY && !existsSync(vault))
  writeFileSync(vault, randomBytes(32).toString('hex'), {
    flag: 'wx',
    mode: 0o600,
  });
process.env.PLATFORM_MASTER_KEY ||= readFileSync(vault, 'utf8').trim();
process.env.LOCAL_AI_DISABLED ||= '0';
process.env.AGENT_WORKER_TOKEN ||= randomBytes(32).toString('hex');
const port = Number(process.env.PORT || 3003);
let worker, server;
try {
  const db = database();
  const state = await db.prepare('SELECT VERSION() AS version').first();
  if (!String(state.version).startsWith('8.'))
    throw new Error('数据库必须是 MySQL 8');
  const distribution =
    process.env.LOCAL_DIST_DIR ||
    (await snapshotBuild(resolve('dist'), resolve(data, 'runtime-builds')));
  ({ server } = await startProdServer({
    port,
    host: '127.0.0.1',
    outDir: resolve(distribution),
  }));
  const base = 'http://127.0.0.1:' + port;
  worker = startAgentWorker(
    {
      database: db,
      dispatchFetch: (input, init) =>
        fetch(new URL(new URL(input).pathname, base), init),
    },
    {
      token: process.env.AGENT_WORKER_TOKEN,
      onError: (message) => console.error(message),
    },
  );
  console.log('MySQL 8 连接已就绪，后台队列已启动');
} catch (e) {
  console.error(
    '启动失败：' +
      (e.code === 'ERR_MODULE_NOT_FOUND' ? e.message : e.code || e.message),
  );
  await database().pool.end();
  process.exitCode = 1;
}
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, async () => {
    await worker?.stop();
    await new Promise((done) => (server ? server.close(done) : done()));
    await database().pool.end();
    process.exit(0);
  });
