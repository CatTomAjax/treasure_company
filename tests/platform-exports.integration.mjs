import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
import assert from 'node:assert/strict';
const root = process.cwd(),
  out = resolve(root, 'work/platform-export-qa');
mkdirSync(out, { recursive: true });
const compile = (path) =>
  ts.transpileModule(readFileSync(resolve(root, path), 'utf8'), {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
    },
  }).outputText;
writeFileSync(resolve(out, 'config.mjs'), compile('lib/platform-config.ts'));
writeFileSync(
  resolve(out, 'client.mjs'),
  "import {writeFile} from 'node:fs/promises'; globalThis.exportQaWrites=[];export function saveBlob(name,blob){globalThis.exportQaWrites.push(blob.arrayBuffer().then(data=>writeFile(name,new Uint8Array(data))))}",
);
writeFileSync(
  resolve(out, 'export.mjs'),
  compile('lib/platform-export.ts')
    .replace(/(['"])\.\/platform-config\1/g, '"./config.mjs"')
    .replace(/(['"])\.\/platform-client\1/g, '"./client.mjs"'),
);
const { exportDocument } = await import(
  pathToFileURL(resolve(out, 'export.mjs')).href
);
const cookie = readFileSync('work/platform-test-cookie.txt', 'utf8'),
  fixture = JSON.parse(readFileSync('work/platform-test-fixture.json', 'utf8')),
  fixtures = JSON.parse(
    readFileSync('work/platform-module-fixtures.json', 'utf8'),
  );
const response = await fetch(
    'http://127.0.0.1:3004/api/platform?companyId=' + fixture.companyA,
    { headers: { Cookie: cookie } },
  ),
  data = await response.json(),
  material = data.records.find((r) => r.id === fixtures.materialId);
assert.ok(material);
process.chdir(out);
for (const format of ['md', 'docx', 'pptx', 'svg'])
  await exportDocument(material, format);
await Promise.all(globalThis.exportQaWrites);
let checks = 0;
const { default: JSZip } = await import('jszip');
for (const ext of ['md', 'docx', 'pptx', 'svg']) {
  const path = resolve(out, material.title + '.' + ext),
    bytes = readFileSync(path);
  assert.ok(bytes.length > 100);
  checks++;
  if (ext === 'docx' || ext === 'pptx') {
    const zip = await JSZip.loadAsync(bytes, { checkCRC32: true });
    assert.ok(zip.file('[Content_Types].xml'));
    assert.ok(
      zip.file(ext === 'docx' ? 'word/document.xml' : 'ppt/slides/slide1.xml'),
    );
    checks += 2;
  }
}
writeFileSync(
  resolve(root, 'work/platform-exports-result.json'),
  JSON.stringify(
    {
      checks,
      passed: true,
      files: readdirSync(out).filter((n) => /\.(docx|pptx|svg|md)$/.test(n)),
    },
    null,
    2,
  ),
);
console.log(
  `PASS ${checks} editable export package checks (DOCX/PPTX/SVG/Markdown).`,
);
