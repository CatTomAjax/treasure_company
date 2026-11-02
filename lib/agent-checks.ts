import { capabilities, type AgentRun, type AgentSpec, type KnowledgeSource } from './agent-catalog';
export type CitationSource = Pick<KnowledgeSource, 'id' | 'version'>;
function citationIdentity(value: string) {
  const hex = value.replaceAll('-', '');
  return /^[a-f\d]{32}$/i.test(hex) ? hex.toLowerCase() : value;
}
/** Use the same capability filter for payloads and citation validation. */
export function permittedRecords(run: AgentRun, spec: AgentSpec) {
  const kinds = new Set<string>(spec.capabilities.flatMap(
    id => [...(capabilities.find(c => c.id === id)?.kinds || [])],
  ));
  return run.snapshot.records.filter(record => kinds.has(record.kind));
}
export function allowedCitations(run: AgentRun, spec: AgentSpec, sources: CitationSource[]) {
  return [...sources, ...permittedRecords(run, spec)];
}
/** Deterministic checks complement the model review; unknown citations never pass silently. */
export function checkCitations(content: string, sources: CitationSource[]) {
  const refs = [...content.matchAll(/\[([^\]\s@]+)@([^\]\s]+)\]/g)].map(
    (m) => ({
      id: m[1].replace(/^(?:来源(?:ID)?[:：]?)/i, ''),
      version: m[2].replace(/^版本[:：]?/, ''),
    }),
  );
  const invalid = refs.filter(
    (ref) => !sources.some((s) =>
      citationIdentity(s.id) === citationIdentity(ref.id) &&
      citationIdentity(s.version) === citationIdentity(ref.version)),
  );
  return {
    references: refs,
    invalid,
    missing: sources.length > 0 && refs.length === 0,
  };
}
/** Canonicalize formatting only after matching the exact authorized source/version identity. */
export function normalizeCitations(content: string, sources: CitationSource[]) {
  return content.replace(/\[([^\]\s@]+)@([^\]\s]+)\]/g, (text,id,version) => {
    const check = checkCitations(text,sources);
    if (check.invalid.length) return text;
    const ref = check.references[0];
    const source = sources.find(s=>citationIdentity(s.id)===citationIdentity(ref.id)&&
      citationIdentity(s.version)===citationIdentity(ref.version));
    return source ? `[${source.id}@${source.version}]` : text;
  });
}
