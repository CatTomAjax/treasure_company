import assert from 'node:assert/strict';
import { writeFileSync, mkdirSync } from 'node:fs';
import { isolatedDatabase, createTestRuntime } from './mysql-runtime.mjs';

const target = await isolatedDatabase('qa');
mkdirSync('tmp', { recursive: true });
const base = 'http://127.0.0.1:3006';
const calls = [];
let invalidModel = false;
function modelMock(request) {
  return (async () => {
    assert.equal(new URL(request.url).hostname, 'api.deepseek.com');
    const body = await request.json();
    const payload = JSON.parse(body.messages.at(-1).content);
    calls.push(payload);
    const pair = payload.nodes.filter((n) => n.sourceIds.length).slice(0, 2);
    const relation = {
      source: pair[0].id,
      target: pair[1].id,
      title: '测试联合方案',
      reason: '仅根据已提供的业务能力建议联合交付',
      evidence: pair.map((n) => n.sourceIds[0]),
      nextAction: '人工核对责任分工',
    };
    const answer = JSON.stringify(
      invalidModel
        ? [{ ...relation, evidence: ['invented@v0'] }]
        : [relation, { ...relation, target: 'invented-company' }],
    );
    const encoder = new TextEncoder();
    const data = (choices, usage) =>
      'data: ' +
      JSON.stringify({
        id: 'chatcmpl-portrait-test',
        object: 'chat.completion.chunk',
        created: 1,
        model: body.model,
        choices,
        ...(usage ? { usage } : {}),
      }) +
      '\n\n';
    return new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(
            encoder.encode(
              data([
                {
                  index: 0,
                  delta: { role: 'assistant', content: answer },
                  finish_reason: null,
                },
              ]),
            ),
          );
          controller.enqueue(
            encoder.encode(
              data([{ index: 0, delta: {}, finish_reason: 'stop' }], {
                prompt_tokens: 100,
                completion_tokens: 80,
                total_tokens: 180,
              }),
            ),
          );
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        },
      }),
      { headers: { 'Content-Type': 'text/event-stream' } },
    );
  })();
}
const runtime = createTestRuntime({
  url: target.url,
  port: 3006,
  bindings: {
    DEEPSEEK_API_KEY: 'isolated-mock-key',
    DEEPSEEK_MODEL: 'portrait-mock',
    LOCAL_AI_DISABLED: '0',
    PLATFORM_MASTER_KEY: 'b'.repeat(64),
  },
  modelMock,
});
let cookie = '',
  checks = 0;
const labels = [];
function check(v, label) {
  assert.ok(v, label);
  checks++;
  labels.push(label);
}
async function req(path, body, expected = 200, session = cookie) {
  const response = await fetch(base + path, {
    method: body ? 'POST' : 'GET',
    headers: {
      ...(session ? { Cookie: session } : {}),
      ...(body ? { 'Content-Type': 'application/json', Origin: base } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const value = await response.json();
  assert.equal(response.status, expected, `${path}: ${JSON.stringify(value)}`);
  checks++;
  return { value, response };
}
async function create(companyId, kind, title, data) {
  return (
    await req(
      '/api/platform',
      {
        action: 'record.create',
        companyId,
        kind,
        title,
        data,
        owner: '独立验收',
        dueDate: '',
      },
      201,
    )
  ).value.record;
}
async function confirm(r) {
  for (const status of ['待审核', '已确认'])
    r = (
      await req('/api/platform', {
        action: 'record.transition',
        companyId: r.companyId,
        id: r.id,
        version: r.version,
        status,
      })
    ).value.record;
  return r;
}
try {
  await runtime.ready;
  await req('/api/platform/portrait?companyId=park', undefined, 401, '');
  const password = crypto.randomUUID() + 'A1';
  const setup = await req('/api/platform/auth', {
    action: 'setup',
    email: 'portrait-admin@example.test',
    password,
    name: '脸谱独立验收',
  });
  cookie = setup.response.headers.get('set-cookie').split(';')[0];
  const a = (
    await req(
      '/api/platform/team',
      { action: 'tenant.create', companyId: 'park', name: '测试企业 A' },
      201,
    )
  ).value.id;
  const b = (
    await req(
      '/api/platform/team',
      { action: 'tenant.create', companyId: 'park', name: '测试企业 B' },
      201,
    )
  ).value.id;
  const c = (
    await req(
      '/api/platform/team',
      { action: 'tenant.create', companyId: 'park', name: '无权企业 C' },
      201,
    )
  ).value.id;
  let self = await create(a, 'enterprise', '测试技术企业', {
    industry: '数字科技',
    capabilities: '系统开发、人工智能',
    contact: '本企业联系人',
    sharing: '仅本企业',
    profileType: '本企业',
    summary: '数字系统与AI交付',
    needs: '视觉设计',
    cases: '企业系统案例',
  });
  self = await confirm(self);
  let partner = await create(a, 'enterprise', '测试设计伙伴', {
    industry: '品牌创意',
    capabilities: '视觉设计、品牌策划',
    contact: '服务商联系人',
    sharing: '仅本企业',
    profileType: '合作伙伴',
  });
  partner = await confirm(partner);
  const pub = await confirm(
    await create(b, 'enterprise', '公开授权企业 B', {
      industry: '科技服务',
      capabilities: '系统开发、数字化',
      contact: 'MUST_NOT_LEAK_CONTACT',
      phone: 'MUST_NOT_LEAK_PHONE',
      sharing: '授权展示',
      profileType: '本企业',
    }),
  );
  await create(b, 'enterprise', 'MUST_NOT_LEAK_PRIVATE', {
    industry: '科技服务',
    capabilities: '系统开发',
    contact: 'private',
    sharing: '仅本企业',
  });
  await confirm(
    await create(b, 'knowledge', 'MUST_NOT_LEAK_KNOWLEDGE', {
      layer: '业务知识',
      category: '测试',
      content: 'MUST_NOT_LEAK_INTERNAL',
      source: '内部',
    }),
  );
  let snapshot = (await req(`/api/platform/portrait?companyId=${a}`)).value;
  check(
    snapshot.graph.nodes.length === 3,
    '档案按明确身份合并，公开企业进入当前网络',
  );
  check(
    !JSON.stringify(snapshot).includes('MUST_NOT_LEAK'),
    'API 未泄露跨企业联系人、内部档案和知识',
  );
  check(
    !JSON.stringify(snapshot).includes('isolated-mock-key'),
    'API 不返回模型密钥',
  );
  await req(
    '/api/platform',
    {
      action: 'record.create',
      companyId: a,
      kind: 'portraitAnalysis',
      title: 'forged',
      owner: 'forged',
      dueDate: '',
      data: {},
    },
    403,
  );
  await req(
    '/api/platform/portrait',
    {
      action: 'analyze',
      companyId: a,
      fingerprint: 'old',
      modelTarget: snapshot.model,
    },
    409,
  );
  await req(
    '/api/platform/portrait',
    {
      action: 'analyze',
      companyId: a,
      fingerprint: snapshot.fingerprint,
      modelTarget: {
        ...snapshot.model,
        destination: 'https://example.invalid',
      },
    },
    403,
  );
  check(calls.length === 0, '资料和模型校验失败时不调用模型');
  const analyzed = (
    await req('/api/platform/portrait', {
      action: 'analyze',
      companyId: a,
      fingerprint: snapshot.fingerprint,
      modelTarget: snapshot.model,
    })
  ).value;
  check(
    analyzed.graph.links.filter((l) => l.type === 'ai').length === 1 &&
      analyzed.rejected === 1,
    '真实流解析模型结构并过滤发明的企业',
  );
  check(
    calls.length === 1 && !JSON.stringify(calls).includes('MUST_NOT_LEAK'),
    '模型只收到经过授权筛选的资料',
  );
  snapshot = (await req(`/api/platform/portrait?companyId=${a}`)).value;
  check(
    snapshot.graph.links.some((l) => l.type === 'ai') && snapshot.analysis,
    'AI 结果保存并可重新读取',
  );
  const link = snapshot.graph.links.find((l) => l.type === 'ai');
  const follow = (
    await req(
      '/api/platform/portrait',
      {
        action: 'followup',
        companyId: a,
        fingerprint: snapshot.fingerprint,
        linkId: link.id,
        note: '验收测试',
      },
      201,
    )
  ).value;
  const all = (await req(`/api/platform?companyId=${a}`)).value;
  check(
    all.records.some(
      (r) => r.id === follow.id && r.kind === 'followup' && r.companyId === a,
    ),
    '跟进保存到当前企业业务记录',
  );
  await req(
    '/api/platform/portrait',
    {
      action: 'analyze',
      companyId: a,
      fingerprint: snapshot.fingerprint,
      modelTarget: snapshot.model,
    },
    429,
  );
  const memberPassword = crypto.randomUUID() + 'A1';
  await req(
    '/api/platform/team',
    {
      action: 'member.create',
      companyId: a,
      role: 'viewer',
      email: 'portrait-viewer@example.test',
      password: memberPassword,
      name: '脸谱只读验收',
    },
    201,
  );
  const login = await req('/api/platform/auth', {
    action: 'login',
    email: 'portrait-viewer@example.test',
    password: memberPassword,
  });
  const viewerCookie = login.response.headers.get('set-cookie').split(';')[0];
  check(
    (
      await req(
        `/api/platform/portrait?companyId=${a}`,
        undefined,
        200,
        viewerCookie,
      )
    ).value.canWrite === false,
    '只读成员可查看企业网络',
  );
  await req(
    `/api/platform/portrait?companyId=${c}`,
    undefined,
    403,
    viewerCookie,
  );
  await req(
    '/api/platform/portrait',
    {
      action: 'followup',
      companyId: a,
      fingerprint: snapshot.fingerprint,
      linkId: link.id,
      note: '',
    },
    403,
    viewerCookie,
  );
  self = (
    await req('/api/platform', {
      action: 'record.transition',
      companyId: a,
      id: self.id,
      version: self.version,
      status: '草稿',
    })
  ).value.record;
  self = (
    await req('/api/platform', {
      action: 'record.save',
      companyId: a,
      kind: 'enterprise',
      id: self.id,
      version: self.version,
      title: self.title,
      owner: self.owner,
      dueDate: '',
      data: { ...self.data, capabilities: '人工智能、视频制作' },
    })
  ).value.record;
  const updated = (await req(`/api/platform/portrait?companyId=${a}`)).value;
  check(
    updated.fingerprint !== snapshot.fingerprint &&
      !updated.analysis &&
      !updated.graph.links.some((l) => l.type === 'ai'),
    '资料版本改变使旧分析立即失效',
  );
  await req(
    '/api/platform/portrait',
    {
      action: 'followup',
      companyId: a,
      fingerprint: snapshot.fingerprint,
      linkId: link.id,
      note: '',
    },
    409,
  );
  await runtime.database
    .prepare(
      "UPDATE treasure_business_records SET createdAt=? WHERE companyId=? AND kind='portraitAnalysis'",
    )
    .bind('2026-01-01T00:00:00.000Z', a)
    .run();
  invalidModel = true;
  await req(
    '/api/platform/portrait',
    {
      action: 'analyze',
      companyId: a,
      fingerprint: updated.fingerprint,
      modelTarget: updated.model,
    },
    502,
  );
  check(
    !(await req(`/api/platform/portrait?companyId=${a}`)).value.analysis,
    '无来源的模型输出不保存',
  );
  const withdrawn = (
    await req('/api/platform', {
      action: 'record.transition',
      companyId: b,
      id: pub.id,
      version: pub.version,
      status: '草稿',
    })
  ).value.record;
  const revoked = (
    await req('/api/platform', {
      action: 'record.save',
      companyId: b,
      kind: 'enterprise',
      id: withdrawn.id,
      version: withdrawn.version,
      title: withdrawn.title,
      owner: withdrawn.owner,
      dueDate: '',
      data: { ...withdrawn.data, sharing: '仅本企业' },
    })
  ).value.record;
  check(
    revoked.data.sharing === '仅本企业' &&
      !(
        await req(`/api/platform/portrait?companyId=${a}`)
      ).value.graph.nodes.some((n) => n.companyId === b),
    '撤回授权后企业资料与旧关联均消失',
  );
  writeFileSync(
    'tmp/enterprise-portrait-api-verification.json',
    JSON.stringify(
      {
        success: true,
        checks,
        labels,
        modelRequests: calls.length,
        isolatedDatabase: true,
        modelMocked: true,
      },
      null,
      2,
    ),
  );
  console.log(
    JSON.stringify({
      success: true,
      checks,
      modelRequests: calls.length,
      report: 'tmp/enterprise-portrait-api-verification.json',
    }),
  );
} finally {
  await runtime.dispose();
  await globalThis.__treasureMysql?.pool.end();
  await target.drop();
}
