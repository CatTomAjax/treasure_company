import assert from 'node:assert/strict';
import {
  buildPortraitGraph,
  visiblePortraitRecords,
  validateModelRelations,
} from '../lib/enterprise-portrait.ts';
import { demoPortraitGraph } from '../lib/enterprise-portrait-demo.ts';
import { workspaceNavigation } from '../lib/workspace-navigation.ts';
import { pptPages } from '../lib/ppt-model.ts';

let checks = 0;
const check = (v, label) => {
  assert.ok(v, label);
  checks++;
};
function row(id, kind, data = {}, options = {}) {
  return {
    id,
    companyId: 'a',
    kind,
    data,
    title: id,
    owner: 'private-owner',
    dueDate: '',
    status: '已确认',
    version: 'v1',
    createdAt: '2026-11-03T00:00:00.000Z',
    updatedAt: '2026-11-03T00:00:00.000Z',
    ...options,
  };
}
const records = [
  row('self', 'enterprise', {
    profileType: '本企业',
    capabilities: '系统开发、人工智能',
    industry: '软件',
    needs: '视觉设计',
  }),
  row('partner', 'enterprise', {
    capabilities: '视觉设计、品牌策划、系统开发',
    industry: '设计',
  }),
  row('client', 'customer', { enterpriseId: 'partner' }),
  row(
    'order',
    'order',
    { customerId: 'client', scope: '系统开发' },
    { status: '履约中' },
  ),
  row('draft-order', 'order', { customerId: 'client' }, { status: '草稿' }),
  row(
    'draft-demand',
    'demand',
    { scope: '视觉设计', enterpriseId: 'partner' },
    { status: '草稿' },
  ),
  row('need', 'demand', { scope: '视觉设计、品牌策划' }),
  row(
    'shared',
    'enterprise',
    {
      profileType: '本企业',
      capabilities: '视觉设计',
      sharing: '授权展示',
      contact: 'secret-contact',
      phone: 'secret-phone',
      internalMemo: 'secret-memo',
    },
    { companyId: 'b' },
  ),
  row(
    'shared-demand',
    'demand',
    {
      scope: '系统开发',
      sharing: '授权展示',
      budget: '999999',
      internalMemo: 'secret-memo',
    },
    { companyId: 'b' },
  ),
  row(
    'private',
    'enterprise',
    { capabilities: '视觉设计', sharing: '仅本企业' },
    { companyId: 'b' },
  ),
  row(
    'unconfirmed',
    'enterprise',
    { capabilities: '视觉设计', sharing: '授权展示' },
    { companyId: 'c', status: '草稿' },
  ),
  row(
    'secret-order',
    'order',
    { scope: 'secret-order-content', sharing: '授权展示' },
    { companyId: 'b' },
  ),
  row(
    'secret-knowledge',
    'knowledge',
    { content: 'secret-knowledge-content', sharing: '授权展示' },
    { companyId: 'b' },
  ),
  row('cycle1', 'project', { quotationId: 'cycle2' }),
  row('cycle2', 'quotation', { requirementId: 'cycle1' }),
];
const safe = visiblePortraitRecords(records, 'a');
check(
  !safe.some((r) =>
    ['private', 'unconfirmed', 'secret-order', 'secret-knowledge'].includes(
      r.id,
    ),
  ),
  '跨企业仅收录已确认并授权的档案与需求',
);
check(
  !JSON.stringify(safe.filter((r) => r.companyId !== 'a')).match(
    /secret-|999999|private-owner/,
  ),
  '外部资料剔除联系人、预算及未授权字段',
);
const graph = buildPortraitGraph({
  companyId: 'a',
  companyName: '企业 A',
  records,
});
check(
  graph.nodes.length === 3,
  '本企业档案合并到当前企业节点，隐藏企业不进入图谱',
);
check(
  graph.links.some(
    (l) =>
      l.type === 'transaction' &&
      l.target === 'enterprise:partner' &&
      l.status === 'fact',
  ),
  '订单经客户档案引用链关联到真实合作方',
);
check(
  graph.links
    .filter((l) => l.status === 'fact')
    .every((l) => !l.evidence.some((e) => e.startsWith('draft-'))),
  '草稿订单不建立事实关联',
);
check(
  graph.links.some(
    (l) =>
      l.type === 'demand' &&
      l.source === 'company:b' &&
      l.target === 'company:a',
  ),
  '外部授权需求关联到实际发布企业',
);
check(
  graph.links.some(
    (l) =>
      l.type === 'demand' &&
      l.source === 'company:a' &&
      l.target === 'enterprise:partner',
  ),
  '企业维护的合作需求与服务商能力形成建议',
);
check(
  graph.links.some((l) => l.type === 'similarity'),
  '共同能力只建立能力建议',
);
check(
  graph.links
    .filter((l) => l.status === 'fact')
    .every((l) => l.score === 100 && l.type === 'transaction'),
  '模型与关键词不会变成已发生交易',
);
check(
  graph.sources.every((s) => !s.id.startsWith('draft-demand')),
  '未确认需求不参与供需推荐',
);
check(
  graph.links.every(
    (l) =>
      l.evidence.length &&
      l.evidence.every((id) => graph.sources.some((s) => s.id === id)),
  ),
  '每一条关联均有存在的来源与版本',
);
const renamed = buildPortraitGraph({
  companyId: 'a',
  companyName: '企业 A',
  records: [
    records[0],
    records[1],
    row('unnamed', 'order', { scope: 'partner 系统开发' }),
  ],
});
check(
  !renamed.links.some((l) => l.status === 'fact'),
  '相同文字不推定订单归属',
);
const candidate = {
  source: 'company:a',
  target: 'enterprise:partner',
  title: '联合开发',
  reason: '双方能力形成交集',
  evidence: ['self@v1', 'partner@v1'],
  nextAction: '确认分工',
};
check(
  validateModelRelations([candidate], graph).length === 1,
  '有效模型建议可通过双端来源校验',
);
check(
  validateModelRelations(
    [{ ...candidate, evidence: ['self@v0', 'partner@v1'] }],
    graph,
  ).length === 0,
  '拒绝过期的来源版本',
);
check(
  validateModelRelations([{ ...candidate, evidence: ['self@v1'] }], graph)
    .length === 0,
  '拒绝缺少另一方来源的推测',
);
check(
  validateModelRelations([{ ...candidate, target: 'nonexistent' }], graph)
    .length === 0,
  '拒绝模型发明企业',
);
check(
  validateModelRelations([candidate, candidate], graph).length === 1,
  '去除重复模型关系',
);
check(
  validateModelRelations(
    [{ ...candidate, status: 'fact', score: 100 }],
    graph,
  )[0].status === 'suggested',
  '模型不得自行声明事实或置信概率',
);
const demo = demoPortraitGraph();
check(
  demo.mode === 'demo' && demo.nodes.length === 10 && demo.links.length > 20,
  '演示网络隔离且覆盖企业和业务关联',
);
check(
  workspaceNavigation
    .flatMap((g) => g.children)
    .filter((p) => p.page === 'portrait').length === 1 &&
    pptPages.some((p) => p.id === 'portrait'),
  '企业脸谱入口接入导航和应用目录',
);
console.log(`PASS ${checks} enterprise portrait assertions`);
