import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
const base = 'http://127.0.0.1:3004',
  fixture = JSON.parse(readFileSync('work/ppt-test-fixture.json', 'utf8')),
  cookie = fixture.cookie;
let checks = 0;
async function req(path, body, status = 200) {
  const r = await fetch(base + path, {
    method: body ? 'POST' : 'GET',
    headers: {
      Cookie: cookie,
      ...(body ? { 'Content-Type': 'application/json', Origin: base } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const d = await r.json();
  assert.equal(r.status, status, JSON.stringify(d).slice(0, 200));
  checks++;
  return d;
}
const company = (
  await req(
    '/api/platform/team',
    {
      action: 'tenant.create',
      companyId: 'park',
      name: '新界面关联验收-' + crypto.randomUUID().slice(0, 6),
    },
    201,
  )
).id;
let data = await req(`/api/platform/ppt?companyId=${company}`);
async function act(action, body = {}) {
  data = await req('/api/platform/ppt', {
    companyId: company,
    version: data.version,
    action,
    ...body,
  });
  return data;
}
function check(value) {
  assert.ok(value);
  checks++;
}
await req(
  '/api/platform/ppt',
  {
    companyId: company,
    version: data.version,
    action: 'requirement.confirm',
    id: 'requirement-1',
    checks: [true, false, true],
  },
  400,
);
await act('requirement.confirm', {
  id: 'requirement-1',
  checks: [true, true, true],
});
const q = data.state.collections.quotations.find(
  (x) => x.id === data.state.settings.activeQuotation,
);
check(q?.requirementId === 'requirement-1');
const quoteCount = data.state.collections.quotations.length;
await act('requirement.confirm', {
  id: 'requirement-1',
  checks: [true, true, true],
});
check(data.state.collections.quotations.length === quoteCount);
await act('quotation.confirm', {
  id: q.id,
  content: '独立验收方案与交付范围',
  checks: [true, true],
});
const project = data.state.collections.projects.find(
  (x) => x.id === data.state.settings.activeProject,
);
check(project?.quotationId === q.id);
check(
  data.state.collections.tasks.filter((t) => t.project === project.id)
    .length === 3,
);
await act('demand.connect', { id: 'demand-2' });
const order = data.state.collections.orders.find(
  (x) => x.id === data.state.settings.activeOrder,
);
check(order?.demandId === 'demand-2');
check(
  data.state.collections.communications.some((x) => x.orderId === order.id),
);
await act('order.advance', { id: order.id, stage: 1 });
await act('order.advance', { id: order.id, stage: 2 });
await req(
  '/api/platform/ppt',
  {
    companyId: company,
    version: data.version,
    action: 'order.advance',
    id: order.id,
    stage: 3,
  },
  400,
);
await act('item.save', {
  collection: 'deliverables',
  item: {
    id: '',
    title: '客户方案.docx',
    orderId: order.id,
    status: '待确认',
    content: '交付内容已整理',
    type: 'Word',
    version: 'v1.0',
    owner: '验收员',
  },
});
const output = data.state.collections.deliverables.find(
  (x) => x.orderId === order.id,
);
await act('order.advance', { id: order.id, stage: 3 });
await req(
  '/api/platform/ppt',
  {
    companyId: company,
    version: data.version,
    action: 'order.advance',
    id: order.id,
    stage: 4,
  },
  400,
);
await act('item.save', {
  collection: 'deliverables',
  item: { ...output, status: '已确认' },
});
await act('order.advance', { id: order.id, stage: 4 });
check(data.state.collections.receivables.some((r) => r.orderId === order.id));
await act('space.book', { id: 'space-0', date: '2026-11-18' });
check(data.state.collections.bookings.some((b) => b.spaceId === 'space-0'));
check(
  data.state.collections.spaces.find((s) => s.id === 'space-0').status ===
    '已预约',
);
await req(
  '/api/platform/ppt',
  {
    companyId: company,
    version: data.version,
    action: 'space.book',
    id: 'space-0',
    date: '2026-11-18',
  },
  400,
);
await act('space.renew', { id: 'space-2', date: '2026-12-01' });
check(data.state.collections.leases.some((l) => l.spaceId === 'space-2'));
const meter = data.state.collections.meters[0];
await act('item.save', {
  collection: 'meters',
  item: { ...meter, reading: String(Number(meter.reading) + 20) },
});
const reading = data.state.collections.readings[0];
check(reading.usage === '20');
check(data.state.collections.bills.some((b) => b.sourceId === reading.id));
await req(
  '/api/platform/ppt',
  {
    companyId: company,
    version: data.version,
    action: 'item.save',
    collection: 'meters',
    item: { ...meter, reading: '10' },
  },
  400,
);
const bill = data.state.collections.bills.find(
  (b) => b.sourceId === reading.id,
);
await act('item.save', {
  collection: 'bills',
  item: { ...bill, status: '已收款' },
});
check(data.state.collections.payments.some((p) => p.billId === bill.id));
await act('template.apply', { id: 'template-2' });
const active = data.state.collections.projects.find(
  (p) => p.id === data.state.settings.activeProject,
);
check(active.templateId === 'template-2');
check(
  data.state.collections.tasks.filter((t) => t.project === active.id).length ===
    4,
);
const run = data.state.collections.runs.find(
  (r) => r.id === data.state.settings.activeRun,
);
check(run.stage === '0');
await act('workflow.advance');
await act('workflow.advance');
check(data.state.collections.documents.some((d) => d.runId === run.id));
check(data.state.collections.contents.some((c) => c.runId === run.id));
await act('workflow.advance', { approved: true });
await act('workflow.advance');
check(
  data.state.collections.knowledge.some(
    (k) => k.title === run.title + '交付复盘',
  ),
);
const doc = data.state.collections.documents.find((d) => d.runId === run.id);
await act('document.generate', {
  id: doc.id,
  instruction: '围绕产品资料生成项目实施建议',
});
check(
  data.state.collections.documents
    .find((d) => d.id === doc.id)
    .content.includes('围绕产品资料生成项目实施建议'),
);
await act('content.generate', {
  title: '创作需求验收',
  type: '活动策划',
  brief: '周五举办产品演示和企业交流，面向研发团队。',
});
check(data.state.collections.contents[0].content.includes('面向研发团队'));
const question = await req('/api/platform/ppt', {
  companyId: company,
  version: data.version,
  action: 'knowledge.ask',
  question: '量子引力黑洞核聚变',
});
check(question.sources.length === 0);
const version = await req('/api/platform/version');
check(version.interface === 'ppt-console' && version.version.length === 16);
const html = await fetch(base + '/');
check(html.headers.get('cache-control')?.includes('no-store'));
const latest = await req(`/api/platform/ppt?companyId=${company}`);
check(latest.state.collections.bookings.length > 0);
check(latest.state.collections.payments.length > 0);
check((await req(`/api/platform?companyId=${company}`)).records.length === 0);
writeFileSync(
  'output/platform/ppt-linked-operations-test.json',
  JSON.stringify(
    { checks, company, linkedWorkflows: true, version: version.version },
    null,
    2,
  ),
);
console.log(`新界面关联流程验收通过：${checks}项。`);
