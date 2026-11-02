export type WorkspaceMenuItem = { page: string; label: string };
export type WorkspaceMenuGroup = {
  id: string;
  title: string;
  icon: string;
  children: WorkspaceMenuItem[];
};

/** Stable navigation: every workspace page belongs to exactly one business group. */
export const workspaceNavigation: WorkspaceMenuGroup[] = [
  {
    id: 'overview',
    title: '经营总览',
    icon: 'LayoutDashboard',
    children: [
      { page: 'overview', label: '园区经营总览' },
      { page: 'analytics', label: '经营数据分析' },
      { page: 'validation', label: 'AI应用成效' },
    ],
  },
  {
    id: 'customers',
    title: '客户项目',
    icon: 'BriefcaseBusiness',
    children: [
      { page: 'crm', label: '客户与商机' },
      { page: 'requirements', label: '需求确认与报价' },
      { page: 'projects', label: '项目执行看板' },
      { page: 'brandProject', label: '项目变更与验收' },
      { page: 'receivables', label: '验收与回款跟进' },
    ],
  },
  {
    id: 'ai-tasks',
    title: 'AI任务管理',
    icon: 'BrainCircuit',
    children: [
      { page: 'roles', label: 'AI岗位配置' },
      { page: 'agents', label: 'Agent 执行中心' },
      { page: 'workflow', label: '多岗位协同流程' },
      { page: 'review', label: 'AI成果核对与审核' },
    ],
  },
  {
    id: 'knowledge',
    title: '企业知识库管理',
    icon: 'BookOpen',
    children: [
      { page: 'knowledge', label: '企业知识库' },
      { page: 'imports', label: '资料导入与整理' },
    ],
  },
  {
    id: 'creation',
    title: '内容创作',
    icon: 'Sparkles',
    children: [
      { page: 'content', label: '内容策划与运营' },
      { page: 'brand', label: '品牌视觉设计' },
      { page: 'video', label: '视频剪辑与制作' },
      { page: 'documents', label: '文档与PPT方案' },
    ],
  },
  {
    id: 'ecosystem',
    title: '生态合作',
    icon: 'Network',
    children: [
      { page: 'portrait', label: 'AI 企业脸谱' },
      { page: 'enterprises', label: '企业能力档案' },
      { page: 'matching', label: '供需机会匹配' },
      { page: 'orders', label: '合作订单与履约' },
      { page: 'collaboration', label: '跨企业联合交付' },
      { page: 'industry', label: '行业方案与OPC' },
    ],
  },
  {
    id: 'finance',
    title: '财务税务',
    icon: 'Wallet',
    children: [
      { page: 'finance', label: '收支与票据管理' },
      { page: 'tax', label: '税务资料与申报' },
      { page: 'cost', label: '项目成本与利润' },
      { page: 'cash', label: '现金预测与安排' },
    ],
  },
  {
    id: 'park',
    title: '园区运营',
    icon: 'Building2',
    children: [
      { page: 'spaces', label: '空间租赁与预约' },
      { page: 'energy', label: '智慧水电与计量' },
      { page: 'services', label: '物业服务工单' },
      { page: 'policy', label: '政策通知与发文' },
      { page: 'admin', label: '人事行政与采购' },
    ],
  },
  {
    id: 'system',
    title: '系统管理',
    icon: 'Settings2',
    children: [{ page: 'models', label: '模型配置与切换' },{ page: 'integrations', label: '外部接口配置' }],
  },
];
export function workspaceGroupFor(page: string) {
  return workspaceNavigation.find((g) =>
    g.children.some((item) => item.page === page),
  );
}
export function workspaceLabelFor(page: string) {
  return workspaceNavigation
    .flatMap((g) => g.children)
    .find((item) => item.page === page)?.label;
}
