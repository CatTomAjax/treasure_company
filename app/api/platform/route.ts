import { textModelSettings } from '@/lib/integration-secrets';
import { env } from '@/lib/server-env';
import { database } from '@/lib/store';
import { modules, type BusinessRecord } from '@/lib/platform-config';
import {
  body,
  context,
  failure,
  PlatformError,
  reply,
  str,
} from '@/lib/platform-auth';
import {
  allRecords,
  automate,
  checkSensitive,
  createRecord,
  getRecord,
  newRecord,
  transition,
  updateRecord,
} from '@/lib/platform-service';
export async function GET(request: Request) {
  try {
    const p = new URL(request.url).searchParams,
      companyId = p.get('companyId') || 'park',
      { user, tenant } = await context(request, companyId);
    if (p.get('history')) {
      const r = await getRecord(companyId, p.get('history')!);
      checkSensitive(r.kind, tenant.role);
      return reply({
        history: (
          await database()
            .prepare(
              "SELECT * FROM treasure_business_history WHERE companyId=? AND recordId=? ORDER BY createdAt DESC LIMIT 200",
            )
            .bind(companyId, r.id)
            .all()
        ).results,
      });
    }
    const records = (await allRecords(companyId)).filter((r) => {
      try {
        checkSensitive(r.kind, tenant.role);
        return true;
      } catch {
        return false;
      }
    });
    const manager = ['admin', 'manager'].includes(tenant.role);
    const [files, steps, inbox, links] = await database().batch([
      database()
        .prepare(
          "SELECT id,recordId,name,mime,size,createdAt FROM treasure_business_files WHERE companyId=?",
        )
        .bind(companyId),
      database()
        .prepare(
          "SELECT * FROM treasure_business_ai_steps WHERE companyId=? ORDER BY runId,step",
        )
        .bind(companyId),
      database()
        .prepare(
          "SELECT * FROM treasure_business_notice_inbox WHERE companyId=? ORDER BY createdAt DESC",
        )
        .bind(companyId),
      database()
        .prepare("SELECT * FROM treasure_business_automations WHERE companyId=?")
        .bind(companyId),
    ]);
    const ids = new Set(records.map((r) => r.id));
    const cfg = env as unknown as { DEEPSEEK_API_KEY?: string };
    return reply({
      records,
      user,
      role: tenant.role,
      files: files.results.filter((f) =>
        ids.has(String((f as { recordId: string }).recordId)),
      ),
      steps: steps.results,
      inbox: inbox.results,
      links: links.results,
      aiConfigured: !!(await textModelSettings(companyId)).key,
      finance: manager ? await financeSummary(companyId) : null,
    });
  } catch (e) {
    return failure(e);
  }
}
async function financeSummary(companyId: string) {
  const db = database();
  const result = await db.batch([
    db.prepare("SELECT * FROM treasure_finance_bills WHERE companyId=?").bind(companyId),
    db
      .prepare("SELECT * FROM treasure_finance_accounts WHERE companyId=?")
      .bind(companyId),
    db
      .prepare(
        "SELECT * FROM treasure_finance_entries WHERE companyId=? AND status='confirmed'",
      )
      .bind(companyId),
    db
      .prepare(
        "SELECT id,taxType,periodStart,periodEnd,status FROM treasure_tax_filings WHERE companyId=? ORDER BY deadline DESC",
      )
      .bind(companyId),
  ]);
  return {
    bills: result[0].results,
    accounts: result[1].results,
    entries: result[2].results,
    filings: result[3].results,
  };
}
export async function POST(request: Request) {
  try {
    const b = await body(request),
      companyId = str(b, 'companyId'),
      { user, tenant } = await context(request, companyId, true),
      actor = { user, role: tenant.role },
      action = str(b, 'action');
    if (action === 'record.create' || action === 'record.save') {
      const kind = str(b, 'kind');
      if (modules[kind]?.internal)
        throw new PlatformError('企业脸谱分析记录只能由关系分析服务生成', 403);
      if (!Object.hasOwn(modules, kind))
        throw new PlatformError('业务类型无效');
      checkSensitive(kind, tenant.role);
      const raw = b.data;
      if (!raw || typeof raw !== 'object' || Array.isArray(raw))
        throw new PlatformError('业务字段无效');
      const data: Record<string, string> = {};
      for (const [key, v] of Object.entries(raw)) {
        if (typeof v !== 'string')
          throw new PlatformError('业务字段必须是文本值');
        data[key] = v.trim();
      }
      if (action === 'record.create') {
        const r = newRecord(
          companyId,
          kind,
          str(b, 'title', 160),
          str(b, 'owner', 100),
          data,
          str(b, 'dueDate', 10, false),
        );
        return reply({ record: await createRecord(r, actor) }, 201);
      }
      const old = await getRecord(companyId, str(b, 'id'));
      if (old.kind !== kind) throw new PlatformError('业务类型不可更改');
      if (old.version !== str(b, 'version'))
        throw new PlatformError('记录已更新，请刷新', 409);
      if (
        old.kind === 'aiRun' &&
        (await database()
          .prepare("SELECT id FROM treasure_business_ai_steps WHERE runId=?")
          .bind(old.id)
          .first())
      )
        throw new PlatformError('已执行工作流的配置不可修改，请新建任务');
      if (
        modules[kind].review?.includes(old.status) ||
        old.status === modules[kind].states.at(-1)
      ) {
        if (
          JSON.stringify(data) !== JSON.stringify(old.data) ||
          str(b, 'title', 160) !== old.title
        )
          throw new PlatformError(
            '已确认版本不可直接修改，请退回草稿后重新审核',
            409,
          );
      }
      const r: BusinessRecord = {
        ...old,
        title: str(b, 'title', 160),
        owner: str(b, 'owner', 100),
        dueDate: str(b, 'dueDate', 10, false),
        data,
        version: crypto.randomUUID(),
        updatedAt: new Date().toISOString(),
      };
      return reply({ record: await updateRecord(r, old, actor, '保存修改') });
    }
    if (action === 'inbox.receipt') {
      const id = str(b, 'id'),
        version = str(b, 'version'),
        status = str(b, 'status');
      if (!['已读', '已办结'].includes(status))
        throw new PlatformError('回执状态无效');
      const result = await database()
        .prepare(
          "UPDATE treasure_business_notice_inbox SET status=?,response=?,version=? WHERE id=? AND companyId=? AND version=?",
        )
        .bind(
          status,
          str(b, 'response', 2000, false),
          crypto.randomUUID(),
          id,
          companyId,
          version,
        )
        .run();
      if (!result.meta.changes)
        throw new PlatformError('通知已更新，请刷新', 409);
      return reply({ ok: true });
    }
    const record = await getRecord(companyId, str(b, 'id'));
    checkSensitive(record.kind, tenant.role);
    if (record.version !== str(b, 'version'))
      throw new PlatformError('记录已更新，请刷新', 409);
    if (action === 'record.copy')
      return reply(
        {
          record: await createRecord(
            newRecord(
              companyId,
              record.kind,
              (record.title + ' · 修订').slice(0, 160),
              record.owner,
              {
                ...record.data,
                ...(record.kind === 'video'
                  ? { timeline: '', audioId: '' }
                  : {}),
              },
              record.dueDate,
            ),
            actor,
          ),
        },
        201,
      );
    if (action === 'record.transition')
      return reply({
        record: await transition(record, str(b, 'status'), actor),
      });
    if (
      action.startsWith('project.') ||
      action.startsWith('knowledge.') ||
      action.startsWith('tasks.') ||
      action === 'bill.fromSource'
    )
      return reply(await automate(record, action, actor));
    throw new PlatformError('操作无效');
  } catch (e) {
    return failure(e);
  }
}
