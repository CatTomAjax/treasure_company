import mysql from 'mysql2/promise';
import { startProdServer } from 'vinext/server/prod-server';
import { MySqlDatabase, createPool } from '../db/mysql.ts';
import { migrate } from '../scripts/mysql-migrate.mjs';
import { loadEnvironment } from '../scripts/mysql-env.mjs';
import { snapshotBuild } from '../scripts/build-snapshot.mjs';
const buildSnapshots = new Map();

export async function isolatedDatabase(label = 'qa') {
  loadEnvironment();
  const target = new URL(process.env.DATABASE_URL);
  const name =
    'treasure_company_' +
    label +
    '_' +
    crypto.randomUUID().replaceAll('-', '').slice(0, 12);
  target.pathname = '/' + name;
  const url = target.href;
  await migrate(url);
  return {
    url,
    name,
    async drop() {
      if (!/^treasure_company_(qa|agents)_\w{12}$/.test(name))
        throw Error('Refusing non-test schema cleanup');
      const admin = new URL(url);
      admin.pathname = '/';
      const c = await mysql.createConnection(admin.href);
      try {
        await c.query('DROP DATABASE ??', [name]);
      } finally {
        await c.end();
      }
    },
  };
}

export function createTestRuntime({
  url,
  port = 3006,
  bindings = {},
  modelMock,
}) {
  Object.assign(process.env, bindings, { DATABASE_URL: url });
  const nativeFetch = (globalThis.__treasureNativeFetch ||= globalThis.fetch);
  // Vinext normally installs its cache wrapper on the first request. Keep the
  // isolated test's transport in charge so no simulated model request escapes.
  if (modelMock)
    globalThis[Symbol.for('vinext.fetchCache.patchInstalled')] = true;
  const installModelMock = () => {
    if (modelMock)
      globalThis.fetch = (input, init) => {
        const request = new Request(input, init),
          host = new URL(request.url).hostname;
        return ['api.deepseek.com', 'api.openai.com'].includes(host)
          ? modelMock(request).catch((e) => {
              console.error('Mock model failed', e);
              throw e;
            })
          : nativeFetch(input, init);
      };
  };
  installModelMock();
  const database = new MySqlDatabase(createPool(url));
  if (!buildSnapshots.has(url))
    buildSnapshots.set(
      url,
      snapshotBuild('dist', 'work/mysql8-migration/agent-builds'),
    );
  const ready = buildSnapshots
    .get(url)
    .then((outDir) => startProdServer({ port, host: '127.0.0.1', outDir }))
    .then((result) => {
      installModelMock();
      return result;
    });
  return {
    database,
    ready,
    dispatchFetch: (input, init) =>
      nativeFetch(
        new URL(new URL(input).pathname, 'http://127.0.0.1:' + port),
        init,
      ),
    async dispose() {
      const { server } = await ready;
      server.closeIdleConnections();
      await new Promise((done) => server.close(done));
      await database.pool.end();
    },
  };
}
