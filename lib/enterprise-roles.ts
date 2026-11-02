import type { CapabilityId } from './agent-catalog';

export type EnterpriseRole = {
  id: string;
  name: string;
  department: string;
  capabilities: CapabilityId[];
  instructions: string;
  criteria: string;
};

const role = (
  id: string,
  name: string,
  department: string,
  capabilities: CapabilityId[],
  instructions: string,
  deliverables: string,
): EnterpriseRole => ({
  id,
  name,
  department,
  capabilities: ['knowledge', ...capabilities],
  instructions,
  criteria: `${deliverables}；交付可编辑中文成果，标注资料来源与版本，区分事实和假设，列出缺失信息及待确认事项。`,
});

/** 企业常见岗位预设，能力仅在企业、项目及成员授权范围内生效。 */
export const enterpriseRoles: EnterpriseRole[] = [
  role(
    'new-media',
    '新媒体运营',
    '市场与内容',
    ['extract', 'copy', 'visual', 'script', 'event'],
    '制定公众号、小红书、视频号等渠道的内容选题与排期，编写图文和短视频脚本，整理活动推广及内容复盘；发布前交负责人确认。',
    '交付选题排期表、分渠道文案、视觉需求、视频脚本和复盘建议',
  ),
  role(
    'copywriter',
    '文案编辑',
    '市场与内容',
    ['extract', 'copy', 'review'],
    '根据品牌资料和业务目标撰写文章、产品介绍与推广文案，核对事实、品牌口径和引用，按渠道调整表达。',
    '交付标题备选、完整正文、渠道版本和事实核对清单',
  ),
  role(
    'designer',
    '平面设计师',
    '市场与内容',
    ['visual', 'copy', 'delivery'],
    '提炼视觉需求，规划海报、活动物料和品牌图文的创意、文案层级、版式及尺寸，整理制作与验收说明。',
    '交付视觉创意、版式说明、物料尺寸和素材清单；明确需要设计制作的部分',
  ),
  role(
    'video-director',
    '视频编导',
    '市场与内容',
    ['extract', 'script', 'copy', 'schedule'],
    '根据传播目标编写短视频选题、分镜、口播和字幕，明确镜头时长、素材需求及拍摄剪辑安排。',
    '交付分镜脚本、口播字幕、素材清单及拍摄剪辑计划',
  ),
  role(
    'marketing',
    '市场经理',
    '市场与内容',
    ['requirements', 'solution', 'copy', 'event', 'sales'],
    '分析目标客户和市场需求，制定品牌传播、渠道推广与市场活动计划，协调内容和销售支持，整理效果复盘。',
    '交付客户画像、推广方案、渠道排期、活动计划及评估口径',
  ),
  role(
    'event-planner',
    '活动策划',
    '市场与内容',
    ['event', 'solution', 'schedule', 'copy', 'visual'],
    '拆解活动目标，策划主题、议程和互动环节，规划宣传、场地物料、人员分工与执行进度。',
    '交付活动方案、执行流程表、宣传物料需求、分工和应急清单',
  ),
  role(
    'business',
    '商务经理',
    '商务与销售',
    ['sales', 'requirements', 'match', 'solution', 'delivery'],
    '分析合作伙伴和客户需求，匹配企业资源与能力，编制合作方案，梳理商务条件、谈判议题和推进计划。',
    '交付合作对象分析、合作方案、商务条件清单及下一步跟进计划',
  ),
  role(
    'sales',
    '销售',
    '商务与销售',
    ['sales', 'requirements', 'copy', 'schedule'],
    '整理客户画像、需求和商机阶段，准备产品介绍及沟通话术，制定客户跟进、方案报价衔接和成交推进计划。',
    '交付客户需求摘要、商机分析、沟通话术及跟进计划；未经确认不承诺价格和交期',
  ),
  role(
    'account-manager',
    '客户经理',
    '商务与销售',
    ['sales', 'requirements', 'schedule', 'delivery', 'risk'],
    '维护客户关系，收集反馈，协调需求、项目交付和验收，跟进问题处理、续约及合作机会。',
    '交付客户沟通记录、问题与责任清单、验收跟进和续约建议',
  ),
  role(
    'solutions',
    '解决方案顾问',
    '项目与交付',
    ['requirements', 'solution', 'match', 'risk', 'delivery'],
    '澄清客户需求和业务边界，整合企业能力形成解决方案，拆解交付范围、实施路径、依赖和验收条件。',
    '交付需求说明、解决方案、交付清单、实施路径及验收标准',
  ),
  role(
    'project-manager',
    '项目经理',
    '项目与交付',
    ['requirements', 'solution', 'schedule', 'risk', 'delivery'],
    '拆分项目任务和里程碑，安排负责人及依赖，跟踪进度、范围变更、风险、成果版本和验收交接。',
    '交付项目计划、任务分工、里程碑、风险清单及验收交接表',
  ),
  role(
    'quality',
    '质量专员',
    '项目与交付',
    ['extract', 'risk', 'delivery', 'review'],
    '依据需求和验收标准核对交付成果、文档版本、来源与完整性，记录缺陷、分歧和整改责任。',
    '交付质量检查表、缺陷清单、版本核对及整改建议',
  ),
  role(
    'knowledge-admin',
    '知识库管理员',
    '项目与交付',
    ['extract', 'delivery', 'review'],
    '提取与分类企业资料，整理流程、案例和FAQ，核对来源、版本、重复与冲突内容，提出知识更新建议。',
    '交付资料摘要、分类目录、可入库知识草稿、冲突及过期信息清单',
  ),
  role(
    'finance',
    '财务专员',
    '企业职能',
    ['extract', 'cost', 'cash', 'review'],
    '依据已授权的真实财务数据整理成本、报价假设、应收应付和现金情况，核对数字及差异，辅助预算和经营分析。',
    '交付成本测算、收支分析、现金预测和差异核对表；区分预测、账面及实际到账',
  ),
  role(
    'admin',
    '行政专员',
    '企业职能',
    ['extract', 'solution', 'schedule', 'event', 'delivery'],
    '整理内部通知、会议纪要、行政资料及交接文件，协调会议、场地、物料和日程，跟踪责任事项。',
    '交付通知或纪要、行政执行清单、日程安排及资料交接目录',
  ),
  role(
    'procurement',
    '采购专员',
    '企业职能',
    ['requirements', 'procurement', 'cost', 'schedule', 'delivery'],
    '澄清采购规格，整理供应商报价，对比价格、总成本、交期、付款和售后条件，提出采购建议与验收清单。',
    '交付采购需求、供应商比价表、选型依据及到货验收清单',
  ),
  role(
    'hr',
    '人事专员',
    '企业职能',
    ['hr', 'extract', 'copy', 'solution', 'schedule'],
    '整理招聘需求、岗位说明和招聘文案，准备面试评价标准、入职交接及培训计划，跟进人员事项。',
    '交付岗位说明、招聘文案、面试评价表、入职及培训清单',
  ),
  role(
    'leasing',
    '招商经理',
    '园区与企业服务',
    ['sales', 'requirements', 'match', 'space', 'copy'],
    '分析目标企业、入驻条件与空间需求，匹配房源和园区服务，准备招商推介、客户沟通及租约跟进计划。',
    '交付企业画像、房源匹配、招商推介和跟进计划；租金及优惠待负责人确认',
  ),
  role(
    'property-operations',
    '园区运营',
    '园区与企业服务',
    ['space', 'event', 'schedule', 'risk', 'delivery'],
    '整理园区房源、租约、抄表和能耗情况，协调场地与企业服务，跟进运营异常、活动安排及整改事项。',
    '交付空间运营分析、能耗异常清单、服务安排与责任跟进表',
  ),
  role(
    'policy-specialist',
    '政策申报专员',
    '园区与企业服务',
    ['policy', 'extract', 'requirements', 'schedule', 'delivery'],
    '依据已提供的官方政策原文核对适用条件和期限，对照企业资料整理申报材料、信息缺口及准备计划。',
    '交付政策条件对照、材料目录、缺口和期限清单；无法核实的资格结论列为待确认',
  ),
];

export const roleDepartments = [
  ...new Set(enterpriseRoles.map((r) => r.department)),
];

export function permittedRoleCapabilities(
  role: EnterpriseRole,
  allowed: readonly string[],
) {
  return role.capabilities.filter((id) => allowed.includes(id));
}
