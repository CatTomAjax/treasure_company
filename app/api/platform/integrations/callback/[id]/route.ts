import { database } from '@/lib/store';
import { digest, failure, PlatformError, reply } from '@/lib/platform-auth';
import { connection, integrationEvent, job } from '@/lib/integration-service';
import { readSecret } from '@/lib/integration-secrets';
import {
  getRecord,
  newRecord,
  validate,
  insertOp,
  relationOps,
  auditOp,
  validDate,
} from '@/lib/platform-service';
export async function POST(
  request: Request,
  route: { params: Promise<{ id: string }> },
) {
  try {
    const id = (await route.params).id,
      raw = await request.text();
    if (raw.length > 128000) throw new PlatformError('回调内容过大', 413);
    const row = await database()
      .prepare("SELECT companyId FROM treasure_integration_connections WHERE id=?")
      .bind(id)
      .first<{ companyId: string }>();
    if (!row) throw new PlatformError('接入配置不存在', 404);
    const c = await connection(row.companyId, id);
    if (!c.enabled) throw new PlatformError('该接入已停用', 403);
    const timestamp = request.headers.get('x-integration-timestamp') || '',
      signature = request.headers.get('x-integration-signature') || '';
    if (
      !/^\d{10}$/.test(timestamp) ||
      Math.abs(Date.now() - Number(timestamp) * 1000) > 300000 ||
      !/^[a-f0-9]{64}$/i.test(signature)
    )
      throw new PlatformError('签名或时间戳无效', 401);
    const secret = await readSecret(c.companyId, c.id, 'callbackSecret');
    if (!secret) throw new PlatformError('尚未配置本项目网关回调签名密钥', 503);
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify'],
    );
    if (
      !(await crypto.subtle.verify(
        'HMAC',
        key,
        Uint8Array.from(signature.match(/../g)!, (s) => parseInt(s, 16)),
        new TextEncoder().encode(`${timestamp}.${raw}`),
      ))
    )
      throw new PlatformError('回调签名校验失败', 401);
    let event: Record<string, unknown>;
    try {
      event = JSON.parse(raw);
    } catch {
      throw new PlatformError('回调JSON无效');
    }
    if (
      !event ||
      typeof event !== 'object' ||
      Array.isArray(event) ||
      typeof event.eventId !== 'string' ||
      !/^[-\w.]{1,100}$/.test(event.eventId)
    )
      throw new PlatformError('事件编号无效');
    const db = database(),
      hash = await digest(raw),
      old = await db
        .prepare(
          "SELECT payloadHash FROM treasure_integration_callbacks WHERE connectionId=? AND eventId=?",
        )
        .bind(c.id, event.eventId)
        .first<{ payloadHash: string }>();
    if (old) {
      if (old.payloadHash !== hash)
        throw new PlatformError('同一事件编号的内容不一致', 409);
      return reply({ accepted: true, replayed: true });
    }
    const now = new Date().toISOString(),
      ops = [
        db
          .prepare(
            "INSERT INTO treasure_integration_callbacks(connectionId,eventId,payloadHash,receivedAt) VALUES(?,?,?,?)",
          )
          .bind(c.id, event.eventId, hash, now),
      ];
    if (event.type === 'ping') {
      ops.push(
        db
          .prepare(
            "UPDATE treasure_integration_connections SET testStatus='callback_verified',testMessage='本项目自有网关签名回调验证通过；不代表官方平台授权已通过',version=?,updatedAt=? WHERE id=?",
          )
          .bind(crypto.randomUUID(), now, c.id),
        integrationEvent(
          c.companyId,
          c.id,
          '',
          '签名网关',
          '签名ping通过，回调链路已验证',
        ),
      );
    } else if (event.type === 'meter.reading') {
      if (c.provider !== 'iot_gateway')
        throw new PlatformError('该连接不接收仪表数据');
      if (
        !Array.isArray(event.readings) ||
        !event.readings.length ||
        event.readings.length > 30
      )
        throw new PlatformError('每次上报1至30条读数');
      for (const rawReading of event.readings) {
        if (!rawReading || typeof rawReading !== 'object')
          throw new PlatformError('读数格式无效');
        const d = rawReading as Record<string, unknown>;
        if (typeof d.serial !== 'string' || d.serial.length > 120)
          throw new PlatformError('仪表编号无效');
        const found = await db
          .prepare(
            "SELECT id FROM treasure_business_records WHERE companyId=? AND kind='meter' AND status='启用' AND JSON_UNQUOTE(JSON_EXTRACT(data,'$.serial'))=?",
          )
          .bind(c.companyId, d.serial)
          .first<{ id: string }>();
        if (!found) throw new PlatformError('仪表不属于当前企业或未启用');
        const meter = await getRecord(c.companyId, found.id);
        const last = await db
          .prepare(
            "SELECT data FROM treasure_business_records WHERE companyId=? AND kind='reading' AND status IN ('已确认','已归档') AND JSON_UNQUOTE(JSON_EXTRACT(data,'$.meterId'))=? ORDER BY JSON_UNQUOTE(JSON_EXTRACT(data,'$.endDate')) DESC LIMIT 1",
          )
          .bind(c.companyId, meter.id)
          .first<{ data: string }>();
        const previous = last
          ? Number(JSON.parse(last.data).current)
          : Number(d.previous);
        const current = Number(d.current);
        if (
          !Number.isFinite(previous) ||
          !Number.isFinite(current) ||
          previous < 0 ||
          current < previous
        )
          throw new PlatformError('累计读数无效或倒退');
        if (
          d.previous !== undefined &&
          Math.abs(Number(d.previous) - previous) > 0.0001
        )
          throw new PlatformError('期初读数与最近确认读数不一致');
        if (
          typeof d.startDate !== 'string' ||
          typeof d.endDate !== 'string' ||
          !validDate(d.startDate) ||
          !validDate(d.endDate) ||
          typeof d.payer !== 'string' ||
          d.payer.length > 120
        )
          throw new PlatformError('账期或缴费企业无效');
        const r = newRecord(
          c.companyId,
          'reading',
          `${meter.title} · ${d.endDate}`,
          c.config.operator || '网关待审核',
          {
            meterId: meter.id,
            startDate: d.startDate,
            endDate: d.endDate,
            previous: String(previous),
            current: String(current),
            payer: d.payer,
          },
          d.endDate,
          '待审核',
        );
        await validate(r);
        ops.push(
          insertOp(r),
          ...relationOps(r),
          auditOp(
            r,
            {
              user: {
                id: 'gateway:' + c.id,
                name: c.name,
                email: '',
                isAdmin: false,
              },
              role: 'manager',
            },
            `签名网关上报 ${event.eventId}，待人工核对`,
          ),
        );
        if (current - previous > Number(meter.data.threshold))
          ops.push(
            integrationEvent(
              c.companyId,
              c.id,
              '',
              '签名网关',
              `${meter.title} 用量超过配置阈值，已生成待审核读数`,
            ),
          );
      }
    } else if (event.type === 'job.result' || event.type === 'job.failed') {
      if (
        typeof event.jobId !== 'string' ||
        typeof event.remoteId !== 'string' ||
        !event.remoteId.trim() ||
        event.remoteId.length > 200
      )
        throw new PlatformError('需提供本地任务ID与外部任务号');
      const j = await job(c.companyId, event.jobId);
      if (
        j.connectionId !== c.id ||
        !['waiting_result', 'running'].includes(j.status)
      )
        throw new PlatformError('任务不属于此连接或不在等待结果状态', 409);
      if (
        typeof event.detail !== 'string' ||
        !event.detail.trim() ||
        event.detail.length > 2000
      )
        throw new PlatformError('需提供实际办理结果');
      if (event.url) {
        try {
          if (
            typeof event.url !== 'string' ||
            new URL(event.url).protocol !== 'https:'
          )
            throw new Error();
        } catch {
          throw new PlatformError('结果链接须为HTTPS');
        }
      }
      const succeeded = event.type === 'job.result';
      const result = {
        source: 'signed_gateway_receipt',
        detail: event.detail,
        url: event.url || '',
        message:
          '已核验本项目网关签名，银行收付/税务结果仍需财务业务核对；未自动执行资金操作',
      };
      ops.push(
        db
          .prepare(
            "UPDATE treasure_integration_jobs SET status=?,remoteId=?,result=?,nextRetryAt=?,version=CASE WHEN version=? THEN ? ELSE NULL END,updatedAt=? WHERE id=? AND companyId=?",
          )
          .bind(
            succeeded ? 'succeeded' : 'failed',
            event.remoteId,
            JSON.stringify(result),
            succeeded ? '' : new Date(Date.now() + 60000).toISOString(),
            j.version,
            crypto.randomUUID(),
            now,
            j.id,
            c.companyId,
          ),
        integrationEvent(
          c.companyId,
          c.id,
          j.id,
          '签名网关',
          succeeded ? '收到实际结果回执' : '收到失败回执，可按计划重试',
        ),
      );
    } else throw new PlatformError('回调类型无效');
    try {
      await db.batch(ops);
    } catch (e) {
      if (String(e).includes('UNIQUE')) {
        const r = await db
          .prepare(
            "SELECT payloadHash FROM treasure_integration_callbacks WHERE connectionId=? AND eventId=?",
          )
          .bind(c.id, event.eventId)
          .first<{ payloadHash: string }>();
        if (r?.payloadHash === hash)
          return reply({ accepted: true, replayed: true });
      }
      if (String(e).includes('integrationJobs.version'))
        throw new PlatformError('任务已更新，请核对后重试', 409);
      throw e;
    }
    return reply({ accepted: true, eventId: event.eventId });
  } catch (e) {
    return failure(e);
  }
}
