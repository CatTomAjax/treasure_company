import { database } from './store';
import { PlatformError, tenants, requireManager } from './platform-auth';
import { decodeRun, eventStatement, runById, tasksFor } from './agent-store';
import { claimRun, executeRun } from './agent-engine';
import type { AgentRun } from './agent-catalog';
import type { Actor } from './platform-service';
import type { PlatformUser } from './platform-config';
export type AgentJob = {
  id: string;
  companyId: string;
  runId: string;
  generation: number;
  status: string;
  requestedBy: string;
  attempts: number;
  availableAt: string;
  owner: string;
  token: string;
  lastError: string;
  createdAt: string;
  updatedAt: string;
};
const now = () => new Date().toISOString();
export async function jobFor(r: AgentRun) {
  return database()
    .prepare(
      "SELECT id,status,generation,attempts,availableAt,lastError,updatedAt FROM treasure_agent_jobs WHERE companyId=? AND runId=? AND generation=?",
    )
    .bind(r.companyId, r.id, r.generation)
    .first<AgentJob>();
}
export async function enqueueRun(r: AgentRun, actor: Actor) {
  const db = database(),
    old = await jobFor(r);
  if (old && ['queued', 'retry_wait', 'running'].includes(old.status))
    return old;
  if (!['queued', 'paused', 'failed'].includes(r.status))
    throw new PlatformError('请先暂停或刷新当前任务', 409);
  if (old && old.attempts >= 3)
    throw new PlatformError(
      '当前版本已达到后台重试上限，请修订决策后创建新的执行版本',
      409,
    );
  const id = old?.id || crypto.randomUUID(),
    marker = crypto.randomUUID(),
    at = now();
  const result = await db.batch([
    db
      .prepare(
        "UPDATE treasure_agent_runs SET status='queued',version=version+1,controlToken=?,updatedAt=? WHERE id=? AND companyId=? AND version=?",
      )
      .bind(marker, at, r.id, r.companyId, r.version),
    db
      .prepare(
        "INSERT INTO treasure_agent_jobs(id,companyId,runId,generation,status,requestedBy,availableAt,createdAt,updatedAt) SELECT ?,?,?,?,'queued',?,?,?,? WHERE EXISTS(SELECT 1 FROM treasure_agent_runs WHERE id=? AND controlToken=?) ON DUPLICATE KEY UPDATE status='queued',requestedBy=VALUES(requestedBy),availableAt=VALUES(availableAt),owner='',token='',lastError='',updatedAt=VALUES(updatedAt)",
      )
      .bind(
        id,
        r.companyId,
        r.id,
        r.generation,
        actor.user.id,
        at,
        at,
        at,
        r.id,
        marker,
      ),
    db
      .prepare(
        "INSERT INTO treasure_agent_events(companyId,runId,generation,type,actor,content,createdAt) SELECT ?,?,?,'submitted',?,?,? WHERE EXISTS(SELECT 1 FROM treasure_agent_runs WHERE id=? AND controlToken=?)",
      )
      .bind(
        r.companyId,
        r.id,
        r.generation,
        actor.user.name,
        '任务已持久化提交后台队列，关闭页面后仍继续执行。',
        at,
        r.id,
        marker,
      ),
  ]);
  if (!result[0].meta.changes)
    throw new PlatformError('任务已更新，请刷新后重试', 409);
  return jobFor(r);
}
/** Called only by the authenticated server consumer, independently of browser connections. */
export async function consumeJob(
  jobId: string,
  owner: string,
  signal: AbortSignal,
) {
  const db = database(),
    job = await db
      .prepare("SELECT * FROM treasure_agent_jobs WHERE id=?")
      .bind(jobId)
      .first<AgentJob>();
  if (
    !job ||
    !['queued', 'retry_wait'].includes(job.status) ||
    job.availableAt > now()
  )
    return;
  const raw = await db
    .prepare("SELECT * FROM treasure_agent_runs WHERE companyId=? AND id=?")
    .bind(job.companyId, job.runId)
    .first<Record<string, unknown>>();
  if (!raw) return;
  let r = decodeRun(raw);
  const token = crypto.randomUUID();
  const claim = await db
    .prepare(
      "UPDATE treasure_agent_jobs SET status='running',owner=?,token=?,attempts=attempts+1,updatedAt=? WHERE id=? AND status IN ('queued','retry_wait') AND availableAt<=? AND generation=? AND EXISTS(SELECT 1 FROM treasure_agent_runs WHERE id=? AND generation=? AND status IN ('queued','failed'))",
    )
    .bind(owner, token, now(), job.id, now(), r.generation, r.id, r.generation)
    .run();
  if (!claim.meta.changes) return;
  let lastError = '';
  try {
    const user = await db
      .prepare(
        "SELECT id,name,email,isAdmin FROM treasure_platform_users WHERE id=? AND active=1",
      )
      .bind(job.requestedBy)
      .first<PlatformUser>();
    if (!user) throw new PlatformError('任务提交人已停用，后台执行已停止', 403);
    const tenant = (await tenants({ ...user, isAdmin: !!user.isAdmin })).find(
      (t) => t.id === job.companyId,
    );
    if (!tenant || tenant.role === 'viewer')
      throw new PlatformError('任务提交人已失去企业执行权限', 403);
    if (r.sensitive) requireManager(tenant.role);
    r = await runById(job.companyId, job.runId, tenant.role);
    if (r.generation !== job.generation)
      throw new PlatformError('执行版本已变化', 409);
    const claimed = await claimRun(r);
    await executeRun(claimed, () => {}, signal, true);
  } catch (e) {
    if (!(e instanceof PlatformError)) console.error('Agent execution failed', e);
    lastError =
      e instanceof PlatformError ? e.message : '后台执行连接异常，等待恢复';
  }
  const latest = await db
    .prepare(
      "SELECT status,generation,leaseToken FROM treasure_agent_runs WHERE id=? AND companyId=?",
    )
    .bind(job.runId, job.companyId)
    .first<{ status: string; generation: number; leaseToken: string }>();
  if (!latest) return;
  let status = 'failed';
  if (latest.generation !== job.generation || latest.status === 'cancelled')
    status = 'cancelled';
  else if (['awaiting_review', 'approved'].includes(latest.status))
    status = 'done';
  else if (latest.status === 'paused') status = 'paused';
  else if (latest.status === 'failed') {
    const errors = (await tasksFor(r))
      .filter((t) => t.status === 'failed')
      .map((t) => t.error);
    lastError = lastError || errors.join('；') || '汇总请求失败';
    if (
      job.attempts + 1 < 3 &&
      !/授权|权限|鉴权|模型配置无效|配置已变化|停用|引用|超出|上限|未配置/.test(
        lastError,
      )
    )
      status = 'retry_wait';
  }
  const availableAt = new Date(
    Date.now() + (job.attempts + 1) * 3000,
  ).toISOString();
  const result = await db
    .prepare(
      "UPDATE treasure_agent_jobs SET status=?,availableAt=?,lastError=?,updatedAt=?,token='' WHERE id=? AND token=? AND status='running'",
    )
    .bind(status, availableAt, lastError, now(), job.id, token)
    .run();
  if (result.meta.changes && status === 'retry_wait')
    await eventStatement(
      job.companyId,
      job.runId,
      job.generation,
      'retry',
      '后台调度器',
      '后台将重试未完成岗位，已完成的岗位成果会复用。',
    ).run();
}
