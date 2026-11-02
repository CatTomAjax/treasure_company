import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { loadEnvironment } from './mysql-env.mjs';
import { migrate } from './mysql-migrate.mjs';
import { sourceFingerprint, writeBuildInfo } from './build-info.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
process.chdir(root);
loadEnvironment();
const servicePort = Number(process.env.PORT || 3003);
if (!Number.isInteger(servicePort) || servicePort < 1 || servicePort > 65535)
  throw new Error('服务端口必须是 1 到 65535 的整数');
let child;
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () => (child ? child.kill(signal) : process.exit(0)));
try {
  const probe = createServer();
  await new Promise((done, reject) => {
    probe.once('error', () =>
      reject(new Error(`端口 ${servicePort} 已占用，请先关闭已有服务`)),
    );
    probe.listen(servicePort, '127.0.0.1', () => probe.close(done));
  });
  await migrate();
  let built;
  try {
    built = JSON.parse(
      readFileSync(resolve(root, 'dist/client/build-info.json'), 'utf8'),
    );
  } catch {}
  if (
    !existsSync(resolve(root, 'dist/server/index.js')) ||
    built?.version !== sourceFingerprint(root)
  ) {
    writeBuildInfo(root);
    const code = await new Promise((done, reject) => {
      const build = spawn(
        process.execPath,
        [resolve(root, 'node_modules/vinext/dist/cli.js'), 'build'],
        { cwd: root, env: process.env, stdio: 'inherit', windowsHide: true },
      );
      child = build;
      build.once('error', reject);
      build.once('exit', done);
    });
    child = undefined;
    if (code !== 0) throw new Error('新版构建失败，请检查构建日志');
  }
  console.log(`前海创客中心 · MySQL 8 版：http://localhost:${servicePort}`);
  child = spawn(process.execPath, [resolve(root, 'scripts/serve-built.mjs')], {
    cwd: root,
    env: { ...process.env, PORT: String(servicePort) },
    stdio: 'inherit',
    windowsHide: true,
  });
  if (!process.argv.includes('--no-open') && process.platform === 'win32') {
    const timer = setInterval(async () => {
      try {
        const r = await fetch(`http://127.0.0.1:${servicePort}/api/platform/version`);
        if (r.ok) {
          clearInterval(timer);
          spawn(
            'powershell.exe',
            [
              '-NoProfile',
              '-NonInteractive',
              '-Command',
              `Start-Process 'http://localhost:${servicePort}/'`,
            ],
            { windowsHide: true, stdio: 'ignore' },
          );
        }
      } catch {}
    }, 1000);
    child.once('exit', () => clearInterval(timer));
  }
  process.exitCode = await new Promise((done, reject) => {
    child.once('error', reject);
    child.once('exit', (code) => done(code ?? 0));
  });
} catch (e) {
  console.error('启动失败：' + e.message);
  process.exitCode = 1;
}
