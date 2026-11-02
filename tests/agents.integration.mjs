// Isolated application + real LangGraph + real MySQL 8; only the external model is mocked.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { isolatedDatabase, createTestRuntime } from './mysql-runtime.mjs';
import { startAgentWorker } from '../scripts/agent-worker.mjs';
const workerToken = crypto.randomUUID();
const root = process.cwd(),
  base = 'http://127.0.0.1:3006',
  folder = resolve('work', 'agent-qa-' + crypto.randomUUID().slice(0, 8)),
  data = resolve(folder, 'data');
mkdirSync(folder, { recursive: true });
const target = await isolatedDatabase('agents');
let active = 0,
  maxActive = 0;
const calls = [],
  failedOnce = new Map();
function modelMock(request) {
  return (async () => {
    const url = new URL(request.url),
      openai = url.hostname === 'api.openai.com';
    assert.ok(
      ['api.deepseek.com', 'api.openai.com'].includes(url.hostname),
      '测试禁止连接其他外部主机',
    );
    if (request.method === 'GET' && url.pathname.endsWith('/models'))
      return Response.json({
        object: 'list',
        data: (openai
          ? ['gpt-6.1-sol', 'gpt-5.3-codex']
          : ['deepseek-flash', 'deepseek-pro']
        ).map((id) => ({ id, object: 'model' })),
      });
    const body = await request.json();
    const raw =
      body.messages?.at(-1)?.content ||
      (typeof body.input === 'string'
        ? body.input
        : body.input
            ?.filter((i) => i.role === 'user')
            .at(-1)
            ?.content?.map((c) => c.text || '')
            .join(''));
    const probe = !raw?.startsWith('{');
    const payload = probe
      ? {
          goal: 'model-connection-test',
          input: 'PROBE',
          role: { name: '连通测试' },
          sources: [],
          decisions: [],
        }
      : JSON.parse(raw);
    calls.push(payload);
    const key = payload.goal + '/' + payload.role.name;
    if (
      payload.input.includes('FAIL_ONCE') &&
      payload.role.name === '新媒体运营' &&
      (failedOnce.get(key) || 0) < 2
    ) {
      failedOnce.set(key, (failedOnce.get(key) || 0) + 1);
      return Response.json(
        {
          error: {
            message: 'mock temporary failure',
            type: 'server_error',
            code: 'service_unavailable',
          },
        },
        { status: 503 },
      );
    }
    active++;
    maxActive = Math.max(maxActive, active);
    let settled = false;
    const finish = () => {
      if (!settled) {
        settled = true;
        active--;
      }
    };
    const summary = payload.role.name === '汇总核对员',
      source = payload.sources[0],
      reference = payload.input.includes('BAD_CITE')
        ? '[invented-source@invented-version]'
        : source
          ? `[${source.id}@${source.version}]`
          : '缺少已确认知识';
    const text = probe
      ? 'MODEL_CONNECTION_OK'
      : summary
        ? `统一成果\n已汇总${payload.reviewInputs.length}个岗位成果。\n交叉核对\n保留分歧，资料来源${reference}。\n待确认事项\n金额和对外承诺请人工核对。`
        : `${payload.role.name}的工作成果。${reference}。${payload.decisions.length ? '已按人工新决策修订。' : ''}资料不足处列为待确认。`;
    const chunks = text.match(/.{1,12}/gs) || [],
      encoder = new TextEncoder(),
      delay = payload.input.includes('SLOW') ? 200 : 35;
    const stream = new ReadableStream({
      async start(controller) {
        try {
          const created = Math.floor(Date.now() / 1000),
            responseBase = {
              id: 'resp_qa',
              object: 'response',
              created_at: created,
              model: body.model,
            };
          let sequence = 0;
          const responseEvent = (type, rest) =>
            controller.enqueue(
              encoder.encode(
                'data: ' +
                  JSON.stringify({
                    type,
                    sequence_number: sequence++,
                    ...rest,
                  }) +
                  '\n\n',
              ),
            );
          if (openai) {
            responseEvent('response.created', {
              response: { ...responseBase, status: 'in_progress', output: [] },
            });
            responseEvent('response.output_item.added', {
              output_index: 0,
              item: {
                type: 'message',
                id: 'msg_qa',
                role: 'assistant',
                status: 'in_progress',
                content: [],
              },
            });
          }
          for (const chunk of chunks) {
            await new Promise((r) => setTimeout(r, delay));
            if (openai) {
              responseEvent('response.output_text.delta', {
                item_id: 'msg_qa',
                output_index: 0,
                content_index: 0,
                delta: chunk,
              });
              continue;
            }
            controller.enqueue(
              encoder.encode(
                'data: ' +
                  JSON.stringify({
                    id: 'chatcmpl_qa',
                    object: 'chat.completion.chunk',
                    created,
                    model: body.model,
                    choices: [
                      {
                        index: 0,
                        delta: { role: 'assistant', content: chunk },
                        finish_reason: null,
                      },
                    ],
                  }) +
                  '\n\n',
              ),
            );
          }
          if (openai) {
            const item = {
              type: 'message',
              id: 'msg_qa',
              role: 'assistant',
              status: 'completed',
              content: [{ type: 'output_text', text, annotations: [] }],
            };
            responseEvent('response.output_item.done', {
              output_index: 0,
              item,
            });
            responseEvent('response.completed', {
              response: {
                ...responseBase,
                status: 'completed',
                output: [item],
                usage: {
                  input_tokens: 100,
                  output_tokens: 50,
                  total_tokens: 150,
                  input_tokens_details: { cached_tokens: 0 },
                  output_tokens_details: { reasoning_tokens: 0 },
                },
              },
            });
            controller.close();
            return;
          }
          controller.enqueue(
            encoder.encode(
              'data: ' +
                JSON.stringify({
                  id: 'chatcmpl_qa',
                  object: 'chat.completion.chunk',
                  created,
                  model: body.model,
                  choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
                  usage: {
                    prompt_tokens: 100,
                    completion_tokens: 50,
                    total_tokens: 150,
                  },
                }) +
                '\n\ndata: [DONE]\n\n',
            ),
          );
          controller.close();
        } catch {
        } finally {
          finish();
        }
      },
      cancel() {
        finish();
      },
    });
    return new Response(stream, {
      headers: { 'Content-Type': 'text/event-stream' },
    });
  })();
}
const createRuntime = () => createTestRuntime({url:target.url,port:3006,bindings:{DEEPSEEK_API_KEY:'isolated-test-key-not-a-real-credential',DEEPSEEK_MODEL:'mock-stream',PLATFORM_MASTER_KEY:'a'.repeat(64),LOCAL_AI_DISABLED:'0',AGENT_WORKER_TOKEN:workerToken},modelMock});
let runtime = createRuntime();
let worker;
const workerErrors = [];
async function startWorker() {
  worker = startAgentWorker(runtime, {
    token: workerToken,
    pollMs: 100,
    onError: (message) => workerErrors.push(message),
  });
}
let cookie = '',
  checks = 0;
const results = [];
const ok = (v, label) => {
  assert.ok(v, label);
  checks++;
  results.push(label);
};
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
  assert.equal(
    response.status,
    expected,
    `${body?.action || path}: ${JSON.stringify(value)}`,
  );
  checks++;
  return { value, response };
}
const agent = (body, expected = 200, session = cookie) =>
  req('/api/platform/agents', body, expected, session);
const detail = async (id, session = cookie, companyId = company) =>
  (
    await req(
      `/api/platform/agents?companyId=${companyId}&id=${id}`,
      undefined,
      200,
      session,
    )
  ).value;
let company, companyB;
async function create(kind, title, data, tenant = company) {
  return (
    await req(
      '/api/platform',
      {
        companyId: tenant,
        action: 'record.create',
        kind,
        title,
        owner: '隔离验收',
        dueDate: '',
        data,
      },
      201,
    )
  ).value.record;
}
async function confirmed(record) {
  for (const status of ['待审核', '已确认'])
    record = (
      await req('/api/platform', {
        companyId: record.companyId,
        action: 'record.transition',
        id: record.id,
        version: record.version,
        status,
      })
    ).value.record;
  return record;
}
async function makeRun(sceneId = 'content', extra = {}) {
  return (
    await agent(
      {
        companyId: company,
        action: 'create',
        sceneId,
        goal: `隔离验收-${sceneId}-${crypto.randomUUID().slice(0, 5)}`,
        input: '仅隔离测试资料',
        ...extra,
      },
      201,
    )
  ).value.run;
}
async function consent(run) {
  const target = (await detail(run.id, cookie, run.companyId)).modelTarget;
  return (
    await agent({
      companyId: run.companyId,
      action: 'consent.grant',
      id: run.id,
      version: run.version,
      generation: run.generation,
      destination: target.destination,
      model: target.model,
      confirmed: true,
      scopes: [
        '任务目标和业务资料',
        '选中知识快照',
        '能力允许的业务记录',
        '人工决策',
        ...(run.snapshot.finance ? ['财务数据'] : []),
      ],
    })
  ).value.run;
}
async function execute(run) {
  const response = await fetch(base + '/api/platform/agents', {
    method: 'POST',
    headers: {
      Cookie: cookie,
      'Content-Type': 'application/json',
      Origin: base,
    },
    body: JSON.stringify({
      companyId: run.companyId,
      action: 'execute',
      id: run.id,
      version: run.version,
    }),
  });
  assert.equal(response.status, 202, await response.clone().text());
  checks++;
  const submitted = await response.json();
  ok(
    submitted.execution === 'background' && submitted.job.id,
    '提交立即返回持久化后台任务',
  );
  const final = await waitFor(
    run.id,
    (d) =>
      ['awaiting_review', 'approved', 'paused', 'cancelled'].includes(
        d.run.status,
      ) ||
      (d.run.status === 'failed' && d.job?.status === 'failed'),
  );
  const lines = final.events.map((event) => ({ kind: 'event', event }));
  writeFileSync(resolve(folder,'execution-latest.json'),JSON.stringify({status:final.run.status,job:final.job,tasks:final.tasks.map(t=>({status:t.status,error:t.error})),events:final.events.slice(-10),workerErrors},null,2));
  ok(
    lines.some(
      (x) =>
        x.kind === 'event' &&
        (run.input.includes('SLOW') || x.event.type === 'delta'),
    ),
    '后台执行输出已落库，可重新读取',
  );
  return lines;
}
async function waitFor(id, predicate) {
  for (let i = 0; i < 450; i++) {
    const d = await detail(id);
    if (predicate(d)) return d;
    await new Promise((r) => setTimeout(r, 60));
  }
  const d=await detail(id);
  writeFileSync(resolve(folder,'timeout.json'),JSON.stringify({status:d.run.status,job:d.job,tasks:d.tasks.map(t=>({status:t.status,error:t.error})),events:d.events.slice(-8),workerErrors},null,2));
  throw new Error('等待执行状态超时；诊断：'+resolve(folder,'timeout.json'));
}
try {
  await runtime.ready;
  await startWorker();
  await req(
    '/api/platform/agents/worker',
    { jobId: 'unauthorized', owner: 'browser' },
    403,
    '',
  );
  await req('/api/platform/agents?companyId=park', undefined, 401, '');
  const credentials = {
    name: '多Agent隔离验收',
    email: 'agents@example.test',
    password: 'Isolated-Agent-QA-2026',
  };
  const login = await req('/api/platform/auth', {
    action: 'setup',
    ...credentials,
  });
  cookie = login.response.headers.get('set-cookie').split(';')[0];
  company = (
    await req(
      '/api/platform/team',
      {
        companyId: 'park',
        action: 'tenant.create',
        name: 'Agent隔离验收企业A',
      },
      201,
    )
  ).value.id;
  companyB = (
    await req(
      '/api/platform/team',
      {
        companyId: 'park',
        action: 'tenant.create',
        name: 'Agent隔离验收企业B',
      },
      201,
    )
  ).value.id;
  const projectData = {
    scope: '隔离项目',
    amount: '0',
    startDate: '2026-10-28',
    acceptanceCriteria: '核对测试结果',
  };
  const projectA = await create('project', '项目A', projectData),
    projectB = await create('project', '项目B', projectData);
  const shared = await confirmed(
    await create('knowledge', '企业品牌事实', {
      layer: '业务知识',
      category: '品牌',
      content: '企业品牌事实：仅测试内容，不含真实客户资料。',
      source: '隔离测试 v1',
    }),
  );
  const ka = await confirmed(
    await create('knowledge', '项目A知识', {
      layer: '岗位经验',
      category: '项目',
      content: '项目A独立知识内容',
      source: '隔离来源A',
      projectId: projectA.id,
    }),
  );
  const kb = await confirmed(
    await create('knowledge', '项目B保密知识', {
      layer: '业务知识',
      category: '项目',
      content: '项目B独立知识内容',
      source: '隔离来源B',
      projectId: projectB.id,
    }),
  );
  const other = await confirmed(
    await create(
      'knowledge',
      '其他租户知识',
      {
        layer: '业务知识',
        category: '隔离',
        content: '其他租户不可读取',
        source: '独立来源',
      },
      companyB,
    ),
  );
  const draft = await create('knowledge', '未确认知识', {
    layer: '业务知识',
    category: '草稿',
    content: '未确认不可读取',
    source: '草稿',
  });
  const catalog = (await req('/api/platform/agents?companyId=' + company))
    .value;
  ok(
    catalog.scenes.length === 12 &&
      catalog.scenes.filter((s) => s.priority).length === 5,
    '12类场景与5类优先模板',
  );
  ok(catalog.capabilities.length === 20, '20项显式能力目录');
  ok(
    catalog.roleTemplates.length === 20 &&
      ['新媒体运营', '商务经理', '销售'].every((name) =>
        catalog.roleTemplates.some((r) => r.name === name),
      ),
    '企业常见岗位预设包含新媒体运营、商务经理和销售',
  );
  ok(
    catalog.scenes.every((scene) =>
      scene.agents.every((a) =>
        catalog.roleTemplates.some(
          (r) => r.id === a.templateId && r.name === a.name,
        ),
      ),
    ),
    '12类场景均使用企业常见岗位并保持预设关联',
  );
  ok(
    catalog.roleTemplates.every(
      (r) =>
        r.capabilities.includes('knowledge') &&
        new Set(r.capabilities).size === r.capabilities.length &&
        r.capabilities.every((id) =>
          catalog.capabilities.some((c) => c.id === id),
        ),
    ),
    '岗位自动分配有效且不重复的能力',
  );
  for (const role of catalog.roleTemplates) {
    const savedRole = await create('aiRole', role.name, {
      role: role.name,
      instructions: role.instructions,
      criteria: role.criteria,
      knowledgeLayer: '全部已确认知识',
      tool: '生成草稿',
      tokenBudget: '1000',
      capabilities: role.capabilities.join(','),
    });
    ok(
      savedRole.data.role === role.name &&
        savedRole.data.capabilities === role.capabilities.join(','),
      `${role.name}职责和自动分配能力可持久化保存`,
    );
  }
  if (process.argv.includes('--roles-only')) {
    const contentScene = catalog.scenes.find((s) => s.id === 'content');
    const businessRole = catalog.roleTemplates.find(
      (r) => r.name === '商务经理',
    );
    const switched = await makeRun('content', {
      agents: contentScene.agents.map((a, i) =>
        i === 0
          ? { ...businessRole, id: a.id, templateId: businessRole.id }
          : a,
      ),
    });
    const switchedTask = (await detail(switched.id)).tasks.find(
      (t) => t.spec.id === contentScene.agents[0].id,
    );
    ok(
      switchedTask.spec.name === '商务经理' &&
        switchedTask.spec.templateId === businessRole.id &&
        switchedTask.spec.capabilities.join(',') ===
          businessRole.capabilities.join(','),
      '任务切换商务经理后使用对应岗位能力并保留预设关联',
    );
    await agent({
      companyId: company,
      action: 'policy.save',
      projectId: projectA.id,
      version: 0,
      config: {
        ...catalog.defaultPolicy,
        capabilities: ['knowledge', 'review'],
      },
    });
    const scoped = (
      await req(
        `/api/platform/agents?companyId=${company}&projectId=${projectA.id}`,
      )
    ).value;
    ok(
      scoped.roleTemplates.every((r) =>
        r.capabilities.every((id) => ['knowledge', 'review'].includes(id)),
      ),
      '项目范围自动剔除未授权的岗位能力',
    );
    await agent(
      {
        companyId: company,
        action: 'create',
        sceneId: 'content',
        goal: '拦截越权岗位',
        projectId: projectA.id,
      },
      400,
    );
    const restricted = await makeRun('content', {
      projectId: projectA.id,
      agents: contentScene.agents.map((a) => ({
        ...a,
        capabilities: ['knowledge'],
      })),
    });
    ok(
      (await detail(restricted.id)).tasks.every(
        (t) => t.spec.capabilities.join(',') === 'knowledge',
      ),
      '自动分配受限能力后仍可创建任务，服务端保留授权校验',
    );
    writeFileSync(
      resolve(folder, 'role-report.json'),
      JSON.stringify({ success: true, checks, roles: 20 }, null, 2),
    );
    console.log(
      JSON.stringify({
        success: true,
        checks,
        roles: 20,
        report: resolve(folder, 'role-report.json'),
      }),
    );
  } else {
    const projectRun = await makeRun('content', { projectId: projectA.id });
    ok(
      projectRun.snapshot.sources.some((s) => s.id === shared.id) &&
        projectRun.snapshot.sources.some((s) => s.id === ka.id),
      '共享与当前项目知识共同读取',
    );
    ok(
      !projectRun.snapshot.sources.some((s) =>
        [kb.id, other.id, draft.id].includes(s.id),
      ),
      '其他项目、其他租户及未确认知识未进入快照',
    );
    await agent(
      {
        companyId: company,
        action: 'create',
        sceneId: 'content',
        goal: '越权项目',
        input: '测试',
        projectId: other.id,
      },
      404,
    );
    await agent(
      {
        companyId: company,
        action: 'execute',
        id: projectRun.id,
        version: projectRun.version,
      },
      403,
    );
    ok(calls.length === 0, '未明确授权前没有模型请求');
    await agent(
      {
        companyId: company,
        action: 'approve',
        id: projectRun.id,
        version: projectRun.version,
        checksConfirmed: true,
        summary: '抢先确认',
      },
      409,
    );
    const beforeCalls = calls.length,
      authorized = await consent(projectRun);
    ok(calls.length === beforeCalls, '单独授权动作不会执行模型');
    for (const scene of catalog.scenes.filter((s) => !s.priority)) {
      const adapted = await makeRun(scene.id, { projectId: projectA.id });
      const loaded = await detail(adapted.id);
      ok(
        loaded.tasks.length === scene.agents.length &&
          loaded.tasks.every((t) =>
            scene.agents.some((a) => a.name === t.spec.name),
          ),
        scene.name + '自动适配岗位与能力',
      );
    }
    const firstLines = await execute(authorized),
      first = await detail(projectRun.id);
    ok(
      first.run.status === 'awaiting_review' &&
        first.tasks.every((t) => t.status === 'completed'),
      '真实并行图完整执行后进入人工确认',
    );
    ok(maxActive >= 2, '实际模型流存在时间重叠，验证真实并行');
    const started = first.events.filter((e) => e.type === 'started'),
      complete = first.events.filter((e) => e.type === 'completed'),
      reviewEvent = first.events.find((e) => e.type === 'checking');
    ok(started[1].seq < complete[0].seq, '第二岗位在第一岗位完成前已开始');
    ok(
      reviewEvent.seq > Math.max(...complete.map((e) => e.seq)),
      '全部岗位完成后才开始统一核对',
    );
    ok(
      firstLines.some((e) => e.kind === 'event' && e.event.seq),
      '实时消息带数据库序号可回放',
    );
    ok(
      calls
        .filter((p) => p.goal === projectRun.goal)
        .every((p) =>
          p.sources.every(
            (s) =>
              !['项目B保密知识', '其他租户知识', '未确认知识'].includes(
                s.title,
              ),
          ),
        ),
      '实际模型payload保持项目与租户知识隔离',
    );
    const replay = (
      await req(
        `/api/platform/agents?companyId=${company}&id=${projectRun.id}&after=${first.events[2].seq}`,
      )
    ).value;
    ok(
      replay.events.every((e) => e.seq > first.events[2].seq),
      '游标仅返回未读消息',
    );
    const approved = (
      await agent({
        companyId: company,
        action: 'approve',
        id: first.run.id,
        version: first.run.version,
        checksConfirmed: true,
        summary: first.run.summary + '\n人工已核实。',
      })
    ).value.run;
    ok(
      approved.status === 'approved' && approved.approvedBy,
      '最终人工确认及确认人持久化',
    );
    await agent(
      {
        companyId: company,
        action: 'decision',
        id: approved.id,
        version: approved.version,
        text: '修改已确认成果',
      },
      409,
    );
    // All five priority scenarios execute through the same graph, not just UI templates.
    for (const sceneId of ['proposal', 'monthly', 'knowledge', 'risk']) {
      let run = await makeRun(sceneId, { projectId: projectA.id });
      run = await consent(run);
      await execute(run);
      const finished = await detail(run.id);
      ok(
        finished.run.status === 'awaiting_review',
        sceneId + '优先场景完成并汇总',
      );
    }
    // Persisted provider management, real protocol adapters, and tenant/project defaults.
    const dsSecret = 'qa-deepseek-secret-never-returned';
    const ds = (
      await req(
        '/api/platform/integrations',
        {
          companyId: company,
          action: 'connection.save',
          provider: 'deepseek',
          name: '验收DeepSeek连接',
          config: { model: 'deepseek-flash' },
          secrets: { apiKey: dsSecret },
        },
        201,
      )
    ).value.connection;
    ok(!JSON.stringify(ds).includes(dsSecret), '模型连接响应不包含API密钥');
    const vault = await (
      await Promise.resolve(runtime.database)
    )
      .prepare(
        "SELECT ciphertext FROM treasure_integration_secrets WHERE connectionId=? AND field='apiKey'",
      )
      .bind(ds.id)
      .first();
    ok(
      vault.ciphertext && !vault.ciphertext.includes(dsSecret),
      '模型密钥以密文保存',
    );
    async function modelAction(
      c,
      action,
      model,
      projectId = '',
      preferenceVersion = 0,
      expected = 200,
    ) {
      return (
        await req(
          '/api/platform/models',
          {
            companyId: company,
            action,
            connectionId: c.id,
            version: c.version,
            model,
            projectId,
            preferenceVersion,
          },
          expected,
        )
      ).value;
    }
    const listed = await modelAction(ds, 'catalog.refresh', 'deepseek-flash');
    ok(
      listed.status === 'success' && listed.models.includes('deepseek-flash'),
      'DeepSeek账户模型列表真实协议获取并落库',
    );
    await modelAction(ds, 'select', 'deepseek-flash', '', 0, 400);
    const dsTest = await modelAction(ds, 'test', 'deepseek-flash');
    ok(
      dsTest.status === 'success' &&
        dsTest.message.includes('MODEL_CONNECTION_OK') &&
        dsTest.outputTokens > 0,
      'DeepSeek真实推理测试适配器返回与usage入库',
    );
    await modelAction(ds, 'select', 'deepseek-flash');
    let modelState = (await req('/api/platform/models?companyId=' + company))
      .value;
    ok(
      modelState.active.connectionId === ds.id &&
        modelState.active.model === 'deepseek-flash',
      '企业默认模型落库并被执行配置读取',
    );
    const oa = (
      await req(
        '/api/platform/integrations',
        {
          companyId: company,
          action: 'connection.save',
          provider: 'openai',
          name: '验收OpenAI Codex连接',
          config: { model: 'gpt-6.1-sol' },
          secrets: { apiKey: 'qa-openai-secret-never-returned' },
        },
        201,
      )
    ).value.connection;
    const oaModels = await modelAction(oa, 'catalog.refresh', 'gpt-6.1-sol');
    ok(
      oaModels.models.includes('gpt-5.3-codex'),
      'OpenAI可用Codex模型列表获取并保存',
    );
    const oaTest = await modelAction(oa, 'test', 'gpt-6.1-sol');
    ok(
      oaTest.status === 'success' && oaTest.outputTokens > 0,
      'OpenAI Responses SDK流式推理测试通过',
    );
    await modelAction(oa, 'select', 'gpt-6.1-sol', projectA.id);
    const switched = await consent(
      await makeRun('content', { projectId: projectA.id }),
    );
    await execute(switched);
    const switchedResult = await detail(switched.id);
    ok(
      switchedResult.run.status === 'awaiting_review' &&
        switchedResult.tasks.every(
          (t) => t.provider === 'OpenAI / gpt-6.1-sol',
        ),
      '项目选择的OpenAI模型实际执行全部并行岗位与汇总',
    );
    modelState = (
      await req(
        '/api/platform/models?companyId=' +
          company +
          '&projectId=' +
          projectB.id,
      )
    ).value;
    ok(
      modelState.active.connectionId === ds.id,
      '项目模型覆盖不改变其他项目的企业默认',
    );
    const reread = (
      await req(
        '/api/platform/models?companyId=' +
          company +
          '&projectId=' +
          projectA.id,
      )
    ).value;
    ok(
      reread.active.connectionId === oa.id && reread.tests.length >= 4,
      '模型选择、列表缓存及测试记录重新打开仍存在',
    );
    const bad = await consent(await makeRun('content', { input: 'BAD_CITE' }));
    await execute(bad);
    const blocked = await detail(bad.id);
    ok(
      blocked.run.status === 'failed' &&
        blocked.tasks.every((t) => t.error.includes('引用')),
      '未知来源引用被确定性校验拦截',
    );
    // Simultaneous runs share tenant slots, while each transcript stays isolated.
    const pair = await Promise.all([makeRun(), makeRun()]);
    const pairConsent = await Promise.all(pair.map(consent));
    await Promise.all(pairConsent.map(execute));
    for (const run of pair) {
      const d = await detail(run.id);
      ok(
        d.events.every((e) => e.runId === run.id),
        '并发任务消息不串线',
      );
    }
    ok(maxActive <= 4, '多个任务共享企业4个并发名额');
    // Background retry blocks aggregation until the failed branch succeeds, reusing completed branches.
    let failing = await consent(
      await makeRun('content', { input: 'FAIL_ONCE' }),
    );
    await execute(failing);
    const failed = await detail(failing.id);
    ok(
      failed.events.some((e) => e.type === 'retry'),
      '临时失败会进入后台退避重试',
    );
    ok(
      failed.run.status === 'awaiting_review' &&
        failed.tasks
          .filter((t) => t.spec.name !== '新媒体运营')
          .every((t) => t.attempt === 1) &&
        failed.tasks.find((t) => t.spec.name === '新媒体运营').attempt === 2,
      '后台恢复仅重试失败岗位，复用已完成成果',
    );
    // A new human decision fences in-flight writes and requires new consent.
    let slow = await consent(await makeRun('content', { input: 'SLOW' }));
    const pending = execute(slow);
    const mid = await waitFor(
      slow.id,
      (d) => d.events.filter((e) => e.type === 'started').length >= 2,
    );
    await agent(
      {
        companyId: company,
        action: 'execute',
        id: slow.id,
        version: slow.version,
      },
      409,
    );
    const revised = (
      await agent({
        companyId: company,
        action: 'decision',
        id: slow.id,
        version: mid.run.version,
        text: '人工改变目标，保留历史重新执行',
      })
    ).value.run;
    await pending;
    const paused = await detail(slow.id);
    ok(
      paused.run.status === 'paused' &&
        paused.run.generation === 2 &&
        paused.tasks.every((t) => t.status === 'pending' && !t.content),
      '人工决策新版本阻止旧结果覆盖',
    );
    const decisionSeq = paused.events.find((e) => e.type === 'decision').seq;
    ok(
      !paused.events.some((e) => e.seq > decisionSeq && e.generation === 1),
      '人工决策后旧版本不再提交消息',
    );
    await agent(
      {
        companyId: company,
        action: 'execute',
        id: slow.id,
        version: paused.run.version,
      },
      403,
    );
    const edited = await agent({
      companyId: company,
      action: 'task.edit',
      id: slow.id,
      version: paused.run.version,
      taskId: paused.tasks[0].id,
      content: '人工修订的岗位成果',
    });
    slow = await consent(edited.value.run);
    await execute(slow);
    const revisedFinal = await detail(slow.id);
    ok(
      revisedFinal.tasks[0].provider === '人工修订' &&
        revisedFinal.run.status === 'awaiting_review',
      '人工修订成果被复用，剩余岗位继续并最终核对',
    );
    // CAS makes two conflicting decisions deterministic and logs only the winner.
    const cas = await makeRun(),
      decisions = await Promise.all(
        ['方案甲', '方案乙'].map((text) =>
          fetch(base + '/api/platform/agents', {
            method: 'POST',
            headers: {
              Cookie: cookie,
              'Content-Type': 'application/json',
              Origin: base,
            },
            body: JSON.stringify({
              companyId: company,
              action: 'decision',
              id: cas.id,
              version: cas.version,
              text,
            }),
          }),
        ),
      );
    ok(
      decisions.filter((r) => r.status === 200).length === 1 &&
        decisions.filter((r) => r.status === 409).length === 1,
      '并发人工修改仅一个成功',
    );
    ok(
      (await detail(cas.id)).events.filter((e) => e.type === 'decision')
        .length === 1,
      '冲突失败的人工修改不会产生虚假审计',
    );
    // Narrow project policy cannot widen the tenant policy.
    const policy = {
      ...catalog.defaultPolicy,
      knowledgeMode: 'selected',
      knowledgeIds: [ka.id],
      includeShared: false,
      concurrency: 2,
      tokenBudget: 1000,
    };
    await agent({
      companyId: company,
      action: 'policy.save',
      projectId: projectA.id,
      version: 0,
      config: policy,
    });
    const narrowed = await makeRun('content', { projectId: projectA.id });
    ok(
      narrowed.snapshot.sources.length === 1 &&
        narrowed.snapshot.sources[0].id === ka.id &&
        narrowed.policy.concurrency === 2,
      '项目知识白名单和并行预算实际生效',
    );
    const reusable = await confirmed(
      await create('aiRole', '项目A内容岗位', {
        role: '自定义',
        instructions: '只整理项目A允许的资料',
        criteria: '注明来源和缺失',
        knowledgeLayer: '岗位经验',
        tool: '生成草稿',
        tokenBudget: '1000',
        capabilities: 'knowledge,copy',
        projectId: projectA.id,
        knowledgeIds: ka.id,
      }),
    );
    const bound = await makeRun('content', {
      projectId: projectA.id,
      agents: catalog.scenes
        .find((s) => s.id === 'content')
        .agents.map((a, i) => ({ ...a, roleId: i === 0 ? reusable.id : '' })),
    });
    const boundTasks = (await detail(bound.id)).tasks;
    ok(
      boundTasks[0].spec.knowledgeIds.length === 1 &&
        boundTasks[0].spec.knowledgeIds[0] === ka.id,
      '已确认自定义岗位的项目与知识限制实际适配',
    );
    const file = {
      name: '隔离资料.txt',
      mime: 'text/plain',
      data: Buffer.from('隔离文档正文').toString('base64'),
      segments: ['隔离文档正文'],
    };
    const fileA = (
      await req(
        '/api/platform/knowledge-import',
        { companyId: company, projectId: projectA.id, ...file },
        201,
      )
    ).value;
    const fileB = (
      await req(
        '/api/platform/knowledge-import',
        { companyId: company, projectId: projectB.id, ...file },
        201,
      )
    ).value;
    ok(fileA.id !== fileB.id, '相同文档可在两个独立项目分别入库');
    const fileReplay = (
      await req('/api/platform/knowledge-import', {
        companyId: company,
        projectId: projectA.id,
        ...file,
      })
    ).value;
    ok(
      fileReplay.replayed && fileReplay.id === fileA.id,
      '文档入库按租户和项目去重',
    );
    await agent(
      {
        companyId: company,
        action: 'policy.save',
        projectId: projectA.id,
        version: 1,
        config: { ...policy, knowledgeIds: [kb.id] },
      },
      400,
    );
    await agent({
      companyId: company,
      action: 'policy.save',
      projectId: '',
      version: 0,
      config: {
        ...catalog.defaultPolicy,
        capabilities: ['knowledge', 'review'],
      },
    });
    const restrictedRoles = (
      await req('/api/platform/agents?companyId=' + company)
    ).value.roleTemplates;
    ok(
      restrictedRoles.every((role) =>
        role.capabilities.every((id) => ['knowledge', 'review'].includes(id)),
      ),
      '岗位自动分配能力不超出企业授权范围',
    );
    await agent(
      {
        companyId: company,
        action: 'create',
        sceneId: 'content',
        goal: '超能力边界',
        input: '测试',
      },
      400,
    );
    // Member/viewer authorization and sensitive run visibility.
    const sessions = {};
    for (const role of ['member', 'viewer']) {
      const creds = {
        email: `${role}@example.test`,
        password: 'Isolated-Agent-QA-2026',
        name: role,
      };
      await req(
        '/api/platform/team',
        { companyId: company, action: 'member.create', role, ...creds },
        201,
      );
      const logged = await req('/api/platform/auth', {
        action: 'login',
        ...creds,
      });
      sessions[role] = logged.response.headers.get('set-cookie').split(';')[0];
    }
    await req(
      '/api/platform/agents?companyId=' + companyB,
      undefined,
      403,
      sessions.member,
    );
    await req(
      '/api/platform/models?companyId=' + company,
      undefined,
      403,
      sessions.member,
    );
    await req(
      '/api/platform/models?companyId=' + companyB,
      undefined,
      403,
      sessions.member,
    );
    await agent(
      {
        companyId: company,
        action: 'create',
        sceneId: 'content',
        goal: '查看者写入',
        input: '测试',
      },
      403,
      sessions.viewer,
    );
    const sensitive = (
      await req(
        '/api/platform/agents?companyId=' + company,
        undefined,
        200,
        sessions.member,
      )
    ).value;
    ok(
      sensitive.runs.every((r) => !r.sensitive),
      '成员列表不暴露敏感任务',
    );
    const financeRun = (
      await req('/api/platform/agents?companyId=' + company)
    ).value.runs.find((r) => r.sensitive);
    await req(
      `/api/platform/agents?companyId=${company}&id=${financeRun.id}`,
      undefined,
      403,
      sessions.member,
    );
    await agent(
      {
        companyId: company,
        action: 'consent.grant',
        id: narrowed.id,
        version: narrowed.version,
        generation: narrowed.generation,
        confirmed: true,
        destination: 'https://api.deepseek.com',
        scopes: [],
      },
      403,
      sessions.member,
    );
    const counts = await (
      await Promise.resolve(runtime.database)
    )
      .prepare(
        "SELECT (SELECT COUNT(*) FROM treasure_agent_runs) runs,(SELECT COUNT(*) FROM treasure_agent_tasks) tasks,(SELECT COUNT(*) FROM treasure_agent_events) events",
      )
      .first();
    ok(
      counts.runs >= 11 && counts.tasks >= 40 && counts.events > 100,
      '任务、岗位、消息均已落入独立 MySQL 8 数据库',
    );
    await agent({
      companyId: company,
      action: 'policy.save',
      projectId: '',
      version: 1,
      config: catalog.defaultPolicy,
    });
    await worker.stop();
    const durable = await consent(
      await makeRun('content', { input: 'SLOW 后台重启恢复' }),
    );
    await agent(
      {
        companyId: company,
        action: 'execute',
        id: durable.id,
        version: durable.version,
      },
      202,
    );
    await runtime.dispose();
    runtime = createRuntime();
    await runtime.ready;
    await startWorker();
    const resumed = await waitFor(
      durable.id,
      (d) => d.run.status === 'awaiting_review' && d.job?.status === 'done',
    );
    ok(
      resumed.job.status === 'done',
      '后台服务重启后自动领取之前已提交的持久化任务',
    );
    const restored = await detail(projectRun.id);
    ok(
      restored.run.status === 'approved' &&
        restored.events.length === (await detail(projectRun.id)).events.length,
      '服务重启后任务、人工确认及消息记录可恢复',
    );
    writeFileSync(resolve(folder, 'test-session.txt'), cookie);
    writeFileSync(
      resolve(folder, 'report.json'),
      JSON.stringify(
        {
          checks,
          results,
          maxConcurrentModelStreams: maxActive,
          modelRequests: calls.length,
          counts,
          folder,
        },
        null,
        2,
      ),
    );
    writeFileSync(
      'work/agent-qa-latest.json',
      JSON.stringify(
        {
          base,
          companyId: company,
          projectId: projectA.id,
          folder,
          credentials,
          checks,
          counts,
        },
        null,
        2,
      ),
    );
    console.log(
      JSON.stringify({
        success: true,
        checks,
        maxConcurrentModelStreams: maxActive,
        modelRequests: calls.length,
        counts,
        report: resolve(folder, 'report.json'),
      }),
    );
    if (process.argv.includes('--keep-open')) {
      console.log('AGENT_QA_READY ' + base);
      await new Promise((resolve) => {
        process.on('SIGINT', resolve);
        process.on('SIGTERM', resolve);
      });
    }
  }
} finally {
  await worker?.stop();
  await runtime.dispose();
  await globalThis.__treasureMysql?.pool.end();
  await target.drop();
}
