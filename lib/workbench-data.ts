export type TaskStatus = 'draft' | 'review' | 'approved' | 'archived';
export type Task = { id: string; title: string; type: string; brief: string; audience: string; channel: string; owner: string; status: TaskStatus; content: string; createdAt: string; updatedAt: string; source: string; comment: string; dueDate: string };
export type Knowledge = { id: string; title: string; category: string; content: string; updatedAt: string };
export type Activity = { id: string; taskId: string; message: string; createdAt: string };
export type Flow = { id: string; title: string; description: string; type: string; enabled: boolean; runs: number };
export const statusLabels: Record<TaskStatus, string> = { draft: '草稿', review: '待审核', approved: '待发布', archived: '已归档' };
export const contentTypes = ['招商文案', '海报文案', '运营汇报', '政策解读', '企业专访'];
export const seedTasks: Task[] = [
  { id:'demo-1',title:'让好创意，发生在前海',type:'招商文案',brief:'介绍前海创客中心的智慧空间与企业服务，面向科技创业团队。',audience:'科技创业团队',channel:'微信公众号',owner:'林悦',status:'review',content:'让好创意，发生在前海\n\n在前海创客中心，为你的下一次创新找到生长的空间。\n\n从灵活的办公空间，到企业成长所需的服务支持，我们希望让创业团队专注于真正重要的事：打磨产品、连接伙伴、创造价值。\n\n了解空间与服务方案，欢迎联系园区运营团队预约参观。\n\n【演示文案：具体房源、价格与服务承诺需运营团队核实后发布。】',createdAt:'2026-09-09T01:30:00Z',updatedAt:'2026-09-09T02:15:00Z',source:'演示内容',comment:'请核对最新空置房源后发布。',dueDate:'2026-09-11'},
  { id:'demo-2',title:'创客开放日 · 与下一位伙伴相遇',type:'海报文案',brief:'为园区创客开放日设计海报文案，活动时间与地点待确认。',audience:'园区企业与创业者',channel:'小红书',owner:'陈晨',status:'draft',content:'创客开放日\n与下一位伙伴相遇\n\n带着想法来，带着新的可能出发。\n产品交流 · 创业分享 · 伙伴连接\n\n活动时间、地点及报名方式：待运营确认。',createdAt:'2026-09-09T02:00:00Z',updatedAt:'2026-09-09T02:00:00Z',source:'演示内容',comment:'',dueDate:'2026-09-12'},
  { id:'demo-3',title:'前海创客中心 Q3 运营报告',type:'运营汇报',brief:'整理第三季度空间运营、企业服务和内容表现。',audience:'运营管理团队',channel:'内部汇报',owner:'王磊',status:'review',content:'前海创客中心 Q3 运营报告\n\n1. 本季度工作概况\n围绕空间运营、企业服务与内容触达组织本季度复盘。\n\n2. 核心指标\n出租率、营业收入、能耗与内容数据：待导入真实经营数据。\n\n3. 重点工作\n梳理招商内容、企业服务活动与内容审核记录。\n\n4. 下季度计划\n完善知识库，统一内容审核流程，建立持续复盘机制。',createdAt:'2026-09-08T06:00:00Z',updatedAt:'2026-09-09T01:00:00Z',source:'演示内容',comment:'经营指标待财务确认。',dueDate:'2026-09-15'},
  { id:'demo-4',title:'园区企业成长服务指南',type:'政策解读',brief:'梳理园区企业可咨询的政策申报与成长服务。',audience:'初创企业',channel:'微信公众号',owner:'林悦',status:'approved',content:'园区企业成长服务指南\n\n在企业发展的不同阶段，可以向运营团队咨询政策申报、财税及资源对接等服务。\n\n申报资格、政策有效期和材料清单应以主管部门发布的正式文件为准。\n\n准备好企业基本情况和服务需求，与园区运营团队开启沟通。',createdAt:'2026-09-07T03:00:00Z',updatedAt:'2026-09-08T08:00:00Z',source:'演示内容',comment:'文案已审核；需人工发布到外部渠道。',dueDate:'2026-09-10'},
  { id:'demo-5',title:'一周创客动态 · 第 36 期',type:'企业专访',brief:'整理本周园区交流与企业动态。',audience:'园区企业',channel:'微信公众号',owner:'陈晨',status:'archived',content:'一周创客动态\n\n本期内容已完成工作台内部归档。本记录为演示数据，不代表已向任何外部平台发布。',createdAt:'2026-09-05T02:00:00Z',updatedAt:'2026-09-06T02:00:00Z',source:'演示内容',comment:'',dueDate:'2026-09-06'},
];
export const seedKnowledge: Knowledge[] = [
  {id:'kb-1',title:'创客中心 · 平台与品牌资料',category:'品牌资料',content:'创客中心智慧生态平台集智慧物业运营、AI 智能提效与企业生态赋能于一体。服务对象为园区运营团队、入驻企业与租户。当前工作台优先支持招商文案、海报文案、运营汇报和知识检索。不能编造房源价格、活动日期、合作企业或已实现的服务承诺。',updatedAt:'2026-09-09T00:00:00Z'},
  {id:'kb-2',title:'研发合同 · 功能范围摘要',category:'项目文档',content:'来源：前海创客中心智慧生态平台研发合同 V2 第二条。第一阶段：AI 基础框架、知识库、模块化中控台、内容生成、政策助手、智能客服、企业画像、可选数字孪生、基础票务与经营驾驶舱。第二阶段：空间招租预定、智慧水电、智慧物业、财务计费、企业档案。第三阶段：供需撮合、产业链图谱、发榜揭榜、生态积分、共享能力、联合投标与商业预测。第一阶段可使用样例数据，现场硬件和实时数据在第二阶段联调。',updatedAt:'2026-09-09T00:00:00Z'},
  {id:'kb-3',title:'内容发布 · 审核规范',category:'运营规范',content:'发布前必须检查品牌名称、企业名称、事实来源、数字与日期。政策内容必须核对主管部门正式文件和有效期，不得保证申报成功或补贴金额。招商内容需核对房源、价格、服务范围。AI 生成内容须人工审核。外部渠道未接入时，由运营人员下载文案并手动发布，工作台内部归档不代表外部发布成功。',updatedAt:'2026-09-09T00:00:00Z'},
];
export const seedFlows: Flow[] = [
  {id:'flow-1',title:'招商内容生产',description:'品牌检索 → 招商文案 → 人工审核',type:'招商文案',enabled:true,runs:0},
  {id:'flow-2',title:'活动海报文案',description:'活动需求 → 海报文案 → 人工审核',type:'海报文案',enabled:true,runs:0},
  {id:'flow-3',title:'季度运营汇报',description:'经营资料 → 报告草稿 → 人工审核',type:'运营汇报',enabled:true,runs:0},
];
