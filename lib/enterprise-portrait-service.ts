import { database } from './store';
import { decode, type RawRecord } from './platform-service';
import { digest } from './platform-auth';
import {
  buildPortraitGraph,
  validateModelRelations,
  type PortraitGraph,
} from './enterprise-portrait';

export async function loadPortrait(companyId: string, name: string) {
  const result = await database()
    .prepare(`SELECT * FROM treasure_business_records
    WHERE (companyId=? AND kind IN ('enterprise','demand','customer','opportunity','requirement','quotation','contract','order','project','delivery','collaboration','knowledge','content'))
    OR (companyId<>? AND kind IN ('enterprise','demand') AND status='已确认' AND JSON_UNQUOTE(JSON_EXTRACT(data,'$.sharing'))='授权展示')
    ORDER BY CASE WHEN companyId=? THEN 0 ELSE 1 END, CASE kind WHEN 'enterprise' THEN 0 WHEN 'demand' THEN 1 ELSE 2 END, updatedAt DESC,id LIMIT 1801`)
    .bind(companyId, companyId, companyId)
    .all<RawRecord>();
  const rows = result.results.slice(0, 1800).map(decode);
  // Keep graph physics and pairwise matching bounded; report truncation explicitly.
  let enterprises = 0;
  const companies = new Set([companyId]);
  const records = rows.filter((r) => {
    if (r.kind === 'enterprise' && ++enterprises > 180) return false;
    if (!companies.has(r.companyId) && companies.size >= 180) return false;
    companies.add(r.companyId);
    return true;
  });
  const publicCompanies = [
    ...new Set(
      records.filter((r) => r.companyId !== companyId).map((r) => r.companyId),
    ),
  ];
  const companyNames: Record<string, string> = {};
  if (publicCompanies.length) {
    const companies = await database()
      .prepare(
        `SELECT id,name FROM treasure_finance_companies WHERE id IN (${publicCompanies.map(() => '?').join(',')})`,
      )
      .bind(...publicCompanies)
      .all<{ id: string; name: string }>();
    for (const c of companies.results) companyNames[c.id] = c.name;
  }
  const graph = buildPortraitGraph({
    companyId,
    companyName: name,
    records,
    companyNames,
    truncated: result.results.length > 1800 || records.length < rows.length,
  });
  const fingerprint = await graphFingerprint(graph);
  const saved = await database()
    .prepare(
      "SELECT data,createdAt FROM treasure_business_records WHERE companyId=? AND kind='portraitAnalysis' ORDER BY createdAt DESC LIMIT 1",
    )
    .bind(companyId)
    .first<{ data: string; createdAt: string }>();
  let analysis: { provider: string; at: string } | null = null;
  if (saved) {
    try {
      const data = JSON.parse(saved.data);
      if (data.fingerprint === fingerprint) {
        graph.links.push(
          ...validateModelRelations(JSON.parse(data.content), graph),
        );
        analysis = { provider: data.provider, at: saved.createdAt };
      }
    } catch {
      /* Invalid or superseded analysis is not reused. */
    }
  }
  return { graph, fingerprint, analysis };
}
export const graphFingerprint = (graph: PortraitGraph) =>
  digest(
    JSON.stringify({
      nodes: graph.nodes,
      sources: graph.sources,
      links: graph.links.filter((l) => l.type !== 'ai'),
    }),
  );
