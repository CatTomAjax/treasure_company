import { enterpriseRoles } from './enterprise-roles';

/** Shared, explicit schemas: the client form and server validation use the same contract. */
export type FieldSpec = {
  key: string;
  label: string;
  type?:
    | 'text'
    | 'textarea'
    | 'number'
    | 'money'
    | 'date'
    | 'datetime'
    | 'select'
    | 'ref'
    | 'url';
  required?: boolean;
  options?: string[];
  ref?: string;
  min?: number;
  max?: number;
};
export type ModuleSpec = {
  label: string;
  group: string;
  description: string;
  fields: FieldSpec[];
  states: string[];
  transitions: Record<string, string[]>;
  review?: string[];
  /** Generated service records are not ordinary user-editable business forms. */
  internal?: boolean;
};
const f = (
  key: string,
  label: string,
  type: FieldSpec['type'] = 'text',
  required = false,
  extra: Partial<FieldSpec> = {},
): FieldSpec => ({ key, label, type, required, ...extra });
const ref = (key: string, label: string, kind: string, required = false) =>
  f(key, label, 'ref', required, { ref: kind });
const choices = (
  key: string,
  label: string,
  options: string[],
  required = true,
) => f(key, label, 'select', required, { options });
function businessModule(
  label: string,
  group: string,
  description: string,
  fields: FieldSpec[],
  states = ['草稿', '待审核', '已确认', '已归档'],
  review = ['已确认'],
): ModuleSpec {
  const transitions: Record<string, string[]> = {};
  states.forEach((s, i) => {
    transitions[s] = [
      ...(i < states.length - 1 ? [states[i + 1]] : []),
      ...(i > 0 && i < states.length - 1 ? [states[0]] : []),
    ];
  });
  return { label, group, description, fields, states, transitions, review };
}
export const modules: Record<string, ModuleSpec> = {
  portraitAnalysis: {
    ...businessModule(
      '企业脸谱分析记录',
      '合作生态',
      '保存带来源版本的 AI 关系建议；资料变化后自动失效。',
      [
        f('fingerprint', '资料摘要'),
        f('content', '关联分析结果', 'textarea'),
        f('provider', '分析模型'),
      ],
    ),
    internal: true,
  },
  contract: businessModule(
    '合同与签署',
    '客户与交付',
    '保存报价依据、合同范围、付款条款和真实签署凭据，审核后建立订单。',
    [
      ref('quotationId', '确认报价', 'quotation', true),
      ref('customerId', '客户', 'customer', true),
      f('scope', '合同范围', 'textarea', true),
      f('amount', '合同金额（元）', 'money', true),
      f('paymentTerms', '付款条款', 'textarea', true),
      f('criteria', '验收标准', 'textarea', true),
      f('signedBy', '签署人', 'text', true),
      f('signedDate', '实际签署日期', 'date', true),
      f('evidence', '签署凭据/合同附件说明', 'textarea', true),
    ],
  ),
  order: businessModule(
    '订单与履约',
    '客户与交付',
    '将确认合同转为订单，关联项目及分期回款计划。',
    [
      ref('contractId', '确认合同', 'contract', true),
      ref('customerId', '客户', 'customer', true),
      f('scope', '交付范围', 'textarea', true),
      f('amount', '订单金额（元）', 'money', true),
      f('criteria', '验收条件', 'textarea', true),
    ],
    ['草稿', '待审核', '已确认', '履约中', '已完成'],
    ['已确认', '已完成'],
  ),
  collectionPlan: businessModule(
    '分期回款计划',
    '客户与交付',
    '按订单拆分节点和金额，确认计划后转入现有财务应收审核。',
    [
      ref('orderId', '订单', 'order', true),
      f('amount', '本期金额（元）', 'money', true),
      f('condition', '本期付款条件', 'textarea', true),
      f('materials', '收款准备材料', 'textarea', true),
    ],
  ),
  afterSale: businessModule(
    '售后与续约跟进',
    '客户与交付',
    '记录交付后的客户问题、续约机会、责任和办理结果。',
    [
      ref('customerId', '客户', 'customer', true),
      ref('projectId', '项目', 'project'),
      f('issue', '问题与需求', 'textarea', true),
      f('nextAction', '下一步动作', 'textarea', true),
      f('result', '实际办理结果', 'textarea'),
    ],
    ['待处理', '处理中', '待确认', '已完成'],
    ['已完成'],
  ),
  renewal: businessModule(
    '租约续租申请',
    '园区运营',
    '复制原租约资料、确认新周期和价格，审核后生成新租约草稿。',
    [
      ref('leaseId', '原租约', 'lease', true),
      f('startDate', '续租开始', 'date', true),
      f('endDate', '续租结束', 'date', true),
      f('rent', '新月租（元）', 'money', true),
      f('deposit', '新押金（元）', 'money', true),
      f('terms', '续租确认凭据与付款约定', 'textarea', true),
    ],
  ),
  invoiceRequest: businessModule(
    '开票申请与交接',
    '企业事务',
    '关联真实业务单据、购销方和金额，准备材料并跟踪外部票据回执。',
    [
      f('billId', '财务业务单号', 'text', true),
      choices('direction', '发票方向', ['销项', '进项']),
      f('buyer', '购方名称', 'text', true),
      f('taxpayerId', '购方纳税人识别号', 'text', true),
      f('items', '项目明细与规格', 'textarea', true),
      f('amount', '含税金额（元）', 'money', true),
      f('taxAmount', '票面税额（元）', 'money', true),
      f('recipient', '接收方式', 'text', true),
      f('receipt', '官方票号与回执（办理后）', 'textarea'),
    ],
  ),
  taxHandoff: businessModule(
    '税务资料交接',
    '企业事务',
    '按真实申报事项整理材料、缺项、服务商和办理回执。',
    [
      f('filingId', '税务申报事项ID', 'text', true),
      f('period', '所属期', 'text', true),
      f('materials', '已备材料清单', 'textarea', true),
      f('missing', '缺失资料清单', 'textarea'),
      f('recipient', '受托服务商/负责人', 'text', true),
      f('receipt', '交接及官方回执', 'textarea'),
    ],
  ),
  enterprise: businessModule(
    '企业档案',
    '合作生态',
    '维护企业能力、产品案例和核实资料；公开展示需明确授权。',
    [
      f('industry', '所属行业', 'text', true),
      f('contact', '联系人', 'text', true),
      f('phone', '联系方式'),
      f('capabilities', '能力与关键词', 'textarea', true),
      f('cases', '案例与资质', 'textarea'),
      choices('sharing', '生态展示', ['仅本企业', '授权展示']),
      f('verifiedBy', '资料核实人'),
      choices('profileType', '档案身份', ['合作伙伴', '本企业'], false),
      f('summary', '企业简介', 'textarea'),
      f('products', '产品与业务', 'textarea'),
      f('needs', '合作需求', 'textarea'),
      f('location', '所在地'),
    ],
  ),
  customer: businessModule(
    '客户经营',
    '客户与交付',
    '统一联系人、需求、续约日期与服务反馈。',
    [
      ref('enterpriseId', '关联企业', 'enterprise'),
      f('contact', '决策联系人', 'text', true),
      f('phone', '联系方式'),
      f('needs', '需求与背景', 'textarea', true),
      f('renewalDate', '续约日期', 'date'),
      f('feedback', '客户反馈', 'textarea'),
    ],
    ['潜在客户', '合作客户', '续约跟进', '已归档'],
    [],
  ),
  opportunity: businessModule(
    '商机跟进',
    '客户与交付',
    '核对需求、预算、联系人和采购时间，记录每一次推进。',
    [
      ref('customerId', '客户', 'customer', true),
      f('requirements', '需求范围', 'textarea', true),
      f('budget', '预算（元）', 'money', true),
      f('decisionContact', '决策联系人', 'text', true),
      f('targetDate', '预计决策日期', 'date', true),
      f('nextAction', '下一步动作', 'textarea', true),
      f('lossReason', '未成交原因', 'textarea'),
    ],
    ['新线索', '已验证', '方案沟通', '已成交', '未成交'],
    [],
  ),
  followup: businessModule(
    '沟通与催收',
    '客户与交付',
    '围绕商机、项目或应收记录跟进动作与工作耗时。',
    [
      ref('opportunityId', '商机', 'opportunity'),
      ref('projectId', '项目', 'project'),
      f('billId', '应收单号'),
      f('contact', '沟通对象', 'text', true),
      f('action', '跟进内容', 'textarea', true),
      f('nextAction', '下一步动作', 'textarea', true),
      f('hours', '实际耗时（小时）', 'number', false, { min: 0, max: 10000 }),
    ],
    ['待跟进', '已联系', '已完成'],
    [],
  ),
  requirement: businessModule(
    '需求确认',
    '客户与交付',
    '把需求来源、包含事项、排除事项与验收条件确认到同一版本。',
    [
      ref('customerId', '客户', 'customer', true),
      ref('opportunityId', '商机', 'opportunity'),
      f('scope', '包含事项', 'textarea', true),
      f('exclusions', '不包含事项', 'textarea', true),
      f('acceptanceCriteria', '验收标准', 'textarea', true),
      f('source', '原始依据', 'textarea', true),
      f('confirmedBy', '客户确认人'),
      f('confirmationEvidence', '客户确认凭据', 'textarea'),
    ],
  ),
  quotation: businessModule(
    '方案报价',
    '客户与交付',
    '范围、付款条件和修改轮次确认后，可一键建立交付项目。',
    [
      ref('requirementId', '确认需求', 'requirement', true),
      f('amount', '报价金额（元）', 'money', true),
      f('scope', '交付清单', 'textarea', true),
      f('paymentTerms', '付款节点', 'textarea', true),
      f('duration', '周期与阶段', 'textarea', true),
      f('revisions', '修改轮次', 'number', true, { min: 0, max: 100 }),
      f('confirmedBy', '客户确认人'),
      f('confirmationEvidence', '报价确认凭据', 'textarea'),
    ],
  ),
  project: businessModule(
    '项目管理',
    '客户与交付',
    '执行已确认范围，按里程碑推进并关联验收、成本与回款。',
    [
      ref('customerId', '客户', 'customer'),
      ref('quotationId', '报价版本', 'quotation'),
      f('scope', '执行范围', 'textarea', true),
      f('amount', '合同金额（元）', 'money', true),
      f('startDate', '开始日期', 'date', true),
      f('acceptanceCriteria', '验收条件', 'textarea', true),
      f('blocker', '当前卡点', 'textarea'),
    ],
    ['待启动', '执行中', '待验收', '已验收', '已归档'],
    ['已验收'],
  ),
  milestone: businessModule(
    '里程碑',
    '客户与交付',
    '阶段成果、责任人与计划日期对应。',
    [
      ref('projectId', '项目', 'project', true),
      f('deliverable', '交付成果', 'textarea', true),
      f('criteria', '完成标准', 'textarea', true),
    ],
    ['待开始', '进行中', '已完成'],
    ['已完成'],
  ),
  task: businessModule(
    '责任任务',
    '客户与交付',
    '明确下一步动作、截止日期、完成条件和处理结果。',
    [
      ref('projectId', '项目', 'project'),
      ref('milestoneId', '里程碑', 'milestone'),
      f('nextAction', '下一步动作', 'textarea', true),
      f('doneCriteria', '完成条件', 'textarea', true),
      f('result', '处理结果', 'textarea'),
      choices('priority', '优先级', ['普通', '紧急']),
      f('baselineHours', '原流程基线工时', 'number', false, { min: 0 }),
      f('actualHours', '实际工时', 'number', false, { min: 0 }),
    ],
    ['待处理', '处理中', '待确认', '已完成'],
    ['已完成'],
  ),
  delivery: businessModule(
    '交付版本',
    '客户与交付',
    '保留每次交付的版本、内容与成果权属。',
    [
      ref('projectId', '项目', 'project', true),
      ref('milestoneId', '里程碑', 'milestone'),
      f('revision', '交付版本号', 'text', true),
      f('content', '交付说明', 'textarea', true),
      f('ownership', '成果归属', 'textarea', true),
      f('evidence', '成果或文件链接', 'textarea', true),
    ],
    ['草稿', '已提交', '已确认', '已归档'],
  ),
  change: businessModule(
    '范围变更',
    '客户与交付',
    '新增工作单独确认费用与周期，不覆盖原报价版本。',
    [
      ref('projectId', '项目', 'project', true),
      f('scope', '新增或调整范围', 'textarea', true),
      f('amount', '增加费用（元）', 'money', true),
      f('days', '增加天数', 'number', true, { min: 0, max: 3650 }),
      f('confirmedBy', '客户确认人'),
      f('confirmationEvidence', '确认凭据', 'textarea'),
    ],
  ),
  acceptance: businessModule(
    '验收记录',
    '客户与交付',
    '记录验收材料和确认结果，通过后转入财务应收审核。',
    [
      ref('projectId', '项目', 'project', true),
      ref('deliveryId', '交付版本', 'delivery', true),
      f('criteria', '验收标准', 'textarea', true),
      f('evidence', '验收材料', 'textarea', true),
      f('submittedDate', '提交验收日期', 'date', true),
      f('confirmedBy', '客户确认人'),
      f('confirmationEvidence', '验收回执', 'textarea'),
      f('amount', '本次应收（元）', 'money', true),
      f('paymentDue', '应收到期日期', 'date', true),
    ],
    ['草稿', '待审核', '已确认', '已归档'],
  ),
  cost: businessModule(
    '成本与工时',
    '客户与交付',
    '区分实际、估算和未知成本，利润按项目汇总。',
    [
      ref('projectId', '项目', 'project', true),
      choices('basis', '成本口径', ['实际', '估算', '未知']),
      choices('category', '成本类别', ['人工', '采购', '外包', '返工', '其他']),
      f('amount', '金额（元）', 'money'),
      f('hours', '工时', 'number', false, { min: 0, max: 100000 }),
      f('evidence', '凭据或估算依据', 'textarea', true),
    ],
  ),
  retrospective: businessModule(
    '项目复盘',
    '客户与交付',
    '总结成本、返工、客户反馈；审核后沉淀岗位经验。',
    [
      ref('projectId', '项目', 'project', true),
      f('outcome', '业务结果', 'textarea', true),
      f('lessons', '经验与纠错', 'textarea', true),
      f('feedback', '客户反馈', 'textarea', true),
      f('reusable', '可复用方法', 'textarea', true),
    ],
  ),
  template: businessModule(
    '行业与项目模板',
    '知识与AI',
    '保存专业服务、品牌运营、产业采购等可复用交付步骤。',
    [
      choices('industry', '行业类型', [
        '专业服务',
        '品牌运营',
        '产业采购',
        '通用',
      ]),
      f('scope', '适用场景', 'textarea', true),
      f('steps', '任务步骤（每行一项）', 'textarea', true),
      f('criteria', '交付标准', 'textarea', true),
    ],
  ),
  knowledge: businessModule(
    '三层知识库',
    '知识与AI',
    '原始资料、业务知识、岗位经验分别管理，来源与版本可追溯。',
    [
      choices('layer', '知识层级', ['原始资料', '业务知识', '岗位经验']),
      f('category', '分类', 'text', true),
      f('content', '知识正文', 'textarea', true),
      f('source', '来源及原文版本', 'textarea', true),
      ref('projectId', '关联项目', 'project'),
      f('correction', '纠错与待确认项', 'textarea'),
    ],
  ),
  aiRole: businessModule(
    'AI岗位配置',
    '知识与AI',
    '定义职责、知识范围、工具权限和人工交付标准。',
    [
      choices('role', '岗位类型', [
        ...enterpriseRoles.map((role) => role.name),
        '运营',
        '销售',
        '内容',
        '项目',
        '财务',
        '客服',
        '自定义',
      ]),
      f('instructions', '岗位职责', 'textarea', true),
      ref('projectId', '项目独立岗位（留空为企业通用）', 'project'),
      f('capabilities', '允许能力ID（逗号分隔，见Agent能力目录）', 'textarea'),
      f('knowledgeIds', '限定知识ID（逗号分隔）', 'textarea'),
      choices('knowledgeLayer', '知识范围', [
        '全部已确认知识',
        '原始资料',
        '业务知识',
        '岗位经验',
      ]),
      choices('tool', '允许工具', [
        '生成草稿',
        '整理需求',
        '经营分析',
        '项目计划',
      ]),
      f('criteria', '交付标准', 'textarea', true),
      f('tokenBudget', '单次输出上限', 'number', true, { min: 256, max: 4000 }),
    ],
  ),
  aiRun: businessModule(
    'AI协作工作流',
    '知识与AI',
    '按岗位顺序接力，持久化每步产出；每次接力先由人确认。',
    [
      f('goal', '任务目标', 'textarea', true),
      ref('role1', '第一岗位', 'aiRole', true),
      ref('role2', '第二岗位', 'aiRole'),
      ref('role3', '第三岗位', 'aiRole'),
      ref('projectId', '关联项目', 'project'),
      f('input', '业务资料', 'textarea', true),
    ],
    ['待执行', '待人工确认', '已完成', '已归档'],
    ['已完成'],
  ),
  material: businessModule(
    '图文与文档',
    '内容生产',
    '编辑推广文案、SVG品牌海报和可交付文档，审核后导出。',
    [
      choices('format', '成果类型', ['图文', '海报', '文档', 'PPT']),
      f('audience', '目标受众', 'text', true),
      f('brief', '创作要求', 'textarea', true),
      f('content', '正文（可编辑）', 'textarea'),
      f('brandColor', '品牌色（#RRGGBB）'),
      ref('projectId', '项目', 'project'),
      f('sources', '资料依据', 'textarea'),
      f('pending', '待确认项', 'textarea'),
    ],
  ),
  video: businessModule(
    '视频剪辑',
    '内容生产',
    '逐镜头编辑脚本、字幕、时长与素材；预览并导出时间线、字幕及模板成片。',
    [
      f('script', '镜头脚本（每行一镜）', 'textarea', true),
      f('seconds', '每镜时长（秒）', 'number', true, { min: 1, max: 60 }),
      choices('ratio', '画幅', ['16:9', '9:16', '1:1']),
      ref('projectId', '项目', 'project'),
      f('notes', '素材与精修要求', 'textarea'),
      f('timeline', '时间线JSON（由编辑器维护）', 'textarea'),
      f('audioId', '配乐附件ID（由编辑器维护）'),
      f('audioVolume', '配乐音量（由编辑器维护）', 'number', false, {
        min: 0,
        max: 1,
      }),
    ],
  ),
  demand: businessModule(
    '真实需求',
    '合作生态',
    '明确预算、验收和日期；经授权发布到生态供需池。',
    [
      f('industry', '所属行业', 'text', true),
      f('scope', '需求范围', 'textarea', true),
      f('budget', '预算（元）', 'money', true),
      f('criteria', '验收条件', 'textarea', true),
      choices('sharing', '生态展示', ['仅本企业', '授权展示']),
      ref('enterpriseId', '需求所属企业档案', 'enterprise'),
    ],
    ['草稿', '待审核', '已确认', '已关闭'],
  ),
  collaboration: businessModule(
    '合作与专业服务',
    '合作生态',
    '保留服务商、分工、知识产权、争议和履约反馈。',
    [
      ref('demandId', '需求', 'demand'),
      ref('partnerId', '本企业服务商档案', 'enterprise'),
      ref('projectId', '联合项目', 'project'),
      f('partnerName', '合作方名称', 'text', true),
      f('responsibility', '责任分工', 'textarea', true),
      f('ownership', '成果与资料权限', 'textarea', true),
      f('terms', '费用与交付条件', 'textarea', true),
      f('feedback', '履约反馈', 'textarea'),
      f('dispute', '争议与处理', 'textarea'),
    ],
    ['洽谈中', '待确认', '协作中', '已交付', '已关闭'],
    ['协作中', '已交付'],
  ),
  space: businessModule(
    '空间房源',
    '园区运营',
    '维护真实房间、面积、租金、位置和场地资料。',
    [
      f('location', '楼层与位置', 'text', true),
      f('area', '面积（平方米）', 'number', true, { min: 0.1 }),
      f('rent', '月租（元）', 'money', true),
      f('features', '设施与适合企业', 'textarea', true),
      f('images', '实景资料链接', 'textarea'),
    ],
    ['可预约', '维护中', '已停用'],
    [],
  ),
  booking: businessModule(
    '空间预约',
    '园区运营',
    '按房源校验时间冲突，记录预约人与用途。',
    [
      ref('spaceId', '空间', 'space', true),
      f('start', '开始时间', 'datetime', true),
      f('end', '结束时间', 'datetime', true),
      f('contact', '预约人', 'text', true),
      f('purpose', '使用目的', 'textarea', true),
    ],
    ['待确认', '已确认', '已完成', '已取消'],
    ['已确认'],
  ),
  lease: businessModule(
    '租约与续租',
    '园区运营',
    '租约日期、租金、缴费与续租责任集中跟进。',
    [
      ref('spaceId', '空间', 'space', true),
      ref('enterpriseId', '承租企业', 'enterprise', true),
      f('startDate', '起租日期', 'date', true),
      f('endDate', '到期日期', 'date', true),
      f('rent', '每月租金（元）', 'money', true),
      f('deposit', '押金（元）', 'money', true),
      f('contract', '合同与付款约定', 'textarea', true),
    ],
    ['草稿', '待审核', '已确认', '已终止'],
  ),
  meter: businessModule(
    '水电计量点',
    '园区运营',
    '登记仪表编号、房源、单价和异常阈值。',
    [
      ref('spaceId', '空间', 'space', true),
      choices('type', '计量类型', ['用电', '用水']),
      f('serial', '仪表编号', 'text', true),
      f('price', '单价（元）', 'number', true, { min: 0, max: 1000 }),
      f('threshold', '单期异常用量阈值', 'number', true, { min: 0 }),
    ],
    ['启用', '停用'],
    [],
  ),
  reading: businessModule(
    '抄表与用量账单',
    '园区运营',
    '手工或接口录入累计读数，计算用量、识别异常并生成应收。',
    [
      ref('meterId', '计量点', 'meter', true),
      f('startDate', '账期开始', 'date', true),
      f('endDate', '账期结束', 'date', true),
      f('previous', '期初累计读数', 'number', true, { min: 0 }),
      f('current', '期末累计读数', 'number', true, { min: 0 }),
      f('payer', '缴费企业', 'text', true),
    ],
    ['草稿', '待审核', '已确认', '已归档'],
  ),
  service: businessModule(
    '物业与园区服务',
    '园区运营',
    '维修、设备、专业服务与活动需求统一派单。',
    [
      ref('spaceId', '服务空间', 'space'),
      ref('projectId', '项目', 'project'),
      choices('category', '服务类型', [
        '设施维修',
        '能耗异常',
        '环境保洁',
        '通行服务',
        '专业服务',
        '活动支持',
      ]),
      choices('priority', '优先级', ['普通', '紧急']),
      f('reporter', '申请人', 'text', true),
      f('description', '问题描述', 'textarea', true),
      f('result', '处理结果', 'textarea'),
    ],
    ['待处理', '处理中', '待确认', '已完成'],
    ['已完成'],
  ),
  policy: businessModule(
    '政策与制度',
    '园区运营',
    '保存正式政策来源、适用条件、截止日期和材料清单。',
    [
      f('sourceUrl', '官方原文链接', 'url', true),
      f('industry', '适用行业', 'text', true),
      f('conditions', '适用条件', 'textarea', true),
      f('materials', '申报材料清单', 'textarea', true),
      f('content', '原文摘要', 'textarea', true),
    ],
  ),
  notice: businessModule(
    '政企发文',
    '园区运营',
    '草稿审核后发布内部通知，逐企业保留回执和待办。',
    [
      ref('policyId', '关联政策', 'policy'),
      f('content', '通知正文', 'textarea', true),
      f('audience', '适用企业条件', 'textarea', true),
      f('recipients', '接收企业ID（逗号分隔）', 'textarea', true),
    ],
    ['草稿', '待审核', '已确认', '已归档'],
  ),
  receipt: businessModule(
    '通知回执',
    '园区运营',
    '确认已收到通知并记录后续动作。',
    [
      ref('noticeId', '通知', 'notice', true),
      f('recipient', '接收方', 'text', true),
      f('response', '阅读反馈', 'textarea'),
      f('nextAction', '跟进事项', 'textarea'),
    ],
    ['未读', '已读', '已办结'],
    [],
  ),
  employee: businessModule(
    '人事档案',
    '企业事务',
    '保存人员岗位、入职、培训和交接记录。',
    [
      f('department', '部门', 'text', true),
      f('position', '岗位', 'text', true),
      f('contact', '联系方式'),
      f('startDate', '入职日期', 'date', true),
      f('skills', '技能与培训', 'textarea'),
      f('handover', '交接清单', 'textarea'),
    ],
    ['待入职', '在职', '离职交接', '已离职'],
    ['在职', '已离职'],
  ),
  recruitment: businessModule(
    '招聘与培训',
    '企业事务',
    '岗位需求、候选资料、面试评价或培训计划。',
    [
      choices('type', '事项类型', ['招聘', '培训']),
      f('requirements', '岗位要求或学习目标', 'textarea', true),
      f('candidate', '候选人或参加人'),
      f('evaluation', '评价与结果', 'textarea'),
    ],
    ['计划中', '进行中', '待确认', '已完成'],
    ['已完成'],
  ),
  admin: businessModule(
    '行政流程',
    '企业事务',
    '按制度办理申请，保留审批与交接结果。',
    [
      choices('type', '申请类别', ['请假', '用印', '设备领用', '差旅', '其他']),
      ref('employeeId', '申请人员', 'employee'),
      f('description', '申请内容', 'textarea', true),
      f('policy', '制度依据', 'textarea', true),
      f('result', '办结结果', 'textarea'),
    ],
    ['草稿', '待审核', '已确认', '已归档'],
  ),
  purchase: businessModule(
    '采购需求',
    '企业事务',
    '采购规格、预算、供应商报价与交付条件对比。',
    [
      f('specification', '规格与数量', 'textarea', true),
      f('budget', '预算（元）', 'money', true),
      f('criteria', '选择与验收条件', 'textarea', true),
      ref('projectId', '项目', 'project'),
    ],
  ),
  supplierQuote: businessModule(
    '供应商比价',
    '企业事务',
    '逐项记录报价、周期、质量和付款条件。',
    [
      ref('purchaseId', '采购需求', 'purchase', true),
      f('supplier', '供应商', 'text', true),
      f('amount', '含税报价（元）', 'money', true),
      f('days', '交付天数', 'number', true, { min: 0, max: 3650 }),
      f('terms', '付款与质量条件', 'textarea', true),
    ],
    ['待比较', '已选定', '未选定'],
    ['已选定'],
  ),
  event: businessModule(
    '活动与产业机会',
    '合作生态',
    '活动报名、合作需求和后续责任跟进。',
    [
      f('location', '地点', 'text', true),
      f('start', '活动时间', 'datetime', true),
      f('description', '活动内容', 'textarea', true),
      f('participants', '报名及确认记录', 'textarea'),
      f('opportunities', '产业机会与下一步', 'textarea'),
    ],
  ),
  validation: businessModule(
    '价值验证',
    '经营分析',
    '采集基线与实际数据，按真实记录验证节省时间和交付结果。',
    [
      ref('projectId', '项目', 'project'),
      choices('metric', '验证指标', [
        '返工工时',
        '验收耗时',
        '催收工时',
        '报价工时',
        '服务对接耗时',
        '交付质量',
      ]),
      f('baseline', '基线值', 'number', true, { min: 0 }),
      f('actual', '实际值', 'number', true, { min: 0 }),
      f('unit', '单位', 'text', true),
      f('evidence', '核对材料与差异原因', 'textarea', true),
    ],
  ),
};
modules.opportunity.transitions = {
  新线索: ['已验证', '未成交'],
  已验证: ['方案沟通', '未成交'],
  方案沟通: ['已成交', '未成交'],
  已成交: [],
  未成交: ['新线索'],
};
modules.booking.transitions = {
  待确认: ['已确认', '已取消'],
  已确认: ['已完成', '已取消'],
  已完成: [],
  已取消: [],
};
export type BusinessRecord = {
  id: string;
  companyId: string;
  kind: string;
  title: string;
  owner: string;
  dueDate: string;
  status: string;
  data: Record<string, string>;
  version: string;
  createdAt: string;
  updatedAt: string;
};
export type PlatformUser = {
  id: string;
  name: string;
  email: string;
  isAdmin: boolean;
};
export type Tenant = { id: string; name: string; role: string };
export const groups = [
  '客户与交付',
  '知识与AI',
  '内容生产',
  '合作生态',
  '园区运营',
  '企业事务',
  '经营分析',
];
