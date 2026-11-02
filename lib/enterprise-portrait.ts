import type { BusinessRecord } from './platform-config';

export type RelationType =
  | 'transaction'
  | 'collaboration'
  | 'demand'
  | 'similarity'
  | 'ai';
export const relationLabels: Record<RelationType, string> = {
  transaction: '业务往来',
  collaboration: '联合交付',
  demand: '供需互补',
  similarity: '能力关联',
  ai: 'AI 发现',
};
export type PortraitSource = {
  id: string;
  version: string;
  title: string;
  kind: string;
  summary: string;
  updatedAt: string;
  visibility: 'private' | 'shared';
};
export type PortraitNode = {
  id: string;
  companyId: string;
  recordId?: string;
  recordStatus?: string;
  name: string;
  industry: string;
  summary: string;
  capabilities: string[];
  needs: string[];
  cases: string[];
  location: string;
  own: boolean;
  shared: boolean;
  completeness: number;
  sourceIds: string[];
};
export type PortraitLink = {
  id: string;
  source: string;
  target: string;
  type: RelationType;
  title: string;
  status: 'fact' | 'suggested';
  score: number;
  reason: string;
  evidence: string[];
  nextAction: string;
};
export type PortraitGraph = {
  nodes: PortraitNode[];
  links: PortraitLink[];
  sources: PortraitSource[];
  generatedAt: string;
  mode: 'business' | 'demo';
  truncated: boolean;
};
export const sourceKey = (r: Pick<BusinessRecord, 'id' | 'version'>) =>
  `${r.id}@${r.version}`;
const list = (s = '') =>
  [
    ...new Set(
      s
        .split(/[,，、;；\n|]+/)
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  ].slice(0, 18);
const approved = (r: BusinessRecord) =>
  [
    '已确认',
    '已归档',
    '履约中',
    '已完成',
    '已验收',
    '协作中',
    '已交付',
  ].includes(r.status);
const publicRecord = (r: BusinessRecord) =>
  ['enterprise', 'demand'].includes(r.kind) &&
  r.status === '已确认' &&
  r.data.sharing === '授权展示';
const kinds = new Set([
  'enterprise',
  'demand',
  'customer',
  'opportunity',
  'requirement',
  'quotation',
  'contract',
  'order',
  'project',
  'delivery',
  'collaboration',
  'knowledge',
  'content',
]);
const domainTerms = [
  '人工智能',
  'AI',
  '智能体',
  '自动化',
  '数字化',
  '系统开发',
  '软件开发',
  '数据分析',
  '数据平台',
  '物联网',
  '智能硬件',
  '工业设计',
  '用户体验',
  '品牌策划',
  '品牌设计',
  '视觉设计',
  '品牌升级',
  '内容运营',
  '视频制作',
  '宣传片',
  '摄影',
  '剪辑',
  '直播',
  '电商',
  '营销',
  '供应链',
  '物流',
  '财税',
  '法律',
  '知识产权',
  '教育',
  '文旅',
  '活动策划',
  '空间设计',
  '产品设计',
  '跨境',
  '机器人',
  '环保',
  '新能源',
];
function tokens(s: string) {
  const normalized = s.toLowerCase();
  return [
    ...new Set(
      [
        ...list(s).filter((x) => x.length >= 2 && x.length <= 14),
        ...domainTerms.filter((t) => normalized.includes(t.toLowerCase())),
      ].map((x) => x.toLowerCase()),
    ),
  ];
}
function overlap(a: string, b: string) {
  return [...new Set([...tokens(a), ...tokens(b)])]
    .filter((t) => a.toLowerCase().includes(t) && b.toLowerCase().includes(t))
    .slice(0, 8);
}

/** Defense in depth: foreign rows must be explicitly shared, even for platform admins. */
export function visiblePortraitRecords(
  records: BusinessRecord[],
  companyId: string,
) {
  return records
    .filter(
      (r) =>
        kinds.has(r.kind) && (r.companyId === companyId || publicRecord(r)),
    )
    .map((r) => {
      if (r.companyId === companyId) return r;
      const keys =
        r.kind === 'enterprise'
          ? [
              'industry',
              'capabilities',
              'cases',
              'sharing',
              'summary',
              'products',
              'needs',
              'location',
              'profileType',
            ]
          : ['industry', 'scope', 'criteria', 'sharing'];
      return {
        ...r,
        owner: '',
        data: Object.fromEntries(keys.map((k) => [k, r.data[k] || ''])),
      };
    });
}

export function buildPortraitGraph(input: {
  companyId: string;
  companyName: string;
  records: BusinessRecord[];
  companyNames?: Record<string, string>;
  mode?: 'business' | 'demo';
  truncated?: boolean;
}): PortraitGraph {
  const records = visiblePortraitRecords(input.records, input.companyId);
  const root = `company:${input.companyId}`;
  const nodes = new Map<string, PortraitNode>();
  const links: PortraitLink[] = [];
  const sources = new Map<string, PortraitSource>();
  const entityIds = new Map<string, string>();
  const byId = new Map(records.map((r) => [r.id, r]));
  function company(id: string) {
    const nodeId = `company:${id}`;
    if (!nodes.has(nodeId))
      nodes.set(nodeId, {
        id: nodeId,
        companyId: id,
        name:
          id === input.companyId
            ? input.companyName
            : input.companyNames?.[id] || '授权需求发布企业',
        industry: '企业服务',
        summary: '',
        capabilities: [],
        needs: [],
        cases: [],
        location: '',
        own: id === input.companyId,
        shared: id !== input.companyId,
        completeness: 0,
        sourceIds: [],
      });
    return nodes.get(nodeId)!;
  }
  company(input.companyId);
  function addSource(r: BusinessRecord) {
    const id = sourceKey(r);
    if (!sources.has(id))
      sources.set(id, {
        id,
        version: r.version,
        title: r.title,
        kind: r.kind,
        summary: [
          r.data.summary,
          r.data.capabilities,
          r.data.products,
          r.data.needs,
          r.data.cases,
          r.data.scope,
          r.data.requirements,
          r.data.responsibility,
          r.data.content,
        ]
          .filter(Boolean)
          .join('；')
          .slice(0, 1800),
        updatedAt: r.updatedAt,
        visibility: r.companyId === input.companyId ? 'private' : 'shared',
      });
    return id;
  }
  for (const r of records.filter((r) => r.kind === 'enterprise')) {
    const self = r.data.profileType === '本企业';
    const id = self ? company(r.companyId).id : `enterprise:${r.id}`;
    const node: PortraitNode = {
      id,
      companyId: r.companyId,
      recordId: r.id,
      recordStatus: r.status,
      name: r.title,
      industry: r.data.industry || '未分类',
      summary: r.data.summary || r.data.capabilities || '',
      capabilities: list(
        [r.data.capabilities, r.data.products].filter(Boolean).join('、'),
      ),
      needs: list(r.data.needs),
      cases: list(r.data.cases),
      location: r.data.location || '',
      own: self && r.companyId === input.companyId,
      shared: publicRecord(r),
      completeness: Math.round(
        ([
          r.data.industry,
          r.data.capabilities,
          r.data.summary,
          r.data.cases,
          r.data.needs,
          r.data.location,
        ].filter(Boolean).length /
          6) *
          100,
      ),
      sourceIds: [addSource(r)],
    };
    const previous = nodes.get(id);
    if (previous) {
      node.sourceIds = [...new Set([...previous.sourceIds, ...node.sourceIds])];
      node.capabilities = [
        ...new Set([...previous.capabilities, ...node.capabilities]),
      ];
      node.needs = [...new Set([...previous.needs, ...node.needs])];
      node.cases = [...new Set([...previous.cases, ...node.cases])];
    }
    nodes.set(id, node);
    entityIds.set(r.id, id);
  }
  const referenceFields = [
    'enterpriseId',
    'partnerId',
    'customerId',
    'projectId',
    'contractId',
    'quotationId',
    'requirementId',
    'opportunityId',
    'orderId',
    'demandId',
  ];
  function entities(
    r: BusinessRecord,
    visited = new Set<string>(),
    depth = 0,
  ): { id: string; via: BusinessRecord[] }[] {
    if (visited.has(r.id) || depth > 6) return [];
    visited.add(r.id);
    const entity = entityIds.get(r.id);
    if (entity) return [{ id: entity, via: [r] }];
    const found = referenceFields.flatMap((field) => {
      const target = byId.get(r.data[field]);
      return target && target.companyId === r.companyId
        ? entities(target, new Set(visited), depth + 1).map((e) => ({
            ...e,
            via: [r, ...e.via],
          }))
        : [];
    });
    return [...new Map(found.map((x) => [x.id, x])).values()];
  }
  function addLink(link: Omit<PortraitLink, 'id'>) {
    if (
      link.source === link.target ||
      !nodes.has(link.source) ||
      !nodes.has(link.target)
    )
      return;
    const pair =
      link.type === 'similarity'
        ? [link.source, link.target].sort()
        : [link.source, link.target];
    const id = `${link.type}:${pair.join('~')}`;
    const old = links.find((l) => l.id === id);
    if (old) {
      old.evidence = [...new Set([...old.evidence, ...link.evidence])];
      old.score = Math.max(old.score, link.score);
      if (link.status === 'fact') old.status = 'fact';
      return;
    }
    links.push({ ...link, id });
  }
  for (const r of records.filter((r) => r.companyId === input.companyId)) {
    if (['knowledge', 'content'].includes(r.kind) && approved(r)) {
      const current = nodes.get(root)!;
      current.sourceIds.push(addSource(r));
    }
    if (
      !['order', 'contract', 'project', 'delivery', 'collaboration'].includes(
        r.kind,
      )
    )
      continue;
    for (const entity of entities(r)) {
      const fact = approved(r);
      if (!fact && r.kind !== 'collaboration') continue;
      const evidence = entity.via.map(addSource);
      nodes.get(root)!.sourceIds.push(...evidence);
      addLink({
        source: root,
        target: entity.id,
        type: r.kind === 'collaboration' ? 'collaboration' : 'transaction',
        title: r.kind === 'collaboration' ? '联合交付协作' : '已记录业务往来',
        status: fact ? 'fact' : 'suggested',
        score: fact ? 100 : 55,
        reason: `依据「${r.title}」及明确的业务引用链，当前状态：${r.status}。`,
        evidence,
        nextAction: '核对交付范围、责任分工和下一次跟进时间。',
      });
      if (['project', 'delivery'].includes(r.kind) && fact) {
        const node = nodes.get(entity.id)!;
        node.cases = [...new Set([...node.cases, r.title])];
        node.sourceIds = [...new Set([...node.sourceIds, ...evidence])];
      }
    }
  }
  for (const r of records.filter(
    (r) => r.kind === 'demand' && approved(r) && r.status !== '已关闭',
  )) {
    const owner =
      (r.data.enterpriseId && entityIds.get(r.data.enterpriseId)) ||
      company(r.companyId).id;
    const ownerNode = nodes.get(owner)!;
    ownerNode.needs = [
      ...new Set([...ownerNode.needs, r.data.scope || r.title]),
    ];
    ownerNode.sourceIds.push(addSource(r));
    for (const provider of nodes.values()) {
      if (provider.id === owner) continue;
      const matches = overlap(
        r.data.scope || r.title,
        provider.capabilities.join('、'),
      );
      if (!matches.length) continue;
      addLink({
        source: owner,
        target: provider.id,
        type: 'demand',
        title: '需求与服务能力匹配',
        status: 'suggested',
        score: Math.min(94, 56 + matches.length * 9),
        reason: `「${r.title}」与服务能力共同包含：${matches.join('、')}。关键词匹配分数，尚需确认范围与交期。`,
        evidence: [
          addSource(r),
          ...provider.sourceIds.filter(
            (id) => sources.get(id)?.kind === 'enterprise',
          ),
        ],
        nextAction: `围绕「${r.title}」确认服务范围、验收标准和交期。`,
      });
    }
  }
  const array = [...nodes.values()];
  for (const consumer of array)
    for (const provider of array) {
      if (consumer.id === provider.id || !consumer.needs.length) continue;
      const common = overlap(
        consumer.needs.join('、'),
        provider.capabilities.join('、'),
      );
      if (!common.length) continue;
      addLink({
        source: consumer.id,
        target: provider.id,
        type: 'demand',
        title: '合作需求与能力互补',
        status: 'suggested',
        score: Math.min(92, 54 + common.length * 9),
        reason: `企业维护的合作需求与对方能力共同包含：${common.join('、')}。需进一步确认服务范围和交期。`,
        evidence: [...consumer.sourceIds, ...provider.sourceIds].filter((id) =>
          ['enterprise', 'demand'].includes(sources.get(id)?.kind || ''),
        ),
        nextAction: `围绕${common.join('、')}核对具体需求、双方分工与验收条件。`,
      });
    }
  for (let i = 0; i < array.length; i++)
    for (let j = i + 1; j < array.length; j++) {
      const a = array[i],
        b = array[j];
      const common = overlap(
        a.capabilities.join('、'),
        b.capabilities.join('、'),
      );
      if (!common.length) continue;
      addLink({
        source: a.id,
        target: b.id,
        type: 'similarity',
        title: '共同能力与行业关联',
        status: 'suggested',
        score: Math.min(90, 45 + common.length * 10),
        reason: `双方公开或有权查看的能力标签均包含：${common.join('、')}。这表示相似能力，是否互补需进一步核对。`,
        evidence: [...a.sourceIds, ...b.sourceIds].filter(
          (id) => sources.get(id)?.kind === 'enterprise',
        ),
        nextAction: '比较各自专长、案例和服务对象，确认联合方案的分工。',
      });
    }
  return {
    nodes: [...nodes.values()].map((n) => ({
      ...n,
      sourceIds: [...new Set(n.sourceIds)],
    })),
    links: links.sort(
      (a, b) =>
        Number(b.status === 'fact') - Number(a.status === 'fact') ||
        b.score - a.score,
    ),
    sources: [...sources.values()],
    generatedAt: new Date().toISOString(),
    mode: input.mode || 'business',
    truncated: !!input.truncated,
  };
}

/** Accept model suggestions only when both endpoints and citations exist in this exact graph. */
export function validateModelRelations(
  raw: unknown,
  graph: PortraitGraph,
): PortraitLink[] {
  if (!Array.isArray(raw)) return [];
  const nodes = new Map(graph.nodes.map((n) => [n.id, n]));
  const sources = new Map(graph.sources.map((s) => [s.id, s]));
  const unique = new Set<string>();
  return raw.slice(0, 30).flatMap((value) => {
    if (!value || typeof value !== 'object') return [];
    const r = value as Record<string, unknown>;
    if (
      typeof r.source !== 'string' ||
      typeof r.target !== 'string' ||
      r.source === r.target ||
      !nodes.has(r.source) ||
      !nodes.has(r.target)
    )
      return [];
    if (
      typeof r.reason !== 'string' ||
      !r.reason.trim() ||
      typeof r.title !== 'string' ||
      !r.title.trim() ||
      !Array.isArray(r.evidence)
    )
      return [];
    const evidence = [
      ...new Set(r.evidence.filter((x): x is string => typeof x === 'string')),
    ];
    if (!evidence.length || evidence.some((id) => !sources.has(id))) return [];
    if (
      ![r.source, r.target].every((id) =>
        nodes.get(id)!.sourceIds.some((s) => evidence.includes(s)),
      )
    )
      return [];
    const id = `ai:${[r.source, r.target].sort().join('~')}`;
    if (unique.has(id)) return [];
    unique.add(id);
    return [
      {
        id,
        source: r.source,
        target: r.target,
        type: 'ai' as const,
        status: 'suggested' as const,
        title: r.title.slice(0, 80),
        reason: r.reason.slice(0, 1200),
        score: 0,
        evidence,
        nextAction:
          typeof r.nextAction === 'string'
            ? r.nextAction.slice(0, 500)
            : '核对双方需求与交付条件后再推进。',
      },
    ];
  });
}
