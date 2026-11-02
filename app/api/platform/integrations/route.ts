import type { MySqlStatement } from '@/db/mysql';
import { env } from '@/lib/server-env';
import { database } from '@/lib/store';
import {
  body,
  context,
  failure,
  PlatformError,
  reply,
  requireManager,
  str,
} from '@/lib/platform-auth';
import { connectionSpecs } from '@/lib/integration-config';
import {
  connection,
  createJob,
  executeJob,
  integrationEvent,
  job,
  missingFields,
  updateJob,
} from '@/lib/integration-service';
import { encryptSecret } from '@/lib/integration-secrets';
import { getRecord } from '@/lib/platform-service';
export async function GET(request: Request) {
  try {
    const p = new URL(request.url).searchParams,
      companyId = p.get('companyId') || 'park',
      { tenant } = await context(request, companyId);
    requireManager(tenant.role);
    const db = database();
    if (p.get('package')) {
      const j = await job(companyId, p.get('package')!);
      return new Response(
        JSON.stringify(
          {
            ...j.payload,
            jobId: j.id,
            recordVersion: j.recordVersion,
            callback: {
              url: `${new URL(request.url).origin}/api/platform/integrations/callback/${j.connectionId}`,
              protocol: '本项目自有网关HMAC-SHA256；不是微信支付APIv3验签协议',
            },
          },
          null,
          2,
        ),
        {
          headers: {
            'Content-Type': 'application/json',
            'Content-Disposition': `attachment; filename="integration-job-${j.id}.json"`,
            'Cache-Control': 'no-store',
          },
        },
      );
    }
    const ids = (
      await db
        .prepare(
          "SELECT id FROM treasure_integration_connections WHERE companyId=? ORDER BY updatedAt DESC",
        )
        .bind(companyId)
        .all<{ id: string }>()
    ).results;
    const [jobs, events, usage] = await db.batch([
      db
        .prepare(
          "SELECT * FROM treasure_integration_jobs WHERE companyId=? ORDER BY updatedAt DESC LIMIT 300",
        )
        .bind(companyId),
      db
        .prepare(
          "SELECT * FROM treasure_integration_events WHERE companyId=? ORDER BY createdAt DESC LIMIT 300",
        )
        .bind(companyId),
      db
        .prepare(
          "SELECT * FROM treasure_integration_usage WHERE companyId=? ORDER BY createdAt DESC LIMIT 300",
        )
        .bind(companyId),
    ]);
    return reply({
      connections: await Promise.all(
        ids.map((r) => connection(companyId, r.id)),
      ),
      jobs: (jobs.results as Record<string, unknown>[]).map((r) => ({
        ...r,
        payload: JSON.parse(String(r.payload)),
        result: JSON.parse(String(r.result)),
      })),
      events: events.results,
      usage: usage.results,
      vaultReady: !!(env as unknown as { PLATFORM_MASTER_KEY?: string })
        .PLATFORM_MASTER_KEY,
    });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    const b = await body(request, 80000),
      companyId = str(b, 'companyId'),
      { user, tenant } = await context(request, companyId, true);
    requireManager(tenant.role);
    const actor = { user, role: tenant.role },
      action = str(b, 'action'),
      db = database(),
      now = new Date().toISOString();
    if (action.startsWith('connection.')) {
      if (tenant.role !== 'admin')
        throw new PlatformError('接入配置与密钥管理需要企业管理员权限', 403);
      if (action === 'connection.save') {
        const provider = str(b, 'provider');
        if (!Object.hasOwn(connectionSpecs, provider))
          throw new PlatformError('接入类型无效');
        const spec = connectionSpecs[provider],
          id = b.id ? str(b, 'id') : crypto.randomUUID(),
          old = b.id ? await connection(companyId, id) : null;
        if (old && old.provider !== provider)
          throw new PlatformError('接入类型不能修改');
        if (old && old.version !== str(b, 'version'))
          throw new PlatformError('配置已更新，请刷新', 409);
        const raw = b.config;
        if (!raw || typeof raw !== 'object' || Array.isArray(raw))
          throw new PlatformError('配置格式无效');
        const config: Record<string, string> = {};
        for (const [k, v] of Object.entries(raw)) {
          const f = spec.fields.find((f) => f.key === k && !f.secret);
          if (!f || typeof v !== 'string' || v.length > 2000)
            throw new PlatformError('配置包含未定义字段或长度过大');
          if (k === 'endpoint' && v) {
            try {
              if (new URL(v).protocol !== 'https:') throw new Error();
            } catch {
              throw new PlatformError('外部接口地址必须为HTTPS');
            }
          }
          config[k] = v.trim();
        }
        const version = crypto.randomUUID(),
          name = str(b, 'name', 120),
          ops: MySqlStatement[] = [];
        if (old)
          ops.push(
            db
              .prepare(
                "UPDATE treasure_integration_connections SET name=?,config=?,enabled=0,testStatus='not_tested',testMessage='',version=CASE WHEN version=? THEN ? ELSE NULL END,updatedAt=? WHERE companyId=? AND id=?",
              )
              .bind(
                name,
                JSON.stringify(config),
                old.version,
                version,
                now,
                companyId,
                id,
              ),
          );
        else
          ops.push(
            db
              .prepare(
                "INSERT INTO treasure_integration_connections(id,companyId,provider,name,config,enabled,testStatus,testMessage,version,createdAt,updatedAt) VALUES(?,?,?,?,?,0,'not_tested','',?,?,?)",
              )
              .bind(
                id,
                companyId,
                provider,
                name,
                JSON.stringify(config),
                version,
                now,
                now,
              ),
          );
        const secrets = b.secrets;
        if (secrets) {
          if (typeof secrets !== 'object' || Array.isArray(secrets))
            throw new PlatformError('密钥格式无效');
          for (const [field, value] of Object.entries(secrets)) {
            if (
              !spec.fields.some((f) => f.key === field && f.secret) ||
              typeof value !== 'string'
            )
              throw new PlatformError('密钥字段无效');
            if (!value) continue;
            const encrypted = await encryptSecret(companyId, id, field, value);
            ops.push(
              db
                .prepare(
                  "INSERT INTO treasure_integration_secrets(connectionId,field,nonce,ciphertext) VALUES(?,?,?,?) ON DUPLICATE KEY UPDATE nonce=VALUES(nonce),ciphertext=VALUES(ciphertext)",
                )
                .bind(id, field, encrypted.nonce, encrypted.ciphertext),
            );
          }
        }
        if (Array.isArray(b.clearSecrets))
          for (const field of b.clearSecrets) {
            if (
              typeof field !== 'string' ||
              !spec.fields.some((f) => f.key === field && f.secret)
            )
              throw new PlatformError('密钥字段无效');
            ops.push(
              db
                .prepare(
                  "DELETE FROM treasure_integration_secrets WHERE connectionId=? AND field=?",
                )
                .bind(id, field),
            );
          }
        ops.push(
          integrationEvent(
            companyId,
            id,
            '',
            user.name,
            '保存配置；连接状态重置，密钥内容不写入日志',
          ),
        );
        await db.batch(ops);
        return reply(
          { connection: await connection(companyId, id) },
          old ? 200 : 201,
        );
      }
      const c = await connection(companyId, str(b, 'id'));
      if (c.version !== str(b, 'version'))
        throw new PlatformError('配置已更新', 409);
      if (action === 'connection.check') {
        const missing = missingFields(c),
          spec = connectionSpecs[c.provider],
          secretMissing = spec.fields.filter(
            (f) => f.secret && !c.secrets.includes(f.key),
          );
        const status = missing.length
          ? 'missing_fields'
          : spec.mode === 'local'
            ? 'local_ready'
            : secretMissing.length
              ? 'missing_credentials'
              : 'schema_valid';
        const message = missing.length
          ? `待补充：${missing.join('、')}`
          : spec.mode === 'local'
            ? '本地执行条件已具备'
            : secretMissing.length
              ? `配置结构已核对，尚缺：${secretMissing.map((f) => f.label).join('、')}；未进行远端连接测试`
              : '配置结构已核对；仍需官方权限和真实任务验证，未进行远端连接测试';
        await db.batch([
          db
            .prepare(
              "UPDATE treasure_integration_connections SET testStatus=?,testMessage=?,version=?,updatedAt=? WHERE id=? AND companyId=? AND version=?",
            )
            .bind(
              status,
              message,
              crypto.randomUUID(),
              now,
              c.id,
              companyId,
              c.version,
            ),
          integrationEvent(companyId, c.id, '', user.name, message),
        ]);
        return reply({ connection: await connection(companyId, c.id) });
      }
      if (action === 'connection.enable') {
        if (typeof b.enabled !== 'boolean') throw new PlatformError('状态无效');
        if (b.enabled && missingFields(c).length)
          throw new PlatformError('请先补充必填配置');
        await db.batch([
          db
            .prepare(
              "UPDATE treasure_integration_connections SET enabled=?,version=?,updatedAt=? WHERE id=? AND companyId=? AND version=?",
            )
            .bind(
              b.enabled ? 1 : 0,
              crypto.randomUUID(),
              now,
              c.id,
              companyId,
              c.version,
            ),
          integrationEvent(
            companyId,
            c.id,
            '',
            user.name,
            b.enabled
              ? '启用本地接入流程；不代表已连接外部系统'
              : '停用接入流程',
          ),
        ]);
        return reply({ connection: await connection(companyId, c.id) });
      }
      throw new PlatformError('接入操作无效');
    }
    if (action === 'job.create') {
      const c = await connection(companyId, str(b, 'connectionId'));
      const options: Record<string, string> = {};
      if (
        b.options &&
        typeof b.options === 'object' &&
        !Array.isArray(b.options)
      )
        for (const [k, v] of Object.entries(b.options)) {
          if (
            ![
              'format',
              'prompt',
              'size',
              'ratio',
              'duration',
              'scheduledAt',
            ].includes(k) ||
            typeof v !== 'string' ||
            v.length > 3000
          )
            throw new PlatformError('任务参数无效');
          options[k] = v;
        }
      return reply(
        {
          job: await createJob(
            companyId,
            c,
            str(b, 'recordId'),
            options,
            actor,
          ),
        },
        201,
      );
    }
    const j = await job(companyId, str(b, 'id'));
    if (j.version !== str(b, 'version'))
      throw new PlatformError('任务已更新，请刷新', 409);
    const next = { ...j, version: crypto.randomUUID(), updatedAt: now };
    if (action === 'job.approve') {
      if (j.status !== 'draft')
        throw new PlatformError('任务不在待审核状态', 409);
      const r = await getRecord(companyId, j.recordId);
      if (r.version !== j.recordVersion)
        throw new PlatformError('业务版本已改变，请新建任务', 409);
      if (
        !['已确认', '已完成', '已验收', '已选定', '协作中'].includes(
          r.status,
        ) &&
        r.kind !== 'meter' &&
        !(j.kind === 'deepseek' && r.kind === 'material' && r.status === '草稿')
      )
        throw new PlatformError('原始业务须先审核确认');
      next.status = 'approved';
      return reply({
        job: await updateJob(
          next,
          j.version,
          user.name,
          '审核任务业务版本、资料范围和交付条件',
        ),
      });
    }
    if (action === 'job.execute' || action === 'job.retry')
      return reply({ job: await executeJob(j, actor) });
    if (action === 'job.recover') {
      if (
        j.status !== 'running' ||
        Date.now() - Date.parse(j.updatedAt) < 120000
      )
        throw new PlatformError('只有超过2分钟的执行中任务可恢复', 409);
      next.status = 'failed';
      next.nextRetryAt = now;
      next.result = {
        message: '已恢复中断执行，请核对已有成果和回执后再重试。',
      };
      return reply({
        job: await updateJob(
          next,
          j.version,
          user.name,
          '恢复超时的本地执行任务',
        ),
      });
    }
    if (action === 'job.cancel') {
      if (['running', 'succeeded', 'cancelled'].includes(j.status))
        throw new PlatformError('当前状态不能取消', 409);
      next.status = 'cancelled';
      return reply({
        job: await updateJob(
          next,
          j.version,
          user.name,
          '取消本地待办；不代表撤回外部业务',
        ),
      });
    }
    if (action === 'job.result') {
      if (!['waiting_result', 'failed'].includes(j.status))
        throw new PlatformError('任务当前不接受结果', 409);
      const remoteId = str(b, 'remoteId', 200, false),
        proof = str(b, 'proof', 2000),
        fileId = str(b, 'fileId', 100, false);
      if (!remoteId && !fileId)
        throw new PlatformError('需要实际远程任务号或本企业业务成果附件');
      if (fileId) {
        const file = await db
          .prepare(
            "SELECT id,mime FROM treasure_business_files WHERE id=? AND companyId=? AND recordId=?",
          )
          .bind(fileId, companyId, j.recordId)
          .first<{ id: string; mime: string }>();
        if (!file) throw new PlatformError('成果文件不属于该业务');
        if (j.kind === 'video_provider' && !file.mime.startsWith('video/'))
          throw new PlatformError('请提供视频成片');
        if (j.kind === 'image_provider' && !file.mime.startsWith('image/'))
          throw new PlatformError('请提供图片成果');
      }
      next.status = 'succeeded';
      next.remoteId = remoteId;
      next.result = {
        source: 'manual_receipt',
        remoteId,
        fileId,
        proof,
        message: '人工登记的实际结果，未宣称由系统自动对外执行',
      };
      return reply({
        job: await updateJob(next, j.version, user.name, '登记实际结果及回执'),
      });
    }
    throw new PlatformError('任务操作无效');
  } catch (e) {
    if (String(e).includes('integrationConnections.version'))
      return failure(new PlatformError('配置已更新，请刷新', 409));
    return failure(e);
  }
}
