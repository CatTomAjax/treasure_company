import { database } from '@/lib/store';
import {
  body,
  context,
  failure,
  PlatformError,
  reply,
  str,
} from '@/lib/platform-auth';
export async function POST(request: Request) {
  try {
    const b = await body(request, 6000000),
      companyId = str(b, 'companyId');
    await context(request, companyId, true);
    const name = str(b, 'name', 200),
      mime = str(b, 'mime', 100),
      data = str(b, 'data', 5700000);
    if (
      !/^(image\/(png|jpeg|webp|gif)|video\/(mp4|webm)|audio\/(mpeg|wav|webm|ogg)|application\/(pdf|octet-stream|vnd\.openxmlformats-officedocument\.(wordprocessingml\.document|spreadsheetml\.sheet|presentationml\.presentation))|text\/(plain|markdown|csv))$/.test(
        mime,
      )
    )
      throw new PlatformError('支持常见图片、视频与音频格式');
    if (
      !/^[A-Za-z0-9+/]+={0,2}$/.test(data) ||
      atob(data).length > 4 * 1024 * 1024
    )
      throw new PlatformError('文件无效或超过4MB');
    const count = await database()
      .prepare("SELECT count(*) AS n FROM treasure_ppt_files WHERE companyId=?")
      .bind(companyId)
      .first<{ n: number }>();
    if ((count?.n || 0) >= 100)
      throw new PlatformError('演示空间最多100个素材文件');
    const id = crypto.randomUUID();
    await database()
      .prepare(
        "INSERT INTO treasure_ppt_files(id,companyId,name,mime,data,createdAt) VALUES(?,?,?,?,?,?)",
      )
      .bind(id, companyId, name, mime, data, new Date().toISOString())
      .run();
    return reply(
      {
        id,
        url: `/api/platform/ppt/files?companyId=${encodeURIComponent(companyId)}&id=${id}`,
      },
      201,
    );
  } catch (e) {
    return failure(e);
  }
}
export async function GET(request: Request) {
  try {
    const p = new URL(request.url).searchParams,
      companyId = p.get('companyId') || '';
    await context(request, companyId);
    const file = await database()
      .prepare("SELECT name,mime,data FROM treasure_ppt_files WHERE id=? AND companyId=?")
      .bind(p.get('id') || '', companyId)
      .first<{ name: string; mime: string; data: string }>();
    if (!file) throw new PlatformError('素材不存在', 404);
    const binary = Uint8Array.from(atob(file.data), (c) => c.charCodeAt(0));
    return new Response(binary, {
      headers: {
        'Content-Type': file.mime,
        'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(file.name)}`,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (e) {
    return failure(e);
  }
}
