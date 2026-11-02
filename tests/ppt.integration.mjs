import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:3004';
if (base !== 'http://127.0.0.1:3004')
  throw new Error('PPT验收只使用独立3004测试服务');
let cookie = '',
  checks = 0;
async function req(path, body, status = 200, session = cookie) {
  const response = await fetch(base + path, {
    method: body ? 'POST' : 'GET',
    headers: {
      ...(body ? { 'Content-Type': 'application/json', Origin: base } : {}),
      ...(session ? { Cookie: session } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await response.json();
  assert.equal(
    response.status,
    status,
    `${body?.action || path}: ${JSON.stringify(data).slice(0, 200)}`,
  );
  checks++;
  return { data, response };
}
const credentials = JSON.parse(
  readFileSync('work/platform-test-credentials.json', 'utf8'),
);
await req('/api/platform/ppt?companyId=park', undefined, 401, '');
const auth = (await req('/api/platform/auth')).data;
const login = await req('/api/platform/auth', {
  ...credentials,
  action: auth.initialized ? 'login' : 'setup',
});
cookie = login.response.headers.get('set-cookie').split(';')[0];
const suffix = crypto.randomUUID().slice(0, 6);
const company = (
  await req(
    '/api/platform/team',
    {
      action: 'tenant.create',
      companyId: 'park',
      name: 'PPT逐页验收-' + suffix,
    },
    201,
  )
).data.id;
const other = (
  await req(
    '/api/platform/team',
    {
      action: 'tenant.create',
      companyId: 'park',
      name: 'PPT隔离验收-' + suffix,
    },
    201,
  )
).data.id;
let workspace = (await req(`/api/platform/ppt?companyId=${company}`)).data;
assert.equal(workspace.mode, 'demo');
assert.equal(workspace.state.collections.roles.length, 6);
assert.equal(workspace.state.collections.designs.length, 6);
assert.equal(workspace.state.collections.scenes.length, 6);
checks += 4;
const initialVersion = workspace.version;
async function act(action, body = {}) {
  const result = await req('/api/platform/ppt', {
    companyId: company,
    version: workspace.version,
    action,
    ...body,
  });
  workspace = result.data;
  return workspace;
}
await act('item.save', {
  collection: 'roles',
  item: {
    ...workspace.state.collections.roles[0],
    review: '验收审核人',
    tools: '文档生成,图像生成',
  },
});
assert.equal(workspace.state.collections.roles[0].review, '验收审核人');
checks++;
await req(
  '/api/platform/ppt',
  {
    companyId: company,
    version: initialVersion,
    action: 'settings.save',
    settings: { brandColor: '#ffeecc' },
  },
  409,
);
for (const collection of Object.keys(workspace.state.collections)) {
  const first = workspace.state.collections[collection][0] || {
    id: '',
    title: '空集合持久化验收-' + collection,
    status: '草稿',
    content: '独立测试数据',
  };
  await act('item.save', {
    collection,
    item: { ...first, qa: '已通过持久化验收' },
  });
  const reloaded = (await req(`/api/platform/ppt?companyId=${company}`)).data;
  assert.equal(
    reloaded.state.collections[collection][0].qa,
    '已通过持久化验收',
  );
  checks++;
}
const isolated = (await req(`/api/platform/ppt?companyId=${other}`)).data;
assert.equal(isolated.state.collections.roles[0].qa, undefined);
checks++;
await act('settings.save', {
  settings: { brandColor: '#ffeecc', videoRatio: '9:16', videoSpeed: '2' },
});
assert.equal(workspace.state.settings.videoRatio, '9:16');
checks++;
const reversed = workspace.state.collections.scenes.map((s) => s.id).reverse();
await act('scenes.reorder', { ids: reversed });
assert.deepEqual(
  workspace.state.collections.scenes.map((s) => s.id),
  reversed,
);
checks++;
await req(
  '/api/platform/ppt',
  {
    companyId: company,
    version: workspace.version,
    action: 'scenes.reorder',
    ids: ['bad'],
  },
  400,
);
await req(
  '/api/platform/ppt',
  {
    companyId: company,
    version: workspace.version,
    action: 'item.save',
    collection: 'scenes',
    item: { id: '', title: '非法时长', seconds: '-3' },
  },
  400,
);
await req(
  '/api/platform/ppt',
  {
    companyId: company,
    version: workspace.version,
    action: 'item.save',
    collection: 'bills',
    item: { id: '', title: '非法金额', amount: 'NaN' },
  },
  400,
);
const answer = (
  await req('/api/platform/ppt', {
    companyId: company,
    version: workspace.version,
    action: 'knowledge.ask',
    question: '如何开通企业空间？',
  })
).data;
assert.match(answer.answer, /企业空间/);
assert.ok(answer.sources.length);
checks += 2;
await req(
  '/api/platform/ppt',
  {
    companyId: company,
    version: workspace.version,
    action: 'workflow.advance',
  },
  400,
);
await act('workflow.advance', { approved: true });
assert.equal(workspace.state.settings.workflowStage, '3');
checks++;
const knowledgeBefore = workspace.state.collections.knowledge.length;
await act('workflow.advance');
assert.equal(workspace.state.collections.knowledge.length, knowledgeBefore + 1);
checks++;
await req(
  '/api/platform/ppt',
  {
    companyId: company,
    version: workspace.version,
    action: 'workflow.advance',
  },
  400,
);
await act('content.generate', { title: '独立验收文案' });
assert.match(workspace.state.collections.contents[0].content, /本地规则/);
checks++;
for (let i = 0; i < 3; i++) await act('policy.advance');
assert.equal(workspace.state.settings.policyStage, '3');
assert.ok(
  workspace.state.collections.contents.some((c) => c.type === '政策通知'),
);
checks += 2;
const image =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aJZkAAAAASUVORK5CYII=';
const upload = (
  await req(
    '/api/platform/ppt/files',
    { companyId: company, name: '验收.png', mime: 'image/png', data: image },
    201,
  )
).data;
const file = await fetch(base + upload.url, { headers: { Cookie: cookie } });
assert.equal(file.status, 200);
assert.equal(file.headers.get('content-type'), 'image/png');
assert.ok((await file.arrayBuffer()).byteLength > 50);
checks += 3;
await req(
  `/api/platform/ppt/files?companyId=${other}&id=${upload.id}`,
  undefined,
  404,
);
await req(
  '/api/platform/ppt/files',
  {
    companyId: company,
    name: '攻击.html',
    mime: 'text/html',
    data: btoa('test'),
  },
  400,
);
const live = (await req(`/api/platform?companyId=${company}`)).data;
assert.equal(live.records.length, 0);
checks++;
const viewer = {
  email: `ppt-viewer-${suffix}@example.test`,
  password: crypto.randomUUID() + 'A1',
  name: 'PPT只读验收',
};
await req(
  '/api/platform/team',
  { action: 'member.create', companyId: company, role: 'viewer', ...viewer },
  201,
);
const viewerLogin = await req(
  '/api/platform/auth',
  { action: 'login', ...viewer },
  200,
  '',
);
const viewerCookie = viewerLogin.response.headers
  .get('set-cookie')
  .split(';')[0];
await req(
  `/api/platform/ppt?companyId=${company}`,
  undefined,
  200,
  viewerCookie,
);
await req(`/api/platform/ppt?companyId=${other}`, undefined, 403, viewerCookie);
await req(
  '/api/platform/ppt',
  {
    companyId: company,
    version: workspace.version,
    action: 'settings.save',
    settings: { brandColor: '#FFFFFF' },
  },
  403,
  viewerCookie,
);
await req(
  '/api/platform/ppt/files',
  { companyId: company, name: '只读.png', mime: 'image/png', data: image },
  403,
  viewerCookie,
);
writeFileSync(
  'work/ppt-test-fixture.json',
  JSON.stringify({ company, other, cookie }),
);
writeFileSync(
  'output/platform/ppt-api-test.json',
  JSON.stringify(
    {
      checks,
      collections: Object.keys(workspace.state.collections).length,
      tenantIsolation: true,
      liveRecords: 0,
    },
    null,
    2,
  ),
);
console.log(
  `PPT接口验收通过：${checks}项；${Object.keys(workspace.state.collections).length}类数据持久化，业务数据库未混入演示记录。`,
);
