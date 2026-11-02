import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:3004';
if (!/^http:\/\/127\.0\.0\.1:(3004|3006)$/.test(base))
  throw new Error('平台综合验收只允许独立测试服务的3004/3006端口');
let checks = 0,
  cookie = '';
const suffix = crypto.randomUUID().slice(0, 8),
  labels = [];
function check(value, label) {
  assert.ok(value, label);
  checks++;
  labels.push(label);
}
async function req(path, body, status = 200, session = cookie) {
  const r = await fetch(base + path, {
    method: body ? 'POST' : 'GET',
    headers: {
      ...(body ? { 'Content-Type': 'application/json', Origin: base } : {}),
      ...(session ? { Cookie: session } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const d = await r.json();
  assert.equal(
    r.status,
    status,
    `${body?.action || path}: ${JSON.stringify(d)}`,
  );
  checks++;
  return { d, r };
}
let credentials;
if (existsSync('work/platform-test-credentials.json'))
  credentials = JSON.parse(
    readFileSync('work/platform-test-credentials.json', 'utf8'),
  );
else {
  credentials = {
    email: `platform-${suffix}@example.test`,
    password: crypto.randomUUID() + 'A1',
    name: '独立验收管理员',
  };
  writeFileSync(
    'work/platform-test-credentials.json',
    JSON.stringify(credentials),
  );
}
const auth = (await req('/api/platform/auth')).d;
const login = await req('/api/platform/auth', {
  ...credentials,
  action: auth.initialized ? 'login' : 'setup',
});
cookie = login.r.headers.get('set-cookie').split(';')[0];
writeFileSync('work/platform-test-cookie.txt', cookie);
check(
  /HttpOnly/.test(login.r.headers.get('set-cookie')),
  '会话Cookie为HttpOnly',
);
const companyA = (
  await req(
    '/api/platform/team',
    {
      action: 'tenant.create',
      companyId: 'park',
      name: '经营闭环验收-A-' + suffix,
    },
    201,
  )
).d.id;
const companyB = (
  await req(
    '/api/platform/team',
    {
      action: 'tenant.create',
      companyId: 'park',
      name: '隔离验收-B-' + suffix,
    },
    201,
  )
).d.id;
async function list(companyId = companyA, session = cookie) {
  return (await req('/api/platform?companyId=' + companyId, null, 200, session))
    .d;
}
async function record(id) {
  return (await list()).records.find((r) => r.id === id);
}
async function create(kind, data, title = kind, extra = {}) {
  return (
    await req(
      '/api/platform',
      {
        action: 'record.create',
        companyId: companyA,
        kind,
        title: title + '-' + suffix,
        owner: '验收负责人',
        dueDate: '2030-12-31',
        data,
        ...extra,
      },
      201,
    )
  ).d.record;
}
async function advance(r, status, session = cookie, expected = 200) {
  r = await record(r.id);
  return (
    await req(
      '/api/platform',
      {
        action: 'record.transition',
        companyId: companyA,
        id: r.id,
        version: r.version,
        status,
      },
      expected,
      session,
    )
  ).d.record;
}
async function confirmed(r) {
  r = await advance(r, '待审核');
  return advance(r, '已确认');
}
async function save(r, data, expected = 200, version = r.version) {
  return (
    await req(
      '/api/platform',
      {
        action: 'record.save',
        companyId: companyA,
        id: r.id,
        kind: r.kind,
        title: r.title,
        owner: r.owner,
        dueDate: r.dueDate,
        version,
        data,
      },
      expected,
    )
  ).d.record;
}
const customer = await create('customer', {
  contact: '决策人',
  needs: '品牌设计服务',
  phone: '测试虚构联系方式',
});
const enterprise = await create('enterprise', {
  industry: '品牌设计',
  contact: '联系人',
  capabilities: '品牌设计 平面制作',
  sharing: '授权展示',
  cases: '独立验收案例',
});
let e = await confirmed(enterprise);
check(
  (
    await req(
      '/api/platform/network?companyId=' +
        companyA +
        '&q=' +
        encodeURIComponent('品牌设计'),
    )
  ).d.matches.some((m) => m.id === e.id),
  '授权确认的企业进入可解释撮合',
);
const hidden = await create('enterprise', {
  industry: '软件',
  contact: '内部',
  capabilities: '私有软件',
  sharing: '仅本企业',
});
await confirmed(hidden);
check(
  !(await req('/api/platform/network?companyId=' + companyA)).d.matches.some(
    (m) => m.id === hidden.id,
  ),
  '私有资料不进入跨企业展示',
);
const opp = await create('opportunity', {
  customerId: customer.id,
  requirements: '品牌设计',
  budget: '50000',
  decisionContact: '负责人',
  targetDate: '2030-01-01',
  nextAction: '确认范围',
});
await advance(opp, '已验证');
await advance(opp, '已成交', cookie, 409);
await advance(opp, '方案沟通');
await advance(opp, '已成交');
const requirement = await confirmed(
  await create('requirement', {
    customerId: customer.id,
    opportunityId: opp.id,
    scope: '品牌设计',
    exclusions: '不含印刷',
    acceptanceCriteria: '交付源文件',
    source: '客户测试需求',
    confirmedBy: '客户',
    confirmationEvidence: '确认记录 TEST',
  }),
);
const quote = await confirmed(
  await create('quotation', {
    requirementId: requirement.id,
    amount: '50000',
    scope: '标志与规范',
    paymentTerms: '验收后付款',
    duration: '30天',
    revisions: '2',
    confirmedBy: '客户',
    confirmationEvidence: '测试报价确认',
  }),
);
const built = (
  await req('/api/platform', {
    companyId: companyA,
    action: 'project.fromQuote',
    id: quote.id,
    version: quote.version,
  })
).d;
const project = await record(built.id);
check(
  built.records.filter((r) => r.kind === 'milestone').length === 3,
  '确认报价生成项目和三个里程碑',
);
const replay = (
  await req('/api/platform', {
    companyId: companyA,
    action: 'project.fromQuote',
    id: quote.id,
    version: (await record(quote.id)).version,
  })
).d;
check(
  replay.replayed && replay.id === project.id,
  '一键建项目重复请求不重复创建',
);
await save(
  requirement,
  { ...requirement.data, scope: '试图修改确认范围' },
  409,
);
const draft = await create('task', {
  projectId: project.id,
  nextAction: '完成设计',
  doneCriteria: '交付文件',
  priority: '普通',
});
const saved = await save(draft, { ...draft.data, result: '已交付测试文件' });
await save(saved, { ...saved.data, result: '旧版本覆盖' }, 409, draft.version);
check(
  (await record(draft.id)).data.result === '已交付测试文件',
  '旧版本不能覆盖新修改',
);
await advance(saved, '处理中');
await advance(saved, '待确认');
await advance(saved, '已完成');
const delivery = await create('delivery', {
  projectId: project.id,
  revision: 'V1',
  content: '测试交付',
  ownership: '客户确认后归客户',
  evidence: '测试源文件',
});
await advance(delivery, '已提交');
await advance(delivery, '已确认');
const acceptance = await confirmed(
  await create('acceptance', {
    projectId: project.id,
    deliveryId: delivery.id,
    criteria: '交付源文件',
    evidence: '验收资料',
    submittedDate: '2026-10-27',
    confirmedBy: '客户',
    confirmationEvidence: '签署测试回执',
    amount: '10000',
    paymentDue: '2030-01-01',
  }),
);
const bill = (
  await req('/api/platform', {
    action: 'bill.fromSource',
    companyId: companyA,
    id: acceptance.id,
    version: acceptance.version,
  })
).d;
const financial = (await req('/api/finance/business?companyId=' + companyA)).d;
check(
  financial.bills.some(
    (b) =>
      b.id === bill.id && b.amountCents === 1000000 && b.status === 'pending',
  ),
  '验收金额准确转入现有财务待审核应收单',
);
const billReplay = (
  await req('/api/platform', {
    action: 'bill.fromSource',
    companyId: companyA,
    id: acceptance.id,
    version: (await record(acceptance.id)).version,
  })
).d;
check(
  billReplay.id === bill.id && billReplay.replayed,
  '验收应收生成具有幂等性',
);
const excessive = await confirmed(
  await create('acceptance', { ...acceptance.data, amount: '45000' }),
);
await req(
  '/api/platform',
  {
    action: 'bill.fromSource',
    companyId: companyA,
    id: excessive.id,
    version: excessive.version,
  },
  400,
);
const review = await confirmed(
  await create('retrospective', {
    projectId: project.id,
    outcome: '测试完成',
    lessons: '先确认范围',
    feedback: '客户满意',
    reusable: '分阶段验收',
  }),
);
const knowledge = (
  await req('/api/platform', {
    companyId: companyA,
    action: 'knowledge.fromReview',
    id: review.id,
    version: review.version,
  })
).d;
check(
  (await record(knowledge.id)).status === '草稿',
  '复盘回库为待审核的岗位经验',
);
await confirmed(await record(knowledge.id));
const role1 = await confirmed(
  await create('aiRole', {
    role: '项目',
    instructions: '整理客户需求',
    knowledgeLayer: '全部已确认知识',
    tool: '整理需求',
    criteria: '需求清单与待确认项',
    tokenBudget: '512',
  }),
);
const role2 = await confirmed(
  await create('aiRole', {
    role: '内容',
    instructions: '整理交付提纲',
    knowledgeLayer: '全部已确认知识',
    tool: '生成草稿',
    criteria: '交付提纲',
    tokenBudget: '512',
  }),
);
const run = await create('aiRun', {
  goal: '品牌设计需求整理',
  role1: role1.id,
  role2: role2.id,
  input: '独立测试资料，无真实企业信息',
  projectId: project.id,
});
let output = (
  await req('/api/platform/ai', {
    action: 'run.next',
    companyId: companyA,
    id: run.id,
    version: run.version,
  })
).d.record;
await req(
  '/api/platform/ai',
  {
    action: 'run.next',
    companyId: companyA,
    id: run.id,
    version: output.version,
  },
  409,
);
let step = (await list()).steps.find((s) => s.runId === run.id);
check(
  step.provider === '本地规则模板' && step.status === '待确认',
  '未调用外部模型时明确标记规则模板并暂停人工确认',
);
output = (
  await req('/api/platform/ai', {
    action: 'step.approve',
    companyId: companyA,
    id: run.id,
    version: output.version,
    stepId: step.id,
    content: step.content + '\n人工修订',
  })
).d.record;
check(output.status === '待执行', '人工确认后才可执行下一岗位');
output = (
  await req('/api/platform/ai', {
    action: 'run.next',
    companyId: companyA,
    id: run.id,
    version: output.version,
  })
).d.record;
step = (await list()).steps.find((s) => s.runId === run.id && s.step === 2);
output = (
  await req('/api/platform/ai', {
    action: 'step.approve',
    companyId: companyA,
    id: run.id,
    version: output.version,
    stepId: step.id,
    content: step.content,
  })
).d.record;
check(output.status === '已完成', '多岗位接力完整完成并持久化');
const space = await create('space', {
  location: '2F A201',
  area: '100',
  rent: '8000',
  features: '会议与办公',
});
const bookingData = {
  spaceId: space.id,
  start: '2030-01-01T10:00',
  end: '2030-01-01T12:00',
  contact: '测试',
  purpose: '业务洽谈',
};
const booking1 = await create('booking', bookingData),
  booking2 = await create('booking', bookingData);
await advance(booking1, '已确认');
await advance(booking2, '已确认', cookie, 409);
check(
  (await record(booking2.id)).status === '待确认',
  '预约冲突在数据库事务层拦截且保留原状态',
);
const meter = await create('meter', {
  spaceId: space.id,
  type: '用电',
  serial: 'M-' + suffix,
  price: '1.2',
  threshold: '200',
});
const reading = await confirmed(
  await create('reading', {
    meterId: meter.id,
    startDate: '2026-09-01',
    endDate: '2026-09-30',
    previous: '100',
    current: '400',
    payer: '测试承租人',
  }),
);
const energyBill = (
  await req('/api/platform', {
    action: 'bill.fromSource',
    companyId: companyA,
    id: reading.id,
    version: reading.version,
  })
).d;
check(
  (await req('/api/finance/business?companyId=' + companyA)).d.bills.find(
    (b) => b.id === energyBill.id,
  ).amountCents === 36000,
  '累计读数按用量和计量点单价转应收',
);
await create(
  'reading',
  { ...reading.data, previous: '500', current: '100' },
  'invalid',
  {},
)
  .then(() => assert.fail('倒退读数应失败'))
  .catch((err) => {
    assert.match(err.message, /400|期末/);
    checks++;
  });
const notice = await confirmed(
  await create('notice', {
    content: '独立验收通知内容',
    audience: '测试企业',
    recipients: companyB,
  }),
);
const inbox = (await list(companyB)).inbox.find(
  (n) => n.noticeId === notice.id,
);
check(inbox && inbox.status === '未读', '审核发文送达指定企业收件箱');
await req('/api/platform', {
  action: 'inbox.receipt',
  companyId: companyB,
  id: inbox.id,
  version: inbox.version,
  status: '已办结',
  response: '已完成测试核对',
});
const importBody = {
  companyId: companyA,
  kind: 'customer',
  batchId: 'batch-' + suffix,
  rows: [
    {
      title: '导入客户1',
      owner: '测试',
      contact: '测试联系人',
      needs: '测试需求',
    },
    {
      title: '导入客户2',
      owner: '测试',
      contact: '测试联系人2',
      needs: '测试需求2',
    },
  ],
};
const preview = (
  await req('/api/platform/import', { ...importBody, preview: true })
).d;
check(preview.valid === 2 && !preview.issues.length, '导入预检逐行验证Schema');
await req('/api/platform/import', importBody, 201);
check(
  (await req('/api/platform/import', importBody)).d.replayed,
  '导入批次重复提交不产生重复数据',
);
const before = (await list()).records.length;
await req(
  '/api/platform/import',
  {
    ...importBody,
    batchId: 'invalid-' + suffix,
    rows: [importBody.rows[0], { title: 'invalid', owner: '测试' }],
  },
  400,
);
check((await list()).records.length === before, '导入有错误时整批不写入');
const attachment = (
  await req(
    '/api/platform/files',
    {
      companyId: companyA,
      recordId: project.id,
      name: 'evidence.txt',
      mime: 'text/plain',
      data: Buffer.from('独立测试文件').toString('base64'),
    },
    201,
  )
).d;
const downloaded = await fetch(
  base + `/api/platform/files?companyId=${companyA}&id=${attachment.id}`,
  { headers: { Cookie: cookie } },
);
check((await downloaded.text()) === '独立测试文件', '附件持久化后可鉴权下载');
const memberCred = {
  email: `member-${suffix}@example.test`,
  password: crypto.randomUUID() + 'A1',
  name: '验收普通成员',
};
await req(
  '/api/platform/team',
  {
    companyId: companyA,
    action: 'member.create',
    role: 'member',
    ...memberCred,
  },
  201,
);
const memberLogin = await req(
  '/api/platform/auth',
  { action: 'login', ...memberCred },
  200,
  '',
);
const memberCookie = memberLogin.r.headers.get('set-cookie').split(';')[0];
await req('/api/platform?companyId=' + companyB, null, 403, memberCookie);
await req(
  '/api/finance/business?companyId=' + companyA,
  null,
  403,
  memberCookie,
);
await req(
  '/api/platform',
  {
    companyId: companyA,
    action: 'record.create',
    kind: 'cost',
    title: '无权成本',
    owner: '成员',
    dueDate: '',
    data: {},
  },
  403,
  memberCookie,
);
await req(
  '/api/platform',
  {
    companyId: companyA,
    action: 'record.transition',
    id: booking2.id,
    version: (await record(booking2.id)).version,
    status: '已确认',
  },
  403,
  memberCookie,
);
await req(
  '/api/platform',
  {
    companyId: companyB,
    action: 'record.create',
    kind: 'opportunity',
    title: '跨企业引用',
    owner: '测试',
    dueDate: '',
    data: opp.data,
  },
  404,
);
await req('/api/platform?companyId=' + companyA, null, 401, '');
await req('/api/finance/business?companyId=' + companyA, null, 401, '');
await req('/api/tax?companyId=' + companyA, null, 401, '');
await req('/api/workspace', null, 401, '');
await req('/api/park', null, 401, '');
const history = (
  await req(`/api/platform?companyId=${companyA}&history=${project.id}`)
).d.history;
check(
  history.some((h) => h.actorName === credentials.name),
  '版本历史保存实际操作者',
);
writeFileSync(
  'work/platform-test-fixture.json',
  JSON.stringify({
    companyA,
    companyB,
    projectId: project.id,
    customerId: customer.id,
    quoteId: quote.id,
    attachmentId: attachment.id,
  }),
);
writeFileSync(
  'work/platform-test-result.json',
  JSON.stringify(
    { checks, labels, passed: true, at: new Date().toISOString() },
    null,
    2,
  ),
);
console.log(
  `PASS ${checks} checks: authentication, isolation, CRM, quotations, delivery, billing, knowledge, AI relay, bookings, energy, notices, imports, files, audit.`,
);
