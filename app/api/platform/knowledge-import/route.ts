import { database } from '@/lib/store';
import {
  body,
  context,
  failure,
  PlatformError,
  reply,
  str,
} from '@/lib/platform-auth';
import {
  newRecord,
  validate,
  insertOp,
  auditOp,
  getRecord,
} from '@/lib/platform-service';
import { fileOps } from '@/lib/platform-files';
export async function POST(request: Request) {
  try {
    const b = await body(request, 13000000),
      companyId = str(b, 'companyId'),
      { user, tenant } = await context(request, companyId, true),
      name = str(b, 'name', 180),
      mime = str(b, 'mime', 150),
      encoded = str(b, 'data', 11500000),
      db = database();
    const projectId = str(
      { projectId: b.projectId ?? '' },
      'projectId',
      200,
      false,
    );
    if (projectId && (await getRecord(companyId, projectId)).kind !== 'project')
      throw new PlatformError('关联项目无效');
    if (!/\.(pdf|docx|pptx|xlsx|txt|md|csv|json)$/i.test(name))
      throw new PlatformError('资料类型不受支持');
    let bytes: Uint8Array;
    try {
      bytes = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0));
    } catch {
      throw new PlatformError('文件编码无效');
    }
    const hash = Array.from(
      new Uint8Array(
        await crypto.subtle.digest('SHA-256', bytes.buffer as ArrayBuffer),
      ),
    )
      .map((n) => n.toString(16).padStart(2, '0'))
      .join('');
    const importKey = projectId ? hash + ':' + projectId : hash;
    const old = await db
      .prepare(
        "SELECT recordId,count FROM treasure_knowledge_imports WHERE companyId=? AND hash=?",
      )
      .bind(companyId, importKey)
      .first<{ recordId: string; count: number }>();
    if (old)
      return reply({ id: old.recordId, count: old.count, replayed: true });
    if (
      !Array.isArray(b.segments) ||
      !b.segments.length ||
      b.segments.length > 10 ||
      b.segments.some(
        (s) => typeof s !== 'string' || !s.trim() || s.length > 28000,
      )
    )
      throw new PlatformError('提取文本分段无效');
    const records = b.segments.map((content, i) =>
      newRecord(
        companyId,
        'knowledge',
        `${name}${b.segments instanceof Array && b.segments.length > 1 ? ` / ${i + 1}` : ''}`.slice(
          0,
          160,
        ),
        user.name,
        {
          layer: '原始资料',
          category: '导入资料',
          projectId,
          content: String(content),
          source: `本地文本提取；原文件 ${name}；SHA256 ${hash}；待人工核对，不代表OCR或知识蒸馏结论。`,
          correction: '请核对提取文本与原文件，审核后方可用于AI知识。',
        },
      ),
    );
    const stored = fileOps(companyId, records[0].id, name, mime, encoded);
    for (const r of records) {
      r.data.source += ` 文件ID ${stored.id}`;
      await validate(r);
    }
    await db.batch([
      ...records.flatMap((r) => [
        insertOp(r),
        auditOp(r, { user, role: tenant.role }, '资料本地提取并原文入库'),
      ]),
      ...stored.ops,
      db
        .prepare(
          "INSERT INTO treasure_knowledge_imports(companyId,hash,recordId,count,createdAt) VALUES(?,?,?,?,?)",
        )
        .bind(
          companyId,
          importKey,
          records[0].id,
          records.length,
          new Date().toISOString(),
        ),
    ]);
    return reply(
      { id: records[0].id, count: records.length, fileId: stored.id },
      201,
    );
  } catch (e) {
    return failure(e);
  }
}
