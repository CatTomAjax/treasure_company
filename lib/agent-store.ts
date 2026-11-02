import { database } from './store';
import { PlatformError, requireManager } from './platform-auth';
import { allRecords, getRecord } from './platform-service';
import {
  capabilities,
  capabilityIds,
  defaultPolicy,
  scenes,
  sensitiveCapabilities,
  recommendScene,
  type AgentPolicy,
  type AgentRun,
  type AgentTask,
  type AgentSpec,
  type KnowledgeSource,
} from './agent-catalog';
import type { Actor } from './platform-service';
import { enterpriseRoles } from './enterprise-roles';
const now = () => new Date().toISOString();
export const decodeRun = (r: Record<string, unknown>): AgentRun =>
  ({
    ...r,
    policy: JSON.parse(String(r.policy)),
    snapshot: JSON.parse(String(r.snapshot)),
    directives: JSON.parse(String(r.directives)),
    authorization: JSON.parse(String(r.authorization || 'null')),
  }) as AgentRun;
export const decodeTask = (r: Record<string, unknown>): AgentTask =>
  ({
    ...r,
    spec: JSON.parse(String(r.spec)),
    sources: JSON.parse(String(r.sources)),
  }) as AgentTask;
export async function runById(companyId: string, id: string, role: string) {
  const raw = await database()
    .prepare("SELECT * FROM treasure_agent_runs WHERE companyId=? AND id=?")
    .bind(companyId, id)
    .first<Record<string, unknown>>();
  if (!raw) throw new PlatformError('执行任务不存在', 404);
  const r = decodeRun(raw);
  if (r.sensitive) requireManager(role);
  return r;
}
export async function tasksFor(r: AgentRun) {
  return (
    await database()
      .prepare(
        "SELECT * FROM treasure_agent_tasks WHERE companyId=? AND runId=? ORDER BY sortOrder",
      )
      .bind(r.companyId, r.id)
      .all<Record<string, unknown>>()
  ).results.map(decodeTask);
}
export function eventStatement(
  companyId: string,
  runId: string,
  generation: number,
  type: string,
  actor: string,
  content: string,
  taskId = '',
) {
  return database()
    .prepare(
      "INSERT INTO treasure_agent_events(companyId,runId,taskId,generation,type,actor,content,createdAt) VALUES(?,?,?,?,?,?,?,?)",
    )
    .bind(companyId, runId, taskId, generation, type, actor, content, now());
}
export async function policyFor(companyId: string, projectId: string) {
  const row = await database()
    .prepare(
      "SELECT config,version FROM treasure_agent_policies WHERE companyId=? AND projectId=?",
    )
    .bind(companyId, projectId)
    .first<{ config: string; version: number }>();
  return {
    config: row
      ? (JSON.parse(row.config) as AgentPolicy)
      : { ...defaultPolicy },
    version: row?.version || 0,
  };
}
export function parsePolicy(v: unknown): AgentPolicy {
  if (!v || typeof v !== 'object' || Array.isArray(v))
    throw new PlatformError('知识与能力配置无效');
  const p = v as AgentPolicy;
  if (
    !Array.isArray(p.capabilities) ||
    p.capabilities.length > capabilityIds.length ||
    p.capabilities.some(
      (x) => typeof x !== 'string' || !capabilityIds.includes(x),
    ) ||
    !p.capabilities.includes('review')
  )
    throw new PlatformError('能力无效，必须保留汇总核对能力');
  if (
    !['all', 'selected'].includes(p.knowledgeMode) ||
    !Array.isArray(p.knowledgeIds) ||
    p.knowledgeIds.length > 200 ||
    p.knowledgeIds.some((x) => typeof x !== 'string' || x.length > 200) ||
    typeof p.includeShared !== 'boolean'
  )
    throw new PlatformError('知识范围无效');
  if (
    !Number.isInteger(p.concurrency) ||
    p.concurrency < 1 ||
    p.concurrency > 4 ||
    !Number.isInteger(p.tokenBudget) ||
    p.tokenBudget < 512 ||
    p.tokenBudget > 4000
  )
    throw new PlatformError('并行数须为1至4，单岗位输出预算须为512至4000');
  return {
    capabilities: [...new Set(p.capabilities)],
    knowledgeMode: p.knowledgeMode,
    knowledgeIds: [...new Set(p.knowledgeIds)],
    includeShared: p.includeShared,
    concurrency: p.concurrency,
    tokenBudget: p.tokenBudget,
  };
}
export function intersectPolicies(a: AgentPolicy, b: AgentPolicy): AgentPolicy {
  const restricted =
    a.knowledgeMode === 'selected' || b.knowledgeMode === 'selected';
  return {
    capabilities: a.capabilities.filter((x) => b.capabilities.includes(x)),
    knowledgeMode: restricted ? 'selected' : 'all',
    knowledgeIds: restricted
      ? (a.knowledgeMode === 'selected'
          ? a.knowledgeIds
          : b.knowledgeIds
        ).filter(
          (x) => b.knowledgeMode !== 'selected' || b.knowledgeIds.includes(x),
        )
      : [],
    includeShared: a.includeShared && b.includeShared,
    concurrency: Math.min(a.concurrency, b.concurrency),
    tokenBudget: Math.min(a.tokenBudget, b.tokenBudget),
  };
}
export async function projectExists(companyId: string, projectId: string) {
  if (!projectId) return;
  // Project IDs are always resolved inside this tenant; a posted ID conveys no authority.
  const r = await getRecord(companyId, projectId);
  if (r.kind !== 'project') throw new PlatformError('请选择当前企业的项目');
}
export async function knowledgeFor(
  companyId: string,
  projectId: string,
  policy: AgentPolicy,
) {
  return (await allRecords(companyId))
    .filter(
      (r) =>
        r.kind === 'knowledge' &&
        r.status === '已确认' &&
        (r.data.projectId === projectId ||
          (!r.data.projectId && policy.includeShared)) &&
        (policy.knowledgeMode !== 'selected' ||
          policy.knowledgeIds.includes(r.id)),
    )
    .map((r) => ({
      id: r.id,
      title: r.title,
      version: r.version,
      layer: r.data.layer,
      projectId: r.data.projectId || '',
      content: r.data.content.slice(0, 12000),
      source: r.data.source,
    }));
}
function stringValue(v: unknown, label: string, max = 12000, optional = false) {
  if (typeof v !== 'string' || (!optional && !v.trim()) || v.length > max)
    throw new PlatformError(`请检查${label}`);
  return v.trim();
}
export async function createRun(
  companyId: string,
  b: Record<string, unknown>,
  actor: Actor,
) {
  const goal = stringValue(b.goal, '任务目标'),
    input = stringValue(b.input || '', '业务资料', 24000, true),
    projectId = stringValue(b.projectId || '', '关联项目', 200, true);
  await projectExists(companyId, projectId);
  const scene =
    b.sceneId === 'auto'
      ? recommendScene(goal + ' ' + input)
      : scenes.find((s) => s.id === b.sceneId);
  if (!scene) throw new PlatformError('请选择业务场景');
  const tenantPolicy = (await policyFor(companyId, '')).config;
  const policy = projectId
    ? intersectPolicies(
        tenantPolicy,
        (await policyFor(companyId, projectId)).config,
      )
    : tenantPolicy;
  let specs: AgentSpec[] = scene.agents.map((s) => ({ ...s }));
  if (b.agents !== undefined) {
    if (!Array.isArray(b.agents) || b.agents.length !== specs.length)
      throw new PlatformError('岗位数量与场景不一致');
    if (b.agents.some((v) => !v || typeof v !== 'object' || Array.isArray(v)))
      throw new PlatformError('岗位配置格式无效');
    const rawAgents = b.agents as AgentSpec[];
    specs = specs.map((s) => {
      const raw = rawAgents.find((v) => v.id === s.id);
      if (
        !raw ||
        !Array.isArray(raw.capabilities) ||
        !raw.capabilities.length ||
        raw.capabilities.some((c) => !capabilityIds.includes(c))
      )
        throw new PlatformError('岗位能力无效');
      if (
        raw.knowledgeIds !== undefined &&
        (!Array.isArray(raw.knowledgeIds) ||
          raw.knowledgeIds.length > 200 ||
          raw.knowledgeIds.some((k) => typeof k !== 'string'))
      )
        throw new PlatformError('岗位知识范围无效');
      if (
        raw.templateId &&
        !enterpriseRoles.some((role) => role.id === raw.templateId)
      )
        throw new PlatformError('岗位预设无效');
      return {
        id: s.id,
        name: stringValue(raw.name, '岗位名称', 80),
        instructions: stringValue(raw.instructions, '岗位职责', 6000),
        criteria: stringValue(raw.criteria, '交付标准', 2000),
        capabilities: [...new Set(raw.capabilities)],
        roleId: stringValue(raw.roleId || '', '自定义岗位', 200, true),
        templateId: raw.templateId || undefined,
        knowledgeIds: raw.knowledgeIds || [],
      };
    });
  }
  const sources = await knowledgeFor(companyId, projectId, policy);
  for (const s of specs) {
    if (s.roleId) {
      const role = await getRecord(companyId, s.roleId);
      if (
        role.kind !== 'aiRole' ||
        role.status !== '已确认' ||
        (role.data.projectId && role.data.projectId !== projectId)
      )
        throw new PlatformError('绑定岗位须已确认且属于当前项目或企业通用');
      const configuredCaps = (role.data.capabilities || '')
        .split(/[\s,，]+/)
        .filter(Boolean);
      if (configuredCaps.length)
        s.capabilities = s.capabilities.filter((c) =>
          configuredCaps.includes(c),
        );
      s.instructions = role.data.instructions + '\n场景职责：' + s.instructions;
      s.criteria = role.data.criteria + '\n' + s.criteria;
      const configuredIds = (role.data.knowledgeIds || '')
        .split(/[\s,，]+/)
        .filter(Boolean);
      const permittedSources = sources.filter(
        (k) =>
          (role.data.knowledgeLayer === '全部已确认知识' ||
            k.layer === role.data.knowledgeLayer) &&
          (!configuredIds.length || configuredIds.includes(k.id)),
      );
      const intersected = permittedSources
        .filter((k) => !s.knowledgeIds?.length || s.knowledgeIds.includes(k.id))
        .map((k) => k.id);
      // An explicit empty result must mean no knowledge, not unrestricted knowledge.
      s.knowledgeIds = intersected.length
        ? intersected
        : ['__no_authorized_source__'];
    }
    if (
      !s.capabilities.length ||
      s.capabilities.some((c) => !policy.capabilities.includes(c))
    )
      throw new PlatformError(
        `${s.name}的能力超出租户或项目配置，请调整岗位能力`,
      );
    if (
      s.knowledgeIds?.some(
        (id) =>
          id !== '__no_authorized_source__' &&
          !sources.some((k) => k.id === id),
      )
    )
      throw new PlatformError('岗位知识超出已授权范围');
  }
  if (scene.id === 'knowledge' && sources.length > 24)
    throw new PlatformError(
      '单次知识批处理最多24条资料，请缩小知识范围或分批执行',
    );
  if (scene.id === 'knowledge')
    specs.forEach((s, index) => {
      if (!s.knowledgeIds?.length) {
        const assigned = sources
          .filter((_, i) => i % specs.length === index)
          .map((k) => k.id);
        s.knowledgeIds = assigned.length
          ? assigned
          : ['__no_authorized_source__'];
      }
      s.instructions +=
        '\n逐条处理分配到的资料，输出事实、知识分类、冲突疑点与可复用经验；不要宣称处理未分配的资料。跨文档去重与综合核对交由汇总岗位完成。';
    });
  const sensitive = specs.some((s) =>
    s.capabilities.some((c) => sensitiveCapabilities.includes(c)),
  );
  if (sensitive) requireManager(actor.role);
  const kinds = new Set(
    specs.flatMap((s) =>
      s.capabilities.flatMap(
        (id) => capabilities.find((c) => c.id === id)?.kinds || [],
      ),
    ),
  );
  const records = (await allRecords(companyId))
    .filter(
      (r) =>
        r.kind !== 'knowledge' &&
        kinds.has(r.kind as never) &&
        (r.kind === 'project'
          ? !!projectId && r.id === projectId
          : projectId
            ? r.data.projectId === projectId
            : !r.data.projectId),
    )
    .slice(0, 150)
    .map((r) => ({
      id: r.id,
      kind: r.kind,
      title: r.title,
      version: r.version,
      data: r.data,
    }));
  let finance: unknown = null;
  if (specs.some((s) => s.capabilities.includes('cash'))) {
    requireManager(actor.role);
    // A project task never receives the whole tenant ledger.
    const result = await database()
      .prepare(
        "SELECT b.id,b.title,b.kind,b.amountCents,b.paidCents,b.status,b.dueDate FROM treasure_finance_bills b WHERE b.companyId=? AND (?='' OR b.id IN (SELECT targetId FROM treasure_business_automations WHERE companyId=? AND sourceId IN (SELECT id FROM treasure_business_records WHERE companyId=? AND JSON_UNQUOTE(JSON_EXTRACT(data,'$.projectId'))=?))) LIMIT 150",
      )
      .bind(companyId, projectId, companyId, companyId, projectId)
      .all();
    finance = result.results;
  }
  if (JSON.stringify({ sources, records, finance }).length > 220000)
    throw new PlatformError(
      '本次知识和业务快照超出预算，请在知识与能力边界中选择更小的范围',
    );
  const r: AgentRun = {
    id: crypto.randomUUID(),
    companyId,
    projectId,
    sceneId: scene.id,
    title: goal.slice(0, 120),
    goal,
    input,
    status: 'queued',
    version: 1,
    generation: 1,
    policy,
    snapshot: { sources, records, finance },
    directives: [],
    summary: '',
    checks: '',
    sensitive: sensitive ? 1 : 0,
    createdBy: actor.user.name,
    approvedBy: '',
    createdAt: now(),
    updatedAt: now(),
  };
  const db = database();
  await db.batch([
    db
      .prepare(
        "INSERT INTO treasure_agent_runs(id,companyId,projectId,sceneId,title,goal,input,status,policy,snapshot,`sensitive`,createdBy,createdAt,updatedAt) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
      )
      .bind(
        r.id,
        companyId,
        projectId,
        r.sceneId,
        r.title,
        goal,
        input,
        r.status,
        JSON.stringify(policy),
        JSON.stringify(r.snapshot),
        r.sensitive,
        r.createdBy,
        r.createdAt,
        r.updatedAt,
      ),
    ...specs.map((s) =>
      db
        .prepare(
          "INSERT INTO treasure_agent_tasks(id,companyId,runId,spec) VALUES(?,?,?,?)",
        )
        .bind(crypto.randomUUID(), companyId, r.id, JSON.stringify(s)),
    ),
    eventStatement(
      companyId,
      r.id,
      1,
      'created',
      actor.user.name,
      `${scene.name}：已配置${specs.length}个独立岗位；知识与业务版本已冻结，等待执行。`,
    ),
  ]);
  return r;
}
export async function controlRun(
  r: AgentRun,
  b: Record<string, unknown>,
  actor: Actor,
) {
  if (b.version !== r.version)
    throw new PlatformError('任务已被其他人更新，请刷新后重试', 409);
  const action = String(b.action),
    db = database(),
    marker = crypto.randomUUID();
  if (['approved', 'cancelled'].includes(r.status))
    throw new PlatformError('已确认或已取消的任务不能再修改，请新建任务', 409);
  let status = r.status,
    generation = r.generation,
    summary = r.summary,
    directives = [...r.directives],
    approvedBy = '',
    message = '',
    reset = false;
  if (action === 'pause') {
    if (!['running', 'checking', 'queued', 'failed'].includes(r.status))
      throw new PlatformError('当前状态不能暂停', 409);
    status = 'paused';
    message = '人工暂停，正在执行的旧请求将停止提交。';
  } else if (action === 'decision') {
    requireManager(actor.role);
    const text = stringValue(b.text, '人工决策', 6000);
    directives.push({ actor: actor.user.name, text, at: now() });
    status = 'paused';
    generation++;
    summary = '';
    reset = true;
    message = text;
  } else if (action === 'cancel') {
    status = 'cancelled';
    message = '人工取消执行。';
  } else if (action === 'approve') {
    requireManager(actor.role);
    if (r.status !== 'awaiting_review' || !r.summary)
      throw new PlatformError('须完成全部岗位与汇总核对后才能确认', 409);
    const ts = await tasksFor(r);
    if (
      ts.some((t) => t.status !== 'completed' || t.generation !== r.generation)
    )
      throw new PlatformError('存在未完成岗位', 409);
    if (b.checksConfirmed !== true)
      throw new PlatformError('请确认已核对来源、分歧、缺失及对外承诺');
    status = 'approved';
    summary = stringValue(b.summary, '最终成果', 60000);
    approvedBy = actor.user.name;
    message = '已人工核对并确认最终成果。';
  } else if (action === 'task.edit') {
    requireManager(actor.role);
    if (r.status !== 'paused')
      throw new PlatformError('请先暂停再编辑岗位成果', 409);
    const task = (await tasksFor(r)).find((t) => t.id === b.taskId);
    if (!task) throw new PlatformError('岗位不存在', 404);
    message = stringValue(b.content, '岗位成果', 40000);
    status = 'paused';
    summary = '';
  } else throw new PlatformError('控制操作无效');
  const condition =
    "EXISTS (SELECT 1 FROM treasure_agent_runs WHERE id=? AND controlToken=?)";
  const ops = [
    db
      .prepare(
        "UPDATE treasure_agent_runs SET status=?,version=version+1,generation=?,directives=?,summary=?,checks=?,approvedBy=?,updatedAt=?,leaseToken='',leaseUntil='',authorization=?,controlToken=? WHERE companyId=? AND id=? AND version=?",
      )
      .bind(
        status,
        generation,
        JSON.stringify(directives),
        summary,
        reset ? '' : r.checks,
        approvedBy,
        now(),
        reset ? 'null' : JSON.stringify(r.authorization || null),
        marker,
        r.companyId,
        r.id,
        r.version,
      ),
  ];
  if (reset)
    ops.push(
      db
        .prepare(
          `UPDATE treasure_agent_tasks SET status='pending',content='',sources='[]',error='',attempt=0,generation=?,startedAt='',finishedAt='' WHERE runId=? AND ${condition}`,
        )
        .bind(generation, r.id, r.id, marker),
    );
  else if (action === 'pause' || action === 'cancel')
    ops.push(
      db
        .prepare(
          `UPDATE treasure_agent_tasks SET status='pending' WHERE runId=? AND status='running' AND ${condition}`,
        )
        .bind(r.id, r.id, marker),
    );
  else if (action === 'task.edit')
    ops.push(
      db
        .prepare(
          `UPDATE treasure_agent_tasks SET status='completed',content=?,provider='人工修订',error='',finishedAt=? WHERE id=? AND runId=? AND ${condition}`,
        )
        .bind(message, now(), String(b.taskId), r.id, r.id, marker),
    );
  ops.push(
    db
      .prepare(
        `INSERT INTO treasure_agent_events(companyId,runId,generation,type,actor,content,createdAt) SELECT ?,?,?,?,?,?,? WHERE ${condition}`,
      )
      .bind(
        r.companyId,
        r.id,
        generation,
        action,
        actor.user.name,
        message,
        now(),
        r.id,
        marker,
      ),
  );
  if (['pause', 'cancel', 'decision', 'task.edit'].includes(action))
    ops.push(
      db
        .prepare(
          `UPDATE treasure_agent_jobs SET status=?,token='',updatedAt=? WHERE companyId=? AND runId=? AND status IN ('queued','retry_wait','running') AND ${condition}`,
        )
        .bind(
          action === 'cancel' || action === 'decision' ? 'cancelled' : 'paused',
          now(),
          r.companyId,
          r.id,
          r.id,
          marker,
        ),
    );
  const result = await db.batch(ops);
  if (!result[0].meta.changes)
    throw new PlatformError('任务已被其他人更新，请刷新', 409);
  return runById(r.companyId, r.id, actor.role);
}
