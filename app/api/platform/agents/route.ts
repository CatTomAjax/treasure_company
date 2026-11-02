import { database } from '@/lib/store';
import { env } from '@/lib/server-env';
import { enqueueRun, jobFor } from '@/lib/agent-queue';
import {
  activeModelSettings,
  publicModel,
  settingsForTarget,
} from '@/lib/model-settings';
import {
  body,
  context,
  failure,
  PlatformError,
  reply,
  requireManager,
  str,
} from '@/lib/platform-auth';
import { allRecords } from '@/lib/platform-service';
import {
  capabilities,
  scenes,
  defaultPolicy,
  sensitiveCapabilities,
} from '@/lib/agent-catalog';
import {
  createRun,
  controlRun,
  decodeRun,
  eventStatement,
  knowledgeFor,
  parsePolicy,
  policyFor,
  projectExists,
  runById,
  tasksFor,
} from '@/lib/agent-store';
import { textModelSettings } from '@/lib/integration-secrets';
import {
  enterpriseRoles,
  permittedRoleCapabilities,
} from '@/lib/enterprise-roles';

export async function GET(request: Request) {
  try {
    const p = new URL(request.url).searchParams,
      companyId = p.get('companyId') || 'park';
    const { tenant } = await context(request, companyId),
      manager = ['admin', 'manager'].includes(tenant.role),
      db = database();
    if (p.get('id')) {
      const r = await runById(companyId, p.get('id')!, tenant.role),
        after = Number(p.get('after') || 0);
      if (!Number.isSafeInteger(after) || after < 0)
        throw new PlatformError('消息游标无效');
      const events = await db
        .prepare(
          "SELECT * FROM treasure_agent_events WHERE companyId=? AND runId=? AND seq>? ORDER BY seq LIMIT 300",
        )
        .bind(companyId, r.id, after)
        .all();
      return reply({
        run: r,
        tasks: await tasksFor(r),
        job: await jobFor(r),
        modelTarget: {
          ...publicModel(await activeModelSettings(companyId, r.projectId)),
          configured: !!(await activeModelSettings(companyId, r.projectId)).key,
        },
        events: events.results,
        nextCursor: events.results.length ? events.results.at(-1)!.seq : after,
        hasMore: events.results.length === 300,
      });
    }
    const projectId = p.get('projectId') || '';
    await projectExists(companyId, projectId);
    const records = await allRecords(companyId),
      tenantPolicy = await policyFor(companyId, ''),
      projectPolicy = projectId
        ? await policyFor(companyId, projectId)
        : tenantPolicy;
    const rows = await db
      .prepare(
        "SELECT * FROM treasure_agent_runs WHERE companyId=? AND (?=1 OR `sensitive`=0) ORDER BY createdAt DESC LIMIT 100",
      )
      .bind(companyId, manager ? 1 : 0)
      .all<Record<string, unknown>>();
    const jobRows = (
      await db
        .prepare(
          "SELECT runId,generation,status,attempts FROM treasure_agent_jobs WHERE companyId=?",
        )
        .bind(companyId)
        .all<{
          runId: string;
          generation: number;
          status: string;
          attempts: number;
        }>()
    ).results;
    const worker = await db
      .prepare(
        "SELECT heartbeatAt,leaseUntil FROM treasure_agent_workers WHERE id='default'",
      )
      .first<{ heartbeatAt: string; leaseUntil: string }>();
    const runs = rows.results
      .map(decodeRun)
      .map(({ snapshot, input, goal, directives, ...r }) => ({
        ...r,
        jobStatus: jobRows.find(
          (j) => j.runId === r.id && j.generation === r.generation,
        )?.status,
      }));
    const kb = records.filter(
      (r) =>
        r.kind === 'knowledge' &&
        (r.status === '已确认' || manager) &&
        (!r.data.projectId || r.data.projectId === projectId),
    );
    return reply({
      runs,
      worker: {
        enabled: !!(env as unknown as { AGENT_WORKER_TOKEN?: string })
          .AGENT_WORKER_TOKEN,
        healthy: !!worker && worker.leaseUntil > new Date().toISOString(),
        heartbeatAt: worker?.heartbeatAt || '',
      },
      role: tenant.role,
      aiConfigured: !!(await activeModelSettings(companyId, projectId)).key,
      activeModel: {
        ...publicModel(await activeModelSettings(companyId, projectId)),
        configured: !!(await activeModelSettings(companyId, projectId)).key,
      },
      scenes: scenes.filter(
        (s) =>
          manager ||
          !s.agents.some((a) =>
            a.capabilities.some((c) => sensitiveCapabilities.includes(c)),
          ),
      ),
      capabilities: capabilities.filter(
        (c) => manager || !sensitiveCapabilities.includes(c.id),
      ),
      roleTemplates: enterpriseRoles.map((role) => ({
        ...role,
        capabilities: permittedRoleCapabilities(
          role,
          capabilities
            .filter(
              (c) =>
                (manager || !sensitiveCapabilities.includes(c.id)) &&
                tenantPolicy.config.capabilities.includes(c.id) &&
                projectPolicy.config.capabilities.includes(c.id),
            )
            .map((c) => c.id),
        ),
      })),
      projects: records
        .filter((r) => r.kind === 'project')
        .map((r) => ({ id: r.id, title: r.title })),
      roles: records.filter(
        (r) =>
          r.kind === 'aiRole' &&
          (r.status === '已确认' || manager) &&
          (!r.data.projectId || r.data.projectId === projectId),
      ),
      knowledge: kb,
      tenantPolicy,
      projectPolicy,
      defaultPolicy,
    });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    const b = await body(request, 200000),
      companyId = str(b, 'companyId'),
      { user, tenant } = await context(request, companyId, true),
      actor = { user, role: tenant.role },
      action = str(b, 'action'),
      db = database();
    if (action === 'create')
      return reply({ run: await createRun(companyId, b, actor) }, 201);
    if (action === 'policy.save') {
      requireManager(tenant.role);
      const projectId = str(b, 'projectId', 200, false),
        policy = parsePolicy(b.config);
      await projectExists(companyId, projectId);
      const existing = await policyFor(companyId, projectId);
      if (b.version !== existing.version)
        throw new PlatformError('配置已变化，请刷新', 409);
      const all = await allRecords(companyId);
      for (const id of policy.knowledgeIds) {
        if (
          !all.some(
            (r) =>
              r.id === id &&
              r.kind === 'knowledge' &&
              r.status === '已确认' &&
              (!projectId ||
                !r.data.projectId ||
                r.data.projectId === projectId),
          )
        )
          throw new PlatformError('知识选择不属于当前范围');
      }
      const changed = await db
        .prepare(
          "INSERT INTO treasure_agent_policies(companyId,projectId,config,version,updatedBy,updatedAt) VALUES(?,?,?,?,?,?) ON DUPLICATE KEY UPDATE config=IF(version=VALUES(version)-1,VALUES(config),config),updatedBy=IF(version=VALUES(version)-1,VALUES(updatedBy),updatedBy),updatedAt=IF(version=VALUES(version)-1,VALUES(updatedAt),updatedAt),version=IF(version=VALUES(version)-1,VALUES(version),version)",
        )
        .bind(
          companyId,
          projectId,
          JSON.stringify(policy),
          existing.version + 1,
          user.name,
          new Date().toISOString(),
        )
        .run();
      if (!changed.meta.changes)
        throw new PlatformError('配置已被其他人更新', 409);
      return reply({ policy: await policyFor(companyId, projectId) });
    }
    const r = await runById(companyId, str(b, 'id'), tenant.role);
    if (action === 'consent.grant') {
      requireManager(tenant.role);
      if (
        b.version !== r.version ||
        ['approved', 'cancelled'].includes(r.status) ||
        (['running', 'checking'].includes(r.status) &&
          String(r.leaseUntil) > new Date().toISOString())
      )
        throw new PlatformError('请刷新任务或先暂停执行', 409);
      // This action records consent only. It neither claims the run nor starts a model call.
      const selected = await activeModelSettings(companyId, r.projectId);
      if (
        b.destination !== selected.destination ||
        b.confirmed !== true ||
        b.generation !== r.generation
      )
        throw new PlatformError('请明确确认发送目的地、资料范围和执行版本');
      if (b.model !== undefined && b.model !== selected.model)
        throw new PlatformError('所选模型已变化，请重新核对', 409);
      const scopes = [
        '任务目标和业务资料',
        '选中知识快照',
        '能力允许的业务记录',
        '人工决策',
        ...(r.snapshot.finance ? ['财务数据'] : []),
      ];
      if (JSON.stringify(b.scopes) !== JSON.stringify(scopes))
        throw new PlatformError('授权范围与当前任务不一致，请重新核对');
      const authorization = {
          destination: selected.destination,
          confirmedBy: user.name,
          at: new Date().toISOString(),
          generation: r.generation,
        },
        marker = crypto.randomUUID();
      const results = await db.batch([
        db
          .prepare(
            "UPDATE treasure_agent_runs SET authorization=?,snapshot=?,version=version+1,controlToken=?,updatedAt=? WHERE id=? AND companyId=? AND version=?",
          )
          .bind(
            JSON.stringify(authorization),
            JSON.stringify({ ...r.snapshot, model: publicModel(selected) }),
            marker,
            authorization.at,
            r.id,
            companyId,
            r.version,
          ),
        db
          .prepare(
            "INSERT INTO treasure_agent_events(companyId,runId,generation,type,actor,content,createdAt) SELECT ?,?,?,'consent',?,?,? WHERE EXISTS(SELECT 1 FROM treasure_agent_runs WHERE id=? AND controlToken=?)",
          )
          .bind(
            companyId,
            r.id,
            r.generation,
            user.name,
            `已明确授权向 ${authorization.destination} 的 ${selected.model} 发送：${scopes.join('、')}。`,
            authorization.at,
            r.id,
            marker,
          ),
      ]);
      if (!results[0].meta.changes)
        throw new PlatformError('任务已更新，请重新核对授权', 409);
      return reply({ run: await runById(companyId, r.id, tenant.role) });
    }
    if (action === 'execute') {
      if (b.version !== r.version)
        throw new PlatformError('任务已变化，请刷新', 409);
      if (
        r.authorization?.destination !==
          (r.snapshot.model?.destination || 'https://api.deepseek.com') ||
        r.authorization.generation !== r.generation
      )
        throw new PlatformError(
          '管理员或经理须先明确授权本任务的数据发送范围',
          403,
        );
      if (
        !(
          r.snapshot.model
            ? await settingsForTarget(companyId, r.snapshot.model)
            : await activeModelSettings(companyId, r.projectId)
        ).key
      )
        throw new PlatformError('请先配置真实文本模型；任务记录已保留', 503);
      if (
        !(env as unknown as { AGENT_WORKER_TOKEN?: string }).AGENT_WORKER_TOKEN
      )
        throw new PlatformError(
          '后台消费者尚未启用，请使用本地启动程序启动服务',
          503,
        );
      const job = await enqueueRun(r, actor);
      return reply(
        {
          run: await runById(companyId, r.id, tenant.role),
          job,
          execution: 'background',
        },
        202,
      );
    }
    return reply({ run: await controlRun(r, b, actor) });
  } catch (e) {
    return failure(e);
  }
}
