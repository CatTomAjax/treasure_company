import {protectLegacy} from '@/lib/platform-auth';
import { database } from '@/lib/store';
async function legacyGET(request: Request) {
  try {
    const p = new URL(request.url).searchParams;
    const doc = await database()
      .prepare(
        "SELECT name,mime,data FROM treasure_finance_documents WHERE billId=? AND companyId=?",
      )
      .bind(p.get('billId') || '', p.get('companyId') || '')
      .first<{ name: string; mime: string; data: string }>();
    if (!doc) return Response.json({ error: '凭证不存在' }, { status: 404 });
    const bytes = Uint8Array.from(atob(doc.data), (c) => c.charCodeAt(0));
    return new Response(bytes, {
      headers: {
        'Content-Type': doc.mime,
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(doc.name)}`,
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch {
    return Response.json({ error: '凭证读取失败' }, { status: 503 });
  }
}

export const GET=protectLegacy(legacyGET,'finance');
