import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { modules } from '../lib/platform-config.ts';
const base = 'http://127.0.0.1:3004',
  cookie = readFileSync('work/platform-test-cookie.txt', 'utf8'),
  fixture = JSON.parse(readFileSync('work/platform-test-fixture.json', 'utf8')),
  companyId = fixture.companyA,
  suffix = crypto.randomUUID().slice(0, 8);
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
  assert.equal(r.status, status, JSON.stringify(d));
  checks++;
  return d;
}
const original = (await req('/api/platform?companyId=' + companyId)).records,
  created = [];
for (const kind of Object.keys(modules).filter((k) => modules[k].internal)) {
  await req(
    '/api/platform',
    {
      action: 'record.create',
      companyId,
      kind,
      title: '禁止手动创建的系统记录',
      owner: '模块验收',
      dueDate: '',
      data: {},
    },
    403,
  );
}
for (const [kind, spec] of Object.entries(modules).filter(
  ([k, spec]) =>
    !spec.internal &&
    ![
      'contract',
      'order',
      'collectionPlan',
      'afterSale',
      'renewal',
      'invoiceRequest',
      'taxHandoff',
    ].includes(k),
)) {
  if (
    original.some((r) => r.kind === kind) &&
    !['material', 'video', 'cost', 'lease', 'supplierQuote'].includes(kind)
  )
    continue;
  const data = {};
  for (const f of spec.fields) {
    if (!f.required) {
      data[f.key] = '';
      continue;
    }
    if (f.type === 'ref') {
      const target = [...created, ...original].find(
        (r) =>
          r.kind === f.ref &&
          (!['requirement', 'quotation', 'aiRole'].includes(r.kind) ||
            r.status === '已确认'),
      );
      if (!target) throw new Error('Missing reference ' + f.ref);
      data[f.key] = target.id;
    } else if (f.type === 'select') data[f.key] = f.options[0];
    else if (f.type === 'date') data[f.key] = '2030-01-01';
    else if (f.type === 'datetime') data[f.key] = '2030-01-01T10:00';
    else if (f.type === 'url')
      data[f.key] = 'https://example.test/official-fixture';
    else if (f.type === 'money') data[f.key] = '100.00';
    else if (f.type === 'number') data[f.key] = String(Math.max(f.min || 1, 1));
    else data[f.key] = '独立模块验收资料 ' + f.label;
  }
  if (kind === 'material') {
    data.content =
      '品牌服务方案\n\n01 目标与范围\n围绕客户已确认的需求开展服务。\n\n02 交付计划\n分阶段提交可编辑成果。\n\n03 费用与条件\n金额以确认报价为准。\n\n待确认：联系方式、客户事实和正式交付日期。';
    data.brandColor = '#2EA8C7';
  }
  if (kind === 'video') {
    data.script = '品牌介绍\n交付方案';
    data.seconds = '1';
    data.ratio = '16:9';
  }
  if (kind === 'cost') {
    data.basis = '实际';
    data.amount = '100.00';
  }
  if (kind === 'lease') {
    data.endDate = '2030-12-31';
  }
  const r = (
    await req(
      '/api/platform',
      {
        action: 'record.create',
        companyId,
        kind,
        title: '模块验收-' + kind + '-' + suffix,
        owner: '模块验收负责人',
        dueDate: '2030-12-31',
        data,
      },
      201,
    )
  ).record;
  created.push(r);
  assert.equal(r.kind, kind);
  checks++;
  if (kind === 'purchase') {
    let current = r;
    for (const status of ['待审核', '已确认'])
      current = (
        await req('/api/platform', {
          action: 'record.transition',
          companyId,
          id: r.id,
          version: current.version,
          status,
        })
      ).record;
    Object.assign(r, current);
  }
}
const after = await req('/api/platform?companyId=' + companyId);
for (const kind of Object.keys(modules).filter(
  (k) =>
    !modules[k].internal &&
    ![
      'contract',
      'order',
      'collectionPlan',
      'afterSale',
      'renewal',
      'invoiceRequest',
      'taxHandoff',
    ].includes(k),
)) {
  assert.ok(
    after.records.some((r) => r.kind === kind),
    'No durable record for ' + kind,
  );
  checks++;
}
const cost = created.find((r) => r.kind === 'cost');
if (cost) {
  let r = cost;
  for (const status of ['待审核', '已确认'])
    r = (
      await req('/api/platform', {
        action: 'record.transition',
        companyId,
        id: r.id,
        version: r.version,
        status,
      })
    ).record;
  assert.equal(r.status, '已确认');
  checks++;
}
const quote = created.find((r) => r.kind === 'supplierQuote');
if (quote) {
  let r = (
    await req('/api/platform', {
      action: 'record.transition',
      companyId,
      id: quote.id,
      version: quote.version,
      status: '已选定',
    })
  ).record;
  const bill = await req('/api/platform', {
    action: 'bill.fromSource',
    companyId,
    id: r.id,
    version: r.version,
  });
  const b = (
    await req('/api/finance/business?companyId=' + companyId)
  ).bills.find((b) => b.id === bill.id);
  assert.equal(b.kind, 'payable');
  assert.equal(b.amountCents, 10000);
  checks++;
}
const material = created.find((r) => r.kind === 'material'),
  video = created.find((r) => r.kind === 'video');
writeFileSync(
  'work/platform-module-fixtures.json',
  JSON.stringify({
    materialId: material?.id,
    videoId: video?.id,
    materialTitle: material?.title,
    videoTitle: video?.title,
  }),
);
writeFileSync(
  'work/platform-modules-result.json',
  JSON.stringify(
    {
      checks,
      kinds: Object.keys(modules).filter(
        (k) =>
          !modules[k].internal &&
          ![
            'contract',
            'order',
            'collectionPlan',
            'afterSale',
            'renewal',
            'invoiceRequest',
            'taxHandoff',
          ].includes(k),
      ),
      created: created.length,
      passed: true,
    },
    null,
    2,
  ),
);
console.log(
  `PASS ${checks} checks across ${Object.keys(modules).filter((k) => !modules[k].internal && !['contract', 'order', 'collectionPlan', 'afterSale', 'renewal', 'invoiceRequest', 'taxHandoff'].includes(k)).length} module schemas, including procurement-to-payable and sensitive business records.`,
);
