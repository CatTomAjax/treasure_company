import { database } from '@/lib/store';
import { context, failure, reply } from '@/lib/platform-auth';
import { decode, type RawRecord } from '@/lib/platform-service';
export async function GET(request: Request) {
  try {
    const p = new URL(request.url).searchParams;
    await context(request, p.get('companyId') || 'park');
    const query = (p.get('q') || '').slice(0, 500);
    const terms = [
      ...new Set(query.match(/[\u4e00-\u9fff]{2}|[a-z0-9]{2,}/gi) || []),
    ];
    const records = (
      await database()
        .prepare(
          "SELECT * FROM treasure_business_records WHERE kind IN ('enterprise','demand') AND status='已确认' AND JSON_UNQUOTE(JSON_EXTRACT(data,'$.sharing'))='授权展示' LIMIT 1000",
        )
        .all<RawRecord>()
    ).results.map(decode);
    return reply({
      matches: records
        .map((r) => {
          const description =
            r.kind === 'enterprise' ? r.data.capabilities : r.data.scope;
          const evidence = terms.filter((t) =>
            (r.title + ' ' + r.data.industry + ' ' + description)
              .toLowerCase()
              .includes(t.toLowerCase()),
          );
          return {
            id: r.id,
            companyId: r.companyId,
            kind: r.kind,
            title: r.title,
            industry: r.data.industry,
            description,
            cases: r.kind === 'enterprise' ? r.data.cases : '',
            budget: r.kind === 'demand' ? r.data.budget : '',
            criteria: r.kind === 'demand' ? r.data.criteria : '',
            evidence,
            score: evidence.length,
            source: '企业授权展示资料，按关键词匹配',
          };
        })
        .filter((r) => !terms.length || r.score > 0)
        .sort((a, b) => b.score - a.score),
    });
  } catch (e) {
    return failure(e);
  }
}
