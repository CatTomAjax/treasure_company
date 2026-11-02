import { fileData, fileOps, MAX_FILE_BYTES } from '@/lib/platform-files';
import { database } from '@/lib/store';
import {
  body,
  context,
  failure,
  PlatformError,
  reply,
  str,
} from '@/lib/platform-auth';
import { auditOp, checkSensitive, getRecord } from '@/lib/platform-service';
export async function GET(request: Request) {
  try {
    const p = new URL(request.url).searchParams,
      companyId = p.get('companyId') || 'park',
      { tenant } = await context(request, companyId);
    const file = await fileData(companyId, p.get('id') || '');
    checkSensitive(
      (await getRecord(companyId, file.recordId)).kind,
      tenant.role,
    );
    return new Response(
      Uint8Array.from(atob(file.data), (c) => c.charCodeAt(0)),
      {
        headers: {
          'Content-Type': file.mime,
          'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(file.name)}`,
          'Cache-Control': 'no-store',
          'X-Content-Type-Options': 'nosniff',
          'Content-Security-Policy': "default-src 'none'; sandbox",
        },
      },
    );
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    const b = await body(request, 12000000),
      companyId = str(b, 'companyId'),
      { user, tenant } = await context(request, companyId, true),
      record = await getRecord(companyId, str(b, 'recordId'));
    checkSensitive(record.kind, tenant.role);
    const name = str(b, 'name', 180),
      mime = str(b, 'mime', 100),
      data = str(b, 'data', 11500000);
    const types = [
      'application/pdf',
      'image/png',
      'image/jpeg',
      'image/webp',
      'video/mp4',
      'video/webm',
      'audio/mpeg',
      'audio/wav',
      'audio/mp4',
      'text/plain',
      'text/markdown',
    ];
    if (!types.includes(mime)) throw new PlatformError('不支持该文件类型');
    let bytes: string;
    try {
      bytes = atob(data);
    } catch {
      throw new PlatformError('文件编码无效');
    }
    if (!bytes.length || bytes.length > MAX_FILE_BYTES)
      throw new PlatformError('单文件上限为 8 MB');
    if (mime === 'application/pdf' && !bytes.startsWith('%PDF-'))
      throw new PlatformError('PDF 文件格式无效');
    if (mime === 'image/png' && !bytes.startsWith('\x89PNG'))
      throw new PlatformError('PNG 文件格式无效');
    if (mime === 'image/jpeg' && !bytes.startsWith('\xff\xd8'))
      throw new PlatformError('JPEG 文件格式无效');
    const count = await database()
      .prepare(
        "SELECT COUNT(*) AS n FROM treasure_business_files WHERE companyId=? AND recordId=?",
      )
      .bind(companyId, record.id)
      .first<{ n: number }>();
    if ((count?.n || 0) >= 20)
      throw new PlatformError('每条业务最多 20 个文件');
    const stored = fileOps(companyId, record.id, name, mime, data);
    const id = stored.id;
    await database().batch([
      ...stored.ops,
      auditOp(record, { user, role: tenant.role }, `上传附件：${name}`),
    ]);
    return reply({ id }, 201);
  } catch (e) {
    return failure(e);
  }
}
