import { enterpriseRoles } from './enterprise-roles';

/** Versioned, shared capability contract. Capabilities grant read/draft access only. */
export const capabilities = [
  {
    id: 'knowledge',
    name: '知识检索与引用',
    description: '读取授权且已确认的三层知识，标注来源ID、版本与缺口',
    kinds: ['knowledge'],
  },
  {
    id: 'extract',
    name: '资料提取与归纳',
    description: '按文件整理事实、摘要、分类和待核实内容',
    kinds: ['knowledge'],
  },
  {
    id: 'requirements',
    name: '需求拆解',
    description: '整理目标、范围、排除项和验收条件',
    kinds: ['customer', 'opportunity', 'requirement'],
  },
  {
    id: 'solution',
    name: '方案与交付规划',
    description: '形成方案结构、任务分工与交付清单',
    kinds: ['requirement', 'project', 'milestone', 'task'],
  },
  {
    id: 'copy',
    name: '多渠道文案',
    description: '生成公众号、小红书、招商和活动文案草稿',
    kinds: ['material'],
  },
  {
    id: 'visual',
    name: '海报创意与版式说明',
    description: '输出视觉创意、文案层级与制作说明',
    kinds: ['material'],
  },
  {
    id: 'script',
    name: '短视频脚本',
    description: '输出分镜、字幕、时长和素材需求',
    kinds: ['video'],
  },
  {
    id: 'cost',
    name: '成本与报价测算',
    description: '依据已录入金额分析成本、毛差与报价假设',
    kinds: ['cost', 'quotation', 'supplierQuote'],
    sensitive: true,
  },
  {
    id: 'schedule',
    name: '进度与周期评估',
    description: '分析里程碑、依赖、工时与延期风险',
    kinds: ['project', 'milestone', 'task', 'timeLog'],
  },
  {
    id: 'sales',
    name: '商机与客户分析',
    description: '分析客户需求、商机阶段和跟进缺口',
    kinds: ['customer', 'opportunity', 'requirement'],
  },
  {
    id: 'cash',
    name: '收支与现金分析',
    description: '读取企业已录入财务汇总，区分预测与实际到账',
    kinds: ['acceptance', 'collection'],
    sensitive: true,
  },
  {
    id: 'space',
    name: '空间与能耗分析',
    description: '分析房源、租约、抄表与账期异常',
    kinds: ['space', 'lease', 'meter', 'reading'],
  },
  {
    id: 'risk',
    name: '项目风险检查',
    description: '检查范围变更、交付、验收和责任缺口',
    kinds: ['project', 'change', 'delivery', 'acceptance', 'task'],
  },
  {
    id: 'match',
    name: '企业能力与供需匹配',
    description: '基于授权展示的能力、需求及案例解释匹配理由',
    kinds: ['enterprise', 'demand', 'cooperation'],
  },
  {
    id: 'event',
    name: '活动策划',
    description: '整理议程、嘉宾画像、物料和执行安排',
    kinds: ['event', 'space'],
  },
  {
    id: 'policy',
    name: '政策条件与材料核对',
    description: '依据已提供官方原文整理条件、期限和材料缺口',
    kinds: ['policy', 'notice'],
  },
  {
    id: 'procurement',
    name: '采购比价',
    description: '比较规格、报价、交期、服务和商务条件',
    kinds: ['purchase', 'supplierQuote'],
    sensitive: true,
  },
  {
    id: 'hr',
    name: '招聘与培训准备',
    description: '编制岗位说明、面试标准和入职培训材料',
    kinds: ['employee', 'recruitment', 'training'],
    sensitive: true,
  },
  {
    id: 'delivery',
    name: '交付文档与版本核对',
    description: '整理成果目录、来源版本与验收检查表',
    kinds: ['project', 'delivery', 'acceptance', 'cooperation'],
  },
  {
    id: 'review',
    name: '汇总与交叉核对',
    description: '汇总所有岗位成果，保留分歧，检查事实、数字、引用和缺失',
    kinds: [],
  },
] as const;
export type CapabilityId = (typeof capabilities)[number]['id'];
export type AgentSpec = {
  id: string;
  name: string;
  capabilities: CapabilityId[];
  instructions: string;
  criteria: string;
  roleId?: string;
  templateId?: string;
  knowledgeIds?: string[];
};
export type Scene = {
  id: string;
  name: string;
  priority: boolean;
  keywords: string[];
  agents: AgentSpec[];
};
const agent = (
  id: string,
  templateId: string,
  caps: CapabilityId[],
  instructions: string,
): AgentSpec => {
  const role = enterpriseRoles.find((r) => r.id === templateId);
  if (!role) throw new Error(`岗位预设不存在：${templateId}`);
  return {
    id,
    templateId,
    name: role.name,
    capabilities: [...new Set([...role.capabilities, ...caps])],
    instructions: `${role.instructions}\n本场景职责：${instructions}`,
    criteria: role.criteria,
  };
};
export const scenes: Scene[] = [
  {
    id: 'content',
    name: '多渠道内容生产',
    priority: true,
    keywords: ['宣传', '公众号', '小红书', '文案', '海报', '视频', '内容'],
    agents: [
      agent('article', 'copywriter', ['copy'], '整理长文结构与完整正文。'),
      agent(
        'social',
        'new-media',
        ['copy'],
        '整理小红书标题、正文和互动提问。',
      ),
      agent(
        'poster',
        'designer',
        ['visual'],
        '提出海报创意与版式，输出制作说明。',
      ),
      agent(
        'video',
        'video-director',
        ['script'],
        '编写分镜脚本、字幕与素材需求。',
      ),
    ],
  },
  {
    id: 'proposal',
    name: '客户方案与报价',
    priority: true,
    keywords: ['方案', '报价', '客户需求', '合作方案'],
    agents: [
      agent(
        'requirements',
        'sales',
        ['requirements'],
        '整理包含与排除范围、需求缺口和验收。',
      ),
      agent(
        'solution',
        'solutions',
        ['solution'],
        '根据统一需求形成可交付方案。',
      ),
      agent(
        'cost',
        'finance',
        ['cost'],
        '根据真实单价和数量测算，缺少价格时列待补项。',
      ),
      agent(
        'schedule',
        'project-manager',
        ['schedule'],
        '评估依赖、里程碑、周期与负责人。',
      ),
    ],
  },
  {
    id: 'monthly',
    name: '企业经营月报',
    priority: true,
    keywords: ['月报', '经营分析', '月度', '经营报告'],
    agents: [
      agent('sales', 'sales', ['sales'], '分析商机进展和客户跟进。'),
      agent(
        'projects',
        'project-manager',
        ['schedule', 'risk'],
        '分析交付进度、卡点和责任。',
      ),
      agent(
        'finance',
        'finance',
        ['cash', 'cost'],
        '依据已录入财务区分到账、应收与预测。',
      ),
      agent(
        'park',
        'property-operations',
        ['space'],
        '分析出租、租约及能耗，缺少数据明确标注。',
      ),
    ],
  },
  {
    id: 'knowledge',
    name: '知识库批量整理',
    priority: true,
    keywords: ['知识', '整理入库', '资料整理', '归纳', '文档整理'],
    agents: [
      agent(
        'facts',
        'knowledge-admin',
        ['extract'],
        '按来源逐项提取事实和版本。',
      ),
      agent(
        'structure',
        'admin',
        ['extract'],
        '按原始资料、业务知识、岗位经验分类。',
      ),
      agent(
        'conflicts',
        'quality',
        ['extract', 'review'],
        '查找重复、冲突、过时和缺失内容。',
      ),
      agent(
        'experience',
        'knowledge-admin',
        ['extract'],
        '整理可复用流程与FAQ，保留适用条件。',
      ),
    ],
  },
  {
    id: 'risk',
    name: '项目风险巡检',
    priority: true,
    keywords: ['风险', '延期', '亏损', '巡检', '卡点'],
    agents: [
      agent(
        'schedule',
        'project-manager',
        ['schedule'],
        '核对计划、依赖与进度。',
      ),
      agent('cost', 'finance', ['cost'], '检查预算、实际成本和未知项。'),
      agent('scope', 'solutions', ['risk'], '检查增项、返工和需求变更。'),
      agent(
        'acceptance',
        'account-manager',
        ['delivery', 'cash'],
        '核对验收版本、回款条件和跟进事项。',
      ),
    ],
  },
  {
    id: 'leasing',
    name: '招商推广',
    priority: false,
    keywords: ['招商', '招租', '园区推广'],
    agents: [
      agent(
        'profile',
        'leasing',
        ['sales', 'match'],
        '整理目标企业画像和需求。',
      ),
      agent(
        'space',
        'property-operations',
        ['space'],
        '按条件匹配可用空间与设施。',
      ),
      agent('copy', 'new-media', ['copy'], '撰写招商文案和合作价值说明。'),
      agent(
        'channel',
        'marketing',
        ['copy', 'event'],
        '规划渠道内容与触达任务。',
      ),
    ],
  },
  {
    id: 'event',
    name: '活动筹备',
    priority: false,
    keywords: ['活动', '交流会', '论坛', '开放日'],
    agents: [
      agent('agenda', 'event-planner', ['event'], '编排议程与执行检查表。'),
      agent('guests', 'business', ['match'], '给出嘉宾和参会企业候选与依据。'),
      agent('venue', 'admin', ['space', 'event'], '整理场地、设备和物料要求。'),
      agent('budget', 'finance', ['cost'], '基于已知报价列预算与缺口。'),
    ],
  },
  {
    id: 'delivery',
    name: '项目联合交付',
    priority: false,
    keywords: ['联合交付', '交付材料', '交付包'],
    agents: [
      agent('plan', 'project-manager', ['solution'], '拆分成果和专业责任。'),
      agent('documents', 'admin', ['delivery'], '编制交付目录和版本说明。'),
      agent(
        'quality',
        'quality',
        ['risk', 'delivery'],
        '按验收标准核对完整性。',
      ),
    ],
  },
  {
    id: 'matching',
    name: '企业供需撮合',
    priority: false,
    keywords: ['撮合', '合作伙伴', '供应方', '供需'],
    agents: [
      agent('needs', 'sales', ['requirements'], '拆解能力、交付及合作要求。'),
      agent(
        'partners',
        'business',
        ['match'],
        '查找授权展示的企业能力和案例。',
      ),
      agent(
        'conditions',
        'solutions',
        ['match', 'solution'],
        '比较条件、风险与待核实事项。',
      ),
    ],
  },
  {
    id: 'policy',
    name: '政策匹配与材料准备',
    priority: false,
    keywords: ['政策', '申报', '补贴'],
    agents: [
      agent(
        'source',
        'policy-specialist',
        ['policy'],
        '核对官方原文、时效与适用条件。',
      ),
      agent(
        'eligibility',
        'policy-specialist',
        ['policy'],
        '对照企业已提供资料逐项核查。',
      ),
      agent('materials', 'admin', ['policy'], '列出材料缺口、期限与责任。'),
    ],
  },
  {
    id: 'procurement',
    name: '采购比价',
    priority: false,
    keywords: ['采购', '供应商', '比价'],
    agents: [
      agent('spec', 'procurement', ['procurement'], '核对规格与需求一致性。'),
      agent(
        'price',
        'finance',
        ['cost', 'procurement'],
        '比较总成本、付款与报价假设。',
      ),
      agent(
        'service',
        'procurement',
        ['procurement'],
        '比较交期、服务和商务条款。',
      ),
    ],
  },
  {
    id: 'hiring',
    name: '招聘与入职准备',
    priority: false,
    keywords: ['招聘', '入职', '面试', '培训'],
    agents: [
      agent('job', 'hr', ['hr'], '形成岗位要求与能力标准。'),
      agent(
        'recruit',
        'copywriter',
        ['hr', 'copy'],
        '编写招聘文案和面试评价表。',
      ),
      agent(
        'onboarding',
        'hr',
        ['hr', 'solution'],
        '准备入职、培训和交接清单。',
      ),
    ],
  },
];
export function recommendScene(text: string) {
  return scenes
    .map((s) => ({
      s,
      score: s.keywords.reduce(
        (n, k) => n + (text.includes(k) ? k.length : 0),
        0,
      ),
    }))
    .sort((a, b) => b.score - a.score)[0].s;
}
export const capabilityIds = capabilities.map((c) => c.id) as string[];
export const sensitiveCapabilities = capabilities
  .filter((c) => 'sensitive' in c && c.sensitive)
  .map((c) => c.id) as string[];
export type AgentPolicy = {
  capabilities: string[];
  knowledgeMode: 'all' | 'selected';
  knowledgeIds: string[];
  includeShared: boolean;
  concurrency: number;
  tokenBudget: number;
};
export const defaultPolicy: AgentPolicy = {
  capabilities: [...capabilityIds],
  knowledgeMode: 'all',
  knowledgeIds: [],
  includeShared: true,
  concurrency: 3,
  tokenBudget: 1800,
};
export type KnowledgeSource = {
  id: string;
  title: string;
  version: string;
  layer: string;
  projectId: string;
  content: string;
  source: string;
};
export type AgentRun = {
  jobStatus?: string;
  id: string;
  companyId: string;
  projectId: string;
  sceneId: string;
  title: string;
  goal: string;
  input: string;
  status: string;
  version: number;
  generation: number;
  policy: AgentPolicy;
  snapshot: {
    model?: import('./model-settings').ModelTarget;
    sources: KnowledgeSource[];
    records: {
      id: string;
      kind: string;
      title: string;
      version: string;
      data: Record<string, string>;
    }[];
    finance: unknown;
  };
  directives: { actor: string; text: string; at: string }[];
  summary: string;
  checks: string;
  sensitive: number;
  createdBy: string;
  approvedBy: string;
  createdAt: string;
  updatedAt: string;
  leaseToken?: string;
  leaseUntil?: string;
  authorization?: {
    destination: string;
    confirmedBy: string;
    at: string;
    generation: number;
  } | null;
};
export type AgentTask = {
  id: string;
  runId: string;
  companyId: string;
  spec: AgentSpec;
  status: string;
  content: string;
  sources: KnowledgeSource[];
  provider: string;
  inputTokens: number;
  outputTokens: number;
  attempt: number;
  generation: number;
  error: string;
  startedAt: string;
  finishedAt: string;
};
export type AgentEvent = {
  seq: number;
  runId: string;
  companyId: string;
  taskId: string;
  generation: number;
  type: string;
  actor: string;
  content: string;
  createdAt: string;
};
export const runStatus: Record<string, string> = {
  queued: '待执行',
  running: '并行执行中',
  paused: '已暂停 / 人工接管',
  checking: '汇总核对中',
  awaiting_review: '待人工确认',
  approved: '已人工确认',
  failed: '执行失败',
  cancelled: '已取消',
};
