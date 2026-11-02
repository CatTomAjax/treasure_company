import assert from 'node:assert/strict';
import { rolldown } from 'rolldown';
const bundle = await rolldown({ input: 'lib/agent-checks.ts', platform: 'node' });
const { output } = await bundle.generate({ format: 'esm' });
await bundle.close();
const { checkCitations, normalizeCitations, allowedCitations, permittedRecords } = await import(
  'data:text/javascript;base64,' + Buffer.from(output[0].code).toString('base64')
);
const knowledge = [{id:'known-source',version:'v1'}];
const run = {snapshot:{records:[
  {id:'project-1',version:'p1',kind:'project'},
  {id:'customer-1',version:'c1',kind:'customer'},
]}};
const spec = {capabilities:['schedule']};
assert.equal(checkCitations('[known-source@v1]',knowledge).invalid.length,0);
assert.equal(checkCitations('[来源known-source@版本v1]',knowledge).invalid.length,0);
assert.equal(checkCitations('[known-source@v2]',knowledge).invalid.length,1);
assert.equal(checkCitations('[来源unknown@v1]',knowledge).invalid.length,1);
assert.equal(checkCitations('[other-known-source@v1]',knowledge).invalid.length,1);
assert.deepEqual(permittedRecords(run,spec).map(r=>r.id),['project-1']);
assert.equal(checkCitations('[project-1@p1]',allowedCitations(run,spec,knowledge)).invalid.length,0);
assert.equal(checkCitations('[customer-1@c1]',allowedCitations(run,spec,knowledge)).invalid.length,1);
assert.equal(checkCitations('[project-1@p2]',allowedCitations(run,spec,knowledge)).invalid.length,1);
assert.equal(checkCitations('[known-source@v1]',[]).invalid.length,1);
const uuid = {id:'6f91df24-6998-44e9-9467-e8d9c4f0153a',version:'8ad11a20-79ef-4ccb-b8d9-a33f3f885ad0'};
const formatted = `[来源${uuid.id}@8ad11a20-79ef-4ccb-b8d9a33f3f885ad0]`;
assert.equal(normalizeCitations(formatted,[uuid]),`[${uuid.id}@${uuid.version}]`);
assert.equal(checkCitations(`[${uuid.id}@8ad11a20-79ef-4ccb-b8d9-a33f3f885ad1]`,[uuid]).invalid.length,1);
console.log('PASS: 12 citation and capability boundary assertions');
