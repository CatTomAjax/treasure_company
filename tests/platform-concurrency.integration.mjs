import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
const base = 'http://127.0.0.1:3004',
  cookie = readFileSync('work/platform-test-cookie.txt', 'utf8'),
  fixture = JSON.parse(readFileSync('work/platform-test-fixture.json', 'utf8')),
  companyId = fixture.companyA;
let checks = 0;
async function req(path, body, expected = 200) {
  const response = await fetch(base + path, {
    method: body ? 'POST' : 'GET',
    headers: {
      Cookie: cookie,
      ...(body ? { 'Content-Type': 'application/json', Origin: base } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await response.json();
  if (expected !== null) {
    assert.equal(response.status, expected, JSON.stringify(data));
    checks++;
  }
  return { status: response.status, data };
}
const load = async () =>
  (await req('/api/platform?companyId=' + companyId)).data;
const records = (await load()).records,
  acceptance = records.find(
    (r) => r.kind === 'acceptance' && r.data.amount === '10000',
  ),
  project = records.find((r) => r.id === fixture.projectId);
async function createAccepted(title) {
  let r = (
    await req(
      '/api/platform',
      {
        action: 'record.create',
        companyId,
        kind: 'acceptance',
        title,
        owner: '并发验收',
        dueDate: '2030-12-31',
        data: { ...acceptance.data, amount: '40000' },
      },
      201,
    )
  ).data.record;
  for (const status of ['待审核', '已确认'])
    r = (
      await req('/api/platform', {
        action: 'record.transition',
        companyId,
        id: r.id,
        version: r.version,
        status,
      })
    ).data.record;
  return r;
}
const a = await createAccepted('并发应收A'),
  b = await createAccepted('并发应收B'),
  results = await Promise.all(
    [a, b].map((r) =>
      req(
        '/api/platform',
        { action: 'bill.fromSource', companyId, id: r.id, version: r.version },
        null,
      ),
    ),
  );
assert.equal(results.filter((r) => r.status === 200).length, 1);
assert.ok(results.some((r) => [400, 409].includes(r.status)));
checks += 2;
let finances = (await req('/api/finance/business?companyId=' + companyId)).data;
const links = (await load()).links.filter(
    (l) => l.action === 'bill.fromSource',
  ),
  ids = new Set(
    records
      .filter(
        (r) =>
          ['acceptance', 'change'].includes(r.kind) &&
          r.data.projectId === project.id,
      )
      .map((r) => r.id),
  );
ids.add(a.id);
ids.add(b.id);
const billIds = new Set(
  links.filter((l) => ids.has(l.sourceId)).map((l) => l.targetId),
);
const total = finances.bills
  .filter((b) => billIds.has(b.id) && b.status !== 'void')
  .reduce((s, b) => s + b.amountCents, 0);
assert.equal(total, 5000000);
checks++;
const original = (await load()).records.find((r) => r.id === acceptance.id);
await req(
  '/api/platform',
  {
    action: 'record.transition',
    companyId,
    id: original.id,
    version: original.version,
    status: '草稿',
  },
  409,
);
const copied = (
  await req(
    '/api/platform',
    {
      action: 'record.copy',
      companyId,
      id: original.id,
      version: original.version,
    },
    201,
  )
).data.record;
assert.equal(copied.status, '草稿');
assert.notEqual(copied.id, original.id);
checks += 2;
const meter = (await load()).records.find((r) => r.kind === 'meter'),
  oldPrice = meter.data.price;
await req(
  '/api/platform',
  {
    action: 'record.save',
    companyId,
    id: meter.id,
    kind: 'meter',
    title: meter.title,
    owner: meter.owner,
    dueDate: meter.dueDate,
    version: meter.version,
    data: { ...meter.data, price: '9.99' },
  },
  409,
);
assert.equal(
  (await load()).records.find((r) => r.id === meter.id).data.price,
  oldPrice,
);
checks++;
const reading = (await load()).records.find(
  (r) => r.kind === 'reading' && r.status === '已确认',
);
let overlap = (
  await req(
    '/api/platform',
    {
      action: 'record.create',
      companyId,
      kind: 'reading',
      title: '重叠账期验收',
      owner: '测试',
      dueDate: '2030-12-31',
      data: reading.data,
    },
    201,
  )
).data.record;
overlap = (
  await req('/api/platform', {
    action: 'record.transition',
    companyId,
    id: overlap.id,
    version: overlap.version,
    status: '待审核',
  })
).data.record;
await req(
  '/api/platform',
  {
    action: 'record.transition',
    companyId,
    id: overlap.id,
    version: overlap.version,
    status: '已确认',
  },
  409,
);
const firstBill = finances.bills.find(
  (b) => billIds.has(b.id) && b.amountCents === 1000000,
);
const account = (
  await req(
    '/api/finance/business',
    {
      action: 'account.create',
      companyId,
      name: '闭环收款账户-' + crypto.randomUUID(),
      type: '银行账户',
      opening: '0',
    },
    201,
  )
).data.id;
await req('/api/finance/business', {
  action: 'bill.review',
  companyId,
  id: firstBill.id,
  version: firstBill.version,
  status: 'approved',
  reason: '',
});
finances = (await req('/api/finance/business?companyId=' + companyId)).data;
let bill = finances.bills.find((b) => b.id === firstBill.id);
await req('/api/finance/business', {
  action: 'payment.create',
  companyId,
  id: bill.id,
  version: bill.version,
  accountId: account,
  amount: '3000.00',
  date: '2030-01-01',
  reference: 'TEST-PARTIAL',
  note: '仅独立验收',
});
finances = (await req('/api/finance/business?companyId=' + companyId)).data;
bill = finances.bills.find((b) => b.id === firstBill.id);
assert.equal(bill.paidCents, 300000);
checks++;
await req('/api/finance/business', {
  action: 'payment.create',
  companyId,
  id: bill.id,
  version: bill.version,
  accountId: account,
  amount: '7000.00',
  date: '2030-01-02',
  reference: 'TEST-FULL',
  note: '仅独立验收',
});
finances = (await req('/api/finance/business?companyId=' + companyId)).data;
assert.equal(finances.bills.find((b) => b.id === bill.id).paidCents, 1000000);
assert.equal(
  finances.accounts.find((a) => a.id === account).balanceCents,
  1000000,
);
checks += 2;
const answer = (
  await req('/api/platform/analyze', {
    companyId,
    question: '当前应收余额和项目成本多少？',
  })
).data;
assert.match(answer.answer, /应收余额/);
assert.ok(answer.sources.length > 0);
checks += 2;
writeFileSync(
  'work/platform-concurrency-result.json',
  JSON.stringify(
    {
      checks,
      passed: true,
      scope:
        'concurrent receivable caps / rollback / immutable referenced versions / meter snapshots / reading periods / acceptance-to-full-payment / actual-data query',
    },
    null,
    2,
  ),
);
console.log(`PASS ${checks} integrity and full business payment checks.`);
