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
import {
  auditOp,
  checkSensitive,
  insertOp,
  newRecord,
  relationOps,
  validate,
} from '@/lib/platform-service';
import { modules, type BusinessRecord } from '@/lib/platform-config';
export async function POST(request: Request) {
  try {
    const b = await body(request, 2000000),
      companyId = str(b, 'companyId'),
      kind = str(b, 'kind'),
      { user, tenant } = await context(request, companyId, true);
    requireManager(tenant.role);
    if (!Object.hasOwn(modules, kind)) throw new PlatformError('业务类型无效');
    checkSensitive(kind, tenant.role);
    if (!Array.isArray(b.rows) || !b.rows.length || b.rows.length > 100)
      throw new PlatformError('每批导入 1 至 100 行');
    const records: BusinessRecord[] = [],
      issues: { row: number; message: string }[] = [];
    for (let i = 0; i < b.rows.length; i++) {
      try {
        const raw = b.rows[i] as Record<string, unknown>;
        if (!raw || typeof raw !== 'object')
          throw new PlatformError('行数据无效');
        const data: Record<string, string> = {};
        for (const f of modules[kind].fields)
          data[f.key] = String(raw[f.key] ?? '').trim();
        const r = newRecord(
          companyId,
          kind,
          String(raw.title ?? '').trim(),
          String(raw.owner ?? user.name).trim(),
          data,
          String(raw.dueDate ?? '').trim(),
        );
        await validate(r);
        records.push(r);
      } catch (e) {
        issues.push({ row: i + 2, message: (e as Error).message });
      }
    }
    if (b.preview === true)
      return reply({
        valid: records.length,
        issues,
        preview: records.slice(0, 10),
      });
    if (issues.length)
      return reply({ error: '导入未执行，请先修正数据', issues }, 400);
    const batchId = str(b, 'batchId', 100);
    const old = await database()
      .prepare(
        "SELECT id FROM treasure_business_import_batches WHERE id=? AND companyId=?",
      )
      .bind(batchId, companyId)
      .first();
    if (old) return reply({ count: 0, replayed: true });
    try {
      await database().batch([
        database()
          .prepare(
            "INSERT INTO treasure_business_import_batches(id,companyId,kind,createdAt) VALUES(?,?,?,?)",
          )
          .bind(batchId, companyId, kind, new Date().toISOString()),
        ...records.flatMap((r) => [
          insertOp(r),
          ...relationOps(r),
          auditOp(r, { user, role: tenant.role }, '批量导入'),
        ]),
      ]);
    } catch (e) {
      if (String(e).includes('UNIQUE'))
        throw new PlatformError(
          '导入批次或唯一编号已存在；未写入该批次任何数据',
          409,
        );
      throw e;
    }
    return reply({ count: records.length }, 201);
  } catch (e) {
    return failure(e);
  }
}
