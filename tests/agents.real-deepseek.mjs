// Real DeepSeek verification: synthetic tenant/data only, credentials stay in memory.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { isolatedDatabase, createTestRuntime } from './mysql-runtime.mjs';
import { configuredDeepSeek } from './agent-real-credentials.mjs';
import { startAgentWorker } from '../scripts/agent-worker.mjs';
const credential = await configuredDeepSeek();
const browserProof = process.argv.includes('--browser-proof'),
  keepOpen = process.argv.includes('--keep-open');
const resume = process.argv.includes('--resume')
  ? JSON.parse(readFileSync('work/agent-real-latest.json','utf8')) : null;
if (!credential?.key)
  throw new Error(
    '尚无可用DeepSeek密钥。请在模型配置页面保存、真实测试并设为默认后重试。',
  );
const folder = resume?.folder || resolve('work', 'agent-real-' + crypto.randomUUID().slice(0, 8)),
  data = resolve(folder, 'data'),
  base = 'http://127.0.0.1:3007',
  token = crypto.randomUUID();
mkdirSync(folder, { recursive: true });
let target;
if(resume?.databaseName){const u=new URL(process.env.DATABASE_URL);u.pathname='/'+resume.databaseName;target={url:u.href,name:resume.databaseName}}else target=await isolatedDatabase('agents');
const runtime=createTestRuntime({url:target.url,port:3007,bindings:{DEEPSEEK_API_KEY:credential.key,DEEPSEEK_MODEL:credential.model,PLATFORM_MASTER_KEY:'b'.repeat(64),LOCAL_AI_DISABLED:'0',AGENT_WORKER_TOKEN:token}});
let worker,
  cookie = '',
  companyId,
  projectId;
const report = {
  status: 'running',
  provider: 'DeepSeek',
  model: credential.model,
  syntheticData: true,
  databaseName: target.name,
  folder,
  cases: [],
  startedAt: new Date().toISOString(),
};
if (resume) {
  Object.assign(report,JSON.parse(readFileSync(resolve(folder,'report.json'),'utf8')),
    {status:'running',resumedAt:new Date().toISOString()});
  delete report.error;
}
if (browserProof && existsSync(resolve(folder,'start.signal')))
  unlinkSync(resolve(folder,'start.signal'));
async function req(path, body, expected = 200) {
  const response = await fetch(base + path, {
    method: body ? 'POST' : 'GET',
    headers: {
      ...(cookie ? { Cookie: cookie } : {}),
      ...(body ? { 'Content-Type': 'application/json', Origin: base } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const value = await response.json();
  assert.equal(response.status, expected, JSON.stringify(value));
  return { value, response };
}
const agent = (body, expected = 200) =>
  req('/api/platform/agents', { companyId, ...body }, expected);
const detail = async (id) => {
  const result = (await req(`/api/platform/agents?companyId=${companyId}&id=${id}`)).value;
  let page = result;
  const events = [...result.events];
  while (page.hasMore) {
    page = (await req(`/api/platform/agents?companyId=${companyId}&id=${id}&after=${page.nextCursor}`)).value;
    events.push(...page.events);
  }
  return {...result,events};
};
function save() {
  writeFileSync(
    resolve(folder, 'report.json'),
    JSON.stringify(report, null, 2),
  );
}
async function record(kind, title, fields) {
  return (
    await req(
      '/api/platform',
      {
        companyId,
        action: 'record.create',
        kind,
        title,
        owner: '真实模型隔离验收',
        dueDate: '',
        data: fields,
      },
      201,
    )
  ).value.record;
}
async function confirmed(r) {
  for (const status of ['待审核', '已确认'])
    r = (
      await req('/api/platform', {
        companyId,
        action: 'record.transition',
        id: r.id,
        version: r.version,
        status,
      })
    ).value.record;
  return r;
}
try {
  await runtime.ready;
  if (resume) {
    cookie = readFileSync(resolve(folder,'test-session.txt'),'utf8');
    companyId=resume.companyId;
    projectId=resume.projectId;
  } else {
  const login = await req('/api/platform/auth', {
    action: 'setup',
    name: '真实模型隔离验收',
    email: 'real-model-qa@example.test',
    password: 'Synthetic-Real-Model-QA-2026',
  });
  cookie = login.response.headers.get('set-cookie').split(';')[0];
  companyId = (
    await req(
      '/api/platform/team',
      {
        companyId: 'park',
        action: 'tenant.create',
        name: '真实模型验收专用虚构企业',
      },
      201,
    )
  ).value.id;
  projectId = (
    await record('project', '合成开放日项目', {
      scope: '20人企业开放日策划、图文与主持，不含礼品摄影',
      amount: '6500',
      startDate: '2026-10-01',
      acceptanceCriteria: '交付清单完整、事实引用准确并等待人工确认',
    })
  ).id;
  const knowledge = [
    [
      '品牌与活动资料',
      '原始资料',
      '以下均为合成验收数据，不是真实企业事实：企业名为合成创客服务社。开放日计划2026-11-15举行，20人，面向科技企业。不对外发布，不承诺补贴、收益或成交。',
    ],
    [
      '需求与报价依据',
      '业务知识',
      '合成项目范围：场地、图文、主持、物料；不含礼品和摄影。预算场地2000元、内容1500元、主持500元、物料1000元，合计5000元。拟报价6500元。报价须列验收和付款条件，税率与税费尚未确认。',
    ],
    [
      '截至27日经营数据',
      '业务知识',
      '合成2026年10月截至27日数据：5条商机，其中待验证2、方案沟通1、成交1、未成交1。项目合同6500元，登记已收2000元、待收4500元；不代表银行已核验。预算5000元，当前登记成本5200元，含返工200元。',
    ],
    [
      '进度与复盘经验',
      '岗位经验',
      '合成项目：文案初稿已完成；客户尚未确认最终材料。材料确认计划截止2026-11-10。应核对范围、成本超预算200元、验收版本和待收款4500元。复用经验：先锁定资料版本，再生成多渠道内容，人工核对后交付。',
    ],
  ];
  for (const [title, layer, content] of knowledge)
    await confirmed(
      await record('knowledge', title, {
        layer,
        category: '合成验收',
        content,
        source: '隔离人工编制资料 v1 / 全部为虚构测试',
        projectId,
      }),
    );
  const catalog = (
    await req(
      '/api/platform/agents?companyId=' + companyId + '&projectId=' + projectId,
    )
  ).value;
  await agent({
    action: 'policy.save',
    projectId: '',
    version: 0,
    config: { ...catalog.defaultPolicy, concurrency: 2, tokenBudget: 2500 },
  });
  const goals = {
    content: '按合成资料生成公众号、小红书、海报版式说明与三镜头视频脚本',
    proposal: '根据合成客户需求整理方案、成本报价、范围与交付周期',
    monthly: '生成合成企业2026年10月截至27日经营月报与行动清单',
    knowledge: '将四份合成资料逐条整理为事实、分类、冲突和可复用经验',
    risk: '巡检合成开放日项目的进度、预算、范围、验收及回款风险',
  };
  for (const sceneId of Object.keys(goals)) {
    const scene = catalog.scenes.find((s) => s.id === sceneId),
      agents = scene.agents.map((a) => ({
        ...a,
        instructions:
          a.instructions +
          ' 每岗位控制在300汉字左右，引用资料ID和版本。仅输出岗位实际负责成果和待确认事项。',
      }));
    let run = (
      await agent(
        {
          action: 'create',
          sceneId,
          projectId,
          goal: goals[sceneId],
          input:
            '真实DeepSeek技术验收，所有资料与财务数字均为合成测试。只使用给定资料，不执行外部动作；总汇总控制在1200汉字内。',
          agents,
        },
        201,
      )
    ).value.run;
    const scopes = [
      '任务目标和业务资料',
      '选中知识快照',
      '能力允许的业务记录',
      '人工决策',
      ...(run.snapshot.finance ? ['财务数据'] : []),
    ];
    run = (
      await agent({
        action: 'consent.grant',
        id: run.id,
        version: run.version,
        generation: run.generation,
        destination: 'https://api.deepseek.com',
        confirmed: true,
        model: credential.model,
        scopes,
      })
    ).value.run;
    report.cases.push({ sceneId, id: run.id, version: run.version, status: 'authorized' });
    save();
    console.log(JSON.stringify({ sceneId, status: 'authorized', id: run.id }));
  }
  writeFileSync(resolve(folder, 'test-session.txt'), cookie);
  writeFileSync('work/agent-real-latest.json', JSON.stringify({
    folder, base, companyId, projectId, model: credential.model,
    credentials: { email: 'real-model-qa@example.test', password: 'Synthetic-Real-Model-QA-2026' },
    cases: report.cases.map(({sceneId,id})=>({sceneId,id})),
  }, null, 2));
  }
  if (browserProof) {
    console.log(JSON.stringify({ browserReady: true, folder, base, companyId }));
    const readyDeadline = Date.now() + 10 * 60 * 1000;
    while (!existsSync(resolve(folder, 'start.signal'))) {
      if (Date.now() > readyDeadline) throw new Error('等待浏览器断页验收启动超时');
      await new Promise(r=>setTimeout(r,500));
    }
  }
  for (const c of report.cases) {
    const d=await detail(c.id);
    if (['queued','failed','paused'].includes(d.run.status))
      await agent({ action: 'execute', id: c.id, version: d.run.version }, 202);
    c.status=d.run.status==='awaiting_review'?'awaiting_review':'submitted';
  }
  worker = startAgentWorker(runtime, {token,maxActive:2,onError:message=>console.error(message)});
  save();
  // No browser or long-lived execution HTTP response remains; the server consumer owns every run.
  let lastProgress = 0;
  const deadline = Date.now() + 15 * 60 * 1000;
  while (report.cases.some((c) => c.status !== 'awaiting_review')) {
    for (const c of report.cases.filter((c) => c.status !== 'awaiting_review')) {
      const d = await detail(c.id);
      c.status = d.run.status;
      if (d.run.status === 'failed' && d.job?.status === 'failed')
        throw new Error(
          c.sceneId +
            ' 后台执行失败：' +
            (d.job.lastError ||
              d.tasks
                .filter((t) => t.error)
                .map((t) => t.error)
                .join('；')),
        );
      if (d.run.status === 'awaiting_review') {
        assert.ok(
          d.tasks.every(
            (t) =>
              t.status === 'completed' &&
              t.provider.startsWith('DeepSeek /') &&
              t.inputTokens > 0 &&
              t.outputTokens > 0,
          ),
          '每个岗位必须有真实DeepSeek返回与usage',
        );
        const starts = d.events.filter((e) => e.type === 'started'),
          finishes = d.events.filter((e) => e.type === 'completed'),
          checks = JSON.parse(d.run.checks);
        assert.ok(
          starts.length >= 2 && starts[1].seq < finishes[0].seq,
          '真实模型调用应并行重叠',
        );
        assert.ok(
          d.run.summary.includes('统一成果') &&
            d.run.summary.includes('待确认'),
          '汇总应完整',
        );
        c.inputTokens =
          d.tasks.reduce((n, t) => n + t.inputTokens, 0) + checks.inputTokens;
        c.outputTokens =
          d.tasks.reduce((n, t) => n + t.outputTokens, 0) + checks.outputTokens;
        c.warnings = checks.warnings;
        c.summary = d.run.summary;
        writeFileSync(
          resolve(folder, c.sceneId + '.json'),
          JSON.stringify(
            { run: d.run, tasks: d.tasks, events: d.events, job: d.job },
            null,
            2,
          ),
        );
        console.log(
          JSON.stringify({
            sceneId: c.sceneId,
            status: c.status,
            inputTokens: c.inputTokens,
            outputTokens: c.outputTokens,
            warnings: c.warnings,
          }),
        );
      }
    }
    save();
    if (Date.now() > deadline) throw new Error('真实模型验收超时，记录已保存');
    if (Date.now() - lastProgress > 20000) {
      console.log(
        JSON.stringify({
          progress: report.cases.map((c) => ({
            sceneId: c.sceneId,
            status: c.status,
          })),
        }),
      );
      lastProgress = Date.now();
    }
    if (report.cases.some((c) => c.status !== 'awaiting_review'))
      await new Promise((r) => setTimeout(r, 1500));
  }
  report.status = 'passed_pending_human_confirmation';
  report.finishedAt = new Date().toISOString();
  save();
  console.log(
    JSON.stringify({
      success: true,
      report: resolve(folder, 'report.json'),
      cases: report.cases.map((c) => ({
        sceneId: c.sceneId,
        status: c.status,
        inputTokens: c.inputTokens,
        outputTokens: c.outputTokens,
      })),
    }),
  );
  if (keepOpen) {
    console.log(JSON.stringify({ awaitingHumanConfirmation: true, base, folder }));
    while (!existsSync(resolve(folder,'stop.signal')))
      await new Promise(r=>setTimeout(r,1000));
  }
} catch (e) {
  report.status = 'failed';
  report.error = e.message;
  save();
  throw e;
} finally {
  await worker?.stop();
  await runtime.dispose();
}
