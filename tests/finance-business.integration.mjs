import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:3002',
  suffix = crypto.randomUUID(),
  companies = [];
let checks = 0;
const check = (v, label) => {
  assert.ok(v, label);
  checks++;
};
async function call(body, status = 200, path = '/api/finance/business') {
  const r = await fetch(base + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const d = await r.json();
  assert.equal(r.status, status, `${body.action}: ${JSON.stringify(d)}`);
  checks++;
  return d;
}
async function get(id) {
  const r = await fetch(`${base}/api/finance/business?companyId=${id}`);
  assert.equal(r.status, 200);
  return r.json();
}
async function operation(companyId, id, action, extra = {}, status = 200) {
  const b = (await get(companyId)).bills.find((x) => x.id === id);
  return call({ companyId, id, version: b.version, action, ...extra }, status);
}
const sample = {
  kind: 'receivable',
  title: '验收租金',
  counterparty: '验收客户',
  category: '空间租赁',
  date: '2026-10-01',
  dueDate: '2026-10-10',
  amount: '1130.00',
  taxRate: '13',
  invoiceNo: '',
  note: '自动化验收数据',
};
try {
  const a = await call(
    { action: 'company.create', name: '财务接口验收-A-' + suffix },
    201,
  );
  companies.push(a.id);
  const b = await call(
    { action: 'company.create', name: '财务接口验收-B-' + suffix },
    201,
  );
  companies.push(b.id);
  const c = a.id,
    acct = await call(
      {
        action: 'account.create',
        companyId: c,
        name: '验收银行',
        type: '银行账户',
        opening: '1000.00',
      },
      201,
    );
  const other = await call(
    {
      action: 'account.create',
      companyId: b.id,
      name: '另一个企业',
      type: '现金',
      opening: '0',
    },
    201,
  );
  const first = await call(
    { action: 'bill.create', companyId: c, ...sample },
    201,
  );
  const payFields = {
    accountId: acct.id,
    amount: '100.00',
    date: '2026-10-02',
    reference: '',
    note: '',
  };
  await operation(c, first.id, 'payment.create', payFields, 409);
  await call(
    {
      action: 'bill.review',
      companyId: b.id,
      id: first.id,
      version: 'x',
      status: 'approved',
      reason: '',
    },
    404,
  );
  await operation(c, first.id, 'bill.review', {
    status: 'approved',
    reason: '',
  });
  await operation(
    c,
    first.id,
    'payment.create',
    { ...payFields, accountId: other.id },
    400,
  );
  await operation(
    c,
    first.id,
    'payment.create',
    { ...payFields, amount: '1200.00' },
    400,
  );
  const initial = (await get(c)).bills[0],
    payment = {
      action: 'payment.create',
      companyId: c,
      id: first.id,
      version: initial.version,
      ...payFields,
      amount: '400.00',
    };
  const responses = await Promise.all(
    [1, 2].map(() =>
      fetch(base + '/api/finance/business', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payment),
      }),
    ),
  );
  check(
    responses
      .map((r) => r.status)
      .sort()
      .join(',') === '200,409',
    '并发收款只能成功一次',
  );
  let state = await get(c);
  check(state.payments.length === 1, '只生成一条收付');
  check(state.accounts[0].balanceCents === 140000, '部分收款余额');
  check(state.bills[0].paidCents === 40000, '部分收款金额');
  await call(payment, 409);
  await operation(c, first.id, 'payment.create', {
    ...payFields,
    amount: '730.00',
  });
  state = await get(c);
  check(state.accounts[0].balanceCents === 213000, '结清余额');
  check(state.bills[0].paidCents === 113000, '单据结清');
  await operation(
    c,
    first.id,
    'bill.review',
    { status: 'void', reason: '已收款不能作废' },
    409,
  );
  await operation(c, first.id, 'bill.edit', sample, 409);
  await operation(c, first.id, 'bill.voucher', {
    invoiceNo: 'INV-' + suffix,
    note: '补齐凭证',
  });
  const document = Buffer.from('%PDF-1.4\n验收凭证\n%%EOF').toString('base64');
  await operation(c, first.id, 'attachment.save', {
    name: '验收.pdf',
    mime: 'application/pdf',
    data: document,
  });
  const file = await fetch(
    `${base}/api/finance/business/attachment?companyId=${c}&billId=${first.id}`,
  );
  check(file.status === 200, '凭证下载');
  check(
    Buffer.from(await file.arrayBuffer()).toString('base64') === document,
    '凭证字节一致',
  );
  check(
    (
      await fetch(
        `${base}/api/finance/business/attachment?companyId=${b.id}&billId=${first.id}`,
      )
    ).status === 404,
    '凭证账套隔离',
  );
  state = await get(c);
  const pay = state.payments.find((p) => p.amountCents === 40000);
  await operation(c, first.id, 'payment.reverse', {
    paymentId: pay.id,
    reason: '验收冲销',
  });
  state = await get(c);
  check(state.accounts[0].balanceCents === 173000, '冲销恢复余额');
  check(state.bills[0].paidCents === 73000, '冲销恢复应收');
  await operation(
    c,
    first.id,
    'payment.reverse',
    { paymentId: pay.id, reason: '不能重复' },
    409,
  );
  const reimbursement = await call(
    {
      action: 'bill.create',
      companyId: c,
      ...sample,
      kind: 'reimbursement',
      title: '验收报销',
      category: '办公费用',
      amount: '100.00',
      taxRate: '0',
    },
    201,
  );
  await operation(c, reimbursement.id, 'bill.review', {
    status: 'rejected',
    reason: '缺少说明',
  });
  await operation(c, reimbursement.id, 'payment.create', payFields, 409);
  await operation(c, reimbursement.id, 'bill.edit', {
    ...sample,
    kind: 'reimbursement',
    title: '验收报销',
    category: '办公费用',
    amount: '100.00',
    taxRate: '0',
    note: '已补齐',
  });
  await operation(c, reimbursement.id, 'bill.review', {
    status: 'approved',
    reason: '',
  });
  await operation(c, reimbursement.id, 'payment.create', payFields);
  check((await get(c)).accounts[0].balanceCents === 163000, '报销付款扣减账户');
  const entries = await (
    await fetch(base + '/api/finance?companyId=' + c)
  ).json();
  check(entries.entries.length === 3, '自动生成收支流水');
  check(
    entries.entries.filter((e) => e.status === 'void').length === 1,
    '冲销记录保留',
  );
  check(
    entries.entries.filter((e) => e.invoiceNo === 'INV-' + suffix).length === 2,
    '补票同步流水',
  );
  const linked = entries.entries.find((e) => e.status === 'confirmed');
  await call(
    {
      action: 'status',
      companyId: c,
      id: linked.id,
      updatedAt: linked.updatedAt,
      status: 'void',
    },
    409,
    '/api/finance',
  );
  check(
    (await (await fetch(base + '/api/finance?companyId=' + b.id)).json())
      .entries.length === 0,
    '账本账套隔离',
  );
  await call(
    {
      action: 'bill.create',
      companyId: c,
      ...sample,
      invoiceNo: 'INV-' + suffix,
    },
    409,
  );
  await call(
    {
      action: 'bill.create',
      companyId: b.id,
      ...sample,
      invoiceNo: 'INV-' + suffix,
    },
    201,
  );
  await call(
    { action: 'bill.create', companyId: c, ...sample, amount: '1.001' },
    400,
  );
  await call(
    { action: 'bill.create', companyId: c, ...sample, date: '2026-02-30' },
    400,
  );
  await call(
    { action: 'bill.create', companyId: c, ...sample, kind: 'toString' },
    400,
  );
  const manual = await call(
    {
      action: 'create',
      companyId: c,
      accountId: acct.id,
      ...sample,
      direction: 'expense',
      amount: '10.00',
    },
    201,
    '/api/finance',
  );
  await call(
    {
      action: 'amend',
      companyId: c,
      id: manual.entry.id,
      updatedAt: manual.entry.updatedAt,
      invoiceNo: 'MANUAL-' + suffix,
      note: '补票',
    },
    200,
    '/api/finance',
  );
  const updated = (
    await (await fetch(base + '/api/finance?companyId=' + c)).json()
  ).entries.find((e) => e.id === manual.entry.id);
  await call(
    {
      action: 'status',
      companyId: c,
      id: updated.id,
      updatedAt: updated.updatedAt,
      status: 'confirmed',
    },
    200,
    '/api/finance',
  );
  check((await get(c)).accounts[0].balanceCents === 162000, '手工支出确认余额');
  const analyze = await call(
    { action: 'analyze', companyId: c, month: '2026-10', question: '核查收支' },
    200,
    '/api/finance',
  );
  check(
    analyze.summary.income === 73000 && analyze.summary.expense === 11000,
    '收支汇总剔除冲销',
  );
  check((await get(c)).audits.length >= 12, '操作记录留存');
  const precision = await call(
    {
      action: 'bill.create',
      companyId: b.id,
      ...sample,
      title: '分次税额验收',
      amount: '10.01',
    },
    201,
  );
  await operation(b.id, precision.id, 'bill.review', {
    status: 'approved',
    reason: '',
  });
  await operation(b.id, precision.id, 'payment.create', {
    ...payFields,
    accountId: other.id,
    amount: '5.00',
  });
  await operation(b.id, precision.id, 'payment.create', {
    ...payFields,
    accountId: other.id,
    amount: '5.01',
  });
  let precisionEntries = (
    await (await fetch(base + '/api/finance?companyId=' + b.id)).json()
  ).entries;
  check(
    precisionEntries.reduce((n, e) => n + e.taxCents, 0) === 115,
    '分次收款税额尾差归并',
  );
  const precisionPayment = (await get(b.id)).payments.find(
    (p) => p.amountCents === 500,
  );
  await operation(b.id, precision.id, 'payment.reverse', {
    paymentId: precisionPayment.id,
    reason: '分摊复核',
  });
  precisionEntries = (
    await (await fetch(base + '/api/finance?companyId=' + b.id)).json()
  ).entries;
  check(
    precisionEntries
      .filter((e) => e.status === 'confirmed')
      .reduce((n, e) => n + e.taxCents, 0) === 58,
    '冲销后重新分摊税额',
  );
  check(
    (
      await fetch(base + '/api/finance/business', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: 'https://invalid.example',
        },
        body: JSON.stringify(payment),
      })
    ).status === 403,
    '拒绝跨站写入',
  );
  console.log(
    `PASS ${checks} checks: company isolation / accounts / approvals / partial payments / concurrency / reversal / vouchers / ledger / analysis`,
  );
} finally {
  const list = companies.map((id) => `'${id}'`).join(',') || "'none'";
  writeFileSync(
    'work/finance-test-cleanup.sql',
    `-- Only test companies from this run\n${['financeDocuments', 'financeEntries', 'financePayments', 'financeAudit', 'financeBills', 'financeAccounts', 'financeCompanies'].map((t) => `DELETE FROM ${t} WHERE ${t === 'financeCompanies' ? 'id' : 'companyId'} IN (${list});`).join('\n')}\n`,
  );
  console.log('Cleanup: work/finance-test-cleanup.sql');
}
