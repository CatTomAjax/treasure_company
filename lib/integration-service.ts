import type { MySqlStatement } from '@/db/mysql';
import { database } from './store';
import {
  connectionSpecs,
  type Connection,
  type IntegrationJob,
} from './integration-config';
import { PlatformError } from './platform-auth';
import {
  getRecord,
  newRecord,
  allRecords,
  updateOp,
  auditOp,
  type Actor,
} from './platform-service';
import { textModelSettings } from './integration-secrets';
import { produceText } from './platform-ai';
import { fileOps, encodeBytes } from './platform-files';
import { produceArtifact } from './production-artifacts';
type RawConnection = Omit<Connection, 'config' | 'secrets'> & {
  config: string;
};
type RawJob = Omit<IntegrationJob, 'payload' | 'result'> & {
  payload: string;
  result: string;
};
export async function connection(companyId: string, id: string) {
  const r = await database()
    .prepare("SELECT * FROM treasure_integration_connections WHERE companyId=? AND id=?")
    .bind(companyId, id)
    .first<RawConnection>();
  if (!r) throw new PlatformError('接入配置不存在', 404);
  const secrets = (
    await database()
      .prepare("SELECT field FROM treasure_integration_secrets WHERE connectionId=?")
      .bind(id)
      .all<{ field: string }>()
  ).results.map((s) => s.field);
  return { ...r, config: JSON.parse(r.config), secrets } as Connection;
}
export async function job(companyId: string, id: string) {
  const r = await database()
    .prepare("SELECT * FROM treasure_integration_jobs WHERE companyId=? AND id=?")
    .bind(companyId, id)
    .first<RawJob>();
  if (!r) throw new PlatformError('执行任务不存在', 404);
  return {
    ...r,
    payload: JSON.parse(r.payload),
    result: JSON.parse(r.result),
  } as IntegrationJob;
}
export function integrationEvent(
  companyId: string,
  connectionId: string,
  jobId: string,
  actor: string,
  message: string,
) {
  return database()
    .prepare(
      "INSERT INTO treasure_integration_events(id,companyId,connectionId,jobId,actor,message,createdAt) VALUES(?,?,?,?,?,?,?)",
    )
    .bind(
      crypto.randomUUID(),
      companyId,
      connectionId,
      jobId,
      actor,
      message.slice(0, 1000),
      new Date().toISOString(),
    );
}
export function missingFields(c: Connection) {
  return connectionSpecs[c.provider].fields
    .filter(
      (f) =>
        f.required &&
        !(f.secret ? c.secrets.includes(f.key) : c.config[f.key]?.trim()),
    )
    .map((f) => f.label);
}
export async function updateJob(
  j: IntegrationJob,
  version: string,
  actor: string,
  message: string,
  extra: MySqlStatement[] = [],
) {
  try {
    await database().batch([
      database()
        .prepare(
          "UPDATE treasure_integration_jobs SET status=?,result=?,attempts=?,nextRetryAt=?,remoteId=?,version=CASE WHEN version=? THEN ? ELSE NULL END,updatedAt=? WHERE companyId=? AND id=?",
        )
        .bind(
          j.status,
          JSON.stringify(j.result),
          j.attempts,
          j.nextRetryAt,
          j.remoteId,
          version,
          j.version,
          j.updatedAt,
          j.companyId,
          j.id,
        ),
      integrationEvent(j.companyId, j.connectionId, j.id, actor, message),
      ...extra,
    ]);
  } catch (e) {
    if (String(e).includes('integrationJobs.version'))
      throw new PlatformError('任务已被更新，请刷新后重试', 409);
    throw e;
  }
  return j;
}
export async function createJob(
  companyId: string,
  c: Connection,
  recordId: string,
  options: Record<string, string>,
  actor: Actor,
) {
  const r = await getRecord(companyId, recordId);
  const spec = connectionSpecs[c.provider];
  const supported =
    spec.mode === 'local'
      ? ['material', 'video', 'notice']
      : c.provider === 'deepseek'
        ? ['material', 'aiRun', 'knowledge']
        : c.provider === 'iot_gateway'
          ? ['meter']
          : [
              'material',
              'video',
              'notice',
              'collaboration',
              'acceptance',
              'purchase',
              'contract',
              'order',
              'invoiceRequest',
              'taxHandoff',
            ];
  if (!supported.includes(r.kind))
    throw new PlatformError('该连接不支持所选业务类型');
  const now = new Date().toISOString(),
    id = crypto.randomUUID();
  const payload = {
    schemaVersion: 1,
    source: {
      id: r.id,
      kind: r.kind,
      title: r.title,
      status: r.status,
      version: r.version,
      data: r.data,
    },
    options,
    provider: c.provider,
    configuration: c.config,
    notice: '这是待办理请求，不是外部执行成功回执；密钥不包含在请求包中。',
  };
  const j: IntegrationJob = {
    id,
    companyId,
    connectionId: c.id,
    recordId: r.id,
    recordVersion: r.version,
    kind: c.provider,
    title: r.title,
    status: 'draft',
    payload,
    result: {},
    attempts: 0,
    maxAttempts: 3,
    nextRetryAt: '',
    remoteId: '',
    version: crypto.randomUUID(),
    createdAt: now,
    updatedAt: now,
  };
  await database().batch([
    database()
      .prepare(
        "INSERT INTO treasure_integration_jobs(id,companyId,connectionId,recordId,recordVersion,kind,title,status,payload,result,attempts,maxAttempts,nextRetryAt,remoteId,version,createdAt,updatedAt) VALUES(?,?,?,?,?,?,?,?,?,?,0,3,'','',?,?,?)",
      )
      .bind(
        id,
        companyId,
        c.id,
        r.id,
        r.version,
        j.kind,
        r.title,
        j.status,
        JSON.stringify(payload),
        '{}',
        j.version,
        now,
        now,
      ),
    integrationEvent(
      companyId,
      c.id,
      id,
      actor.user.name,
      '创建待审核任务，保存业务版本快照',
    ),
  ]);
  return j;
}
export async function executeJob(j: IntegrationJob, actor: Actor) {
  if (!['approved', 'blocked', 'failed'].includes(j.status))
    throw new PlatformError('请先审核任务，或等待当前执行结果', 409);
  if (j.attempts >= j.maxAttempts)
    throw new PlatformError('已达到重试上限，请核查问题后创建新任务', 409);
  if (j.nextRetryAt && j.nextRetryAt > new Date().toISOString())
    throw new PlatformError(`请在 ${j.nextRetryAt} 后重试`, 409);
  const c = await connection(j.companyId, j.connectionId),
    spec = connectionSpecs[c.provider],
    r = await getRecord(j.companyId, j.recordId);
  if (r.version !== j.recordVersion)
    throw new PlatformError('业务版本已改变，请基于新版本创建任务', 409);
  const missing = missingFields(c);
  if (!c.enabled || missing.length) {
    return updateJob(
      {
        ...j,
        status: 'blocked',
        result: {
          message: !c.enabled
            ? '连接流程尚未启用'
            : `待补充：${missing.join('、')}`,
        },
        version: crypto.randomUUID(),
        updatedAt: new Date().toISOString(),
      },
      j.version,
      actor.user.name,
      '待补配置，未对外发送',
    );
  }
  if (spec.mode === 'deepseek' && !(await textModelSettings(j.companyId)).key)
    return updateJob(
      {
        ...j,
        status: 'blocked',
        result: {
          message: '真实模型任务尚缺API密钥；岗位工作台仍可使用规则模式。',
        },
        version: crypto.randomUUID(),
        updatedAt: new Date().toISOString(),
      },
      j.version,
      actor.user.name,
      '未配置模型密钥，未发送任务资料',
    );
  const running = {
    ...j,
    status: 'running',
    attempts: j.attempts + 1,
    nextRetryAt: '',
    version: crypto.randomUUID(),
    updatedAt: new Date().toISOString(),
  };
  await updateJob(running, j.version, actor.user.name, '开始处理已审核任务');
  try {
    if (spec.mode === 'deepseek') {
      if (r.kind !== 'material')
        throw new PlatformError(
          '此队列仅生成内容草稿；岗位接力请在AI工作流执行',
        );
      if (r.status !== '草稿')
        throw new PlatformError('生成内容需使用草稿版本');
      const role = newRecord(r.companyId, 'aiRole', '内容编辑', r.owner, {
        instructions: '整理可编辑内容及待核实事项',
        knowledgeLayer: '全部已确认知识',
        tool: '生成草稿',
        criteria: '依据可追溯，不编造事实',
        tokenBudget: '3000',
      });
      const out = await produceText(
          r.title,
          role,
          await allRecords(r.companyId),
          '',
          r.data.brief,
          r.id,
        ),
        updated = {
          ...r,
          data: {
            ...r.data,
            content: out.content,
            sources: out.sources
              .map((s) => `${s.title} / ${s.id} / ${s.version}`)
              .join('\n'),
            pending: '生成草稿需人工核实并重新审核',
          },
          version: crypto.randomUUID(),
          updatedAt: new Date().toISOString(),
        };
      const file = await produceArtifact(updated, 'md'),
        stored = fileOps(
          r.companyId,
          r.id,
          file.name,
          file.mime,
          encodeBytes(file.bytes),
        );
      return updateJob(
        {
          ...running,
          status: 'succeeded',
          result: {
            source: 'model_draft',
            fileId: stored.id,
            name: file.name,
            message: '模型草稿已保存，业务保持草稿，待人工审核。',
          },
          version: crypto.randomUUID(),
          updatedAt: new Date().toISOString(),
        },
        running.version,
        actor.user.name,
        '模型生成草稿并归档',
        [
          updateOp(updated, r.version),
          auditOp(updated, actor, '模型草稿生成'),
          ...stored.ops,
        ],
      );
    }
    if (spec.mode === 'local' && r.kind !== 'video') {
      const format = String(
        (j.payload.options as Record<string, string>)?.format || 'svg',
      );
      const artifact = await produceArtifact(r, format),
        stored = fileOps(
          j.companyId,
          r.id,
          artifact.name,
          artifact.mime,
          encodeBytes(artifact.bytes),
        );
      return updateJob(
        {
          ...running,
          status: 'succeeded',
          result: {
            source: 'local',
            fileId: stored.id,
            name: artifact.name,
            mime: artifact.mime,
            message: '本地生成完成，成果已保存到业务附件',
          },
          version: crypto.randomUUID(),
          updatedAt: new Date().toISOString(),
        },
        running.version,
        actor.user.name,
        '本地成果生成并入库',
        stored.ops,
      );
    }
    return updateJob(
      {
        ...running,
        status: 'waiting_result',
        result: {
          source: spec.mode === 'local' ? 'local_render' : 'handoff',
          message:
            spec.mode === 'local'
              ? '请在视频编辑器渲染并保存成片，再选择该视频附件完成任务。'
              : '等待官方平台或获授权网关的实际结果；请下载请求包办理，或使用签名回调。系统尚未对外发送。',
        },
        version: crypto.randomUUID(),
        updatedAt: new Date().toISOString(),
      },
      running.version,
      actor.user.name,
      '进入结果等待，未宣称外部执行成功',
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : '执行失败';
    await updateJob(
      {
        ...running,
        status: 'failed',
        result: { message: message.slice(0, 500) },
        nextRetryAt: new Date(
          Date.now() + 60000 * 2 ** (running.attempts - 1),
        ).toISOString(),
        version: crypto.randomUUID(),
        updatedAt: new Date().toISOString(),
      },
      running.version,
      actor.user.name,
      '执行失败，已记录重试时间',
    );
    throw new PlatformError(message, 500);
  }
}
