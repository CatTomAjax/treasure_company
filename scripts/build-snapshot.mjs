import {
  copyFileSync,
  readdirSync,
  existsSync,
  mkdirSync,
  readFileSync,
} from 'node:fs';
import { resolve } from 'node:path';

/** Keep a running server independent of another build replacing dist files. */
export async function snapshotBuild(source, destination) {
  const copyTree = (from, to) => {
    mkdirSync(to, { recursive: true });
    for (const entry of readdirSync(from, { withFileTypes: true })) {
      const input = resolve(from, entry.name),
        output = resolve(to, entry.name);
      if (entry.isDirectory()) copyTree(input, output);
      else copyFileSync(input, output);
    }
  };
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const id = readFileSync(
        resolve(source, 'server/BUILD_ID'),
        'utf8',
      ).trim();
      if (!existsSync(resolve(source, 'server/__vite_rsc_assets_manifest.js')))
        throw Error('Build is still being written');
      const target = resolve(destination, id.replace(/[^a-zA-Z0-9_-]/g, '_'));
      mkdirSync(target, { recursive: true });
      copyTree(source, target);
      if (
        readFileSync(resolve(source, 'server/BUILD_ID'), 'utf8').trim() !== id
      )
        throw Error('Build changed during snapshot');
      if (!existsSync(resolve(target, 'server/__vite_rsc_assets_manifest.js')))
        throw Error('Incomplete build snapshot');
      return target;
    } catch (e) {
      if (attempt === 4) throw e;
      await new Promise((done) => setTimeout(done, 500));
    }
  }
}
