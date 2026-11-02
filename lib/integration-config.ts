export type ConnectionSpec = {
  label: string;
  category: string;
  description: string;
  mode: 'local' | 'handoff' | 'deepseek';
  fields: {
    key: string;
    label: string;
    required?: boolean;
    secret?: boolean;
  }[];
  steps: string[];
  docs: string;
};
export const connectionSpecs: Record<string, ConnectionSpec> = {
  local_studio: {
    label: '本地内容与媒体',
    category: '内容生产',
    mode: 'local',
    description: '本地文档、PPT、SVG海报及视频成片归档，不需要外部密钥。',
    fields: [],
    steps: [
      '选择已审核内容或视频',
      '创建生产任务并审核',
      '执行文档/海报任务；视频在编辑器渲染后上传成片',
      '检查成果并归档',
    ],
    docs: '',
  },
  deepseek: {
    label: 'DeepSeek 文本模型',
    category: 'AI岗位',
    mode: 'deepseek',
    description: '优先使用本企业加密密钥，可回退到已配置的服务端环境变量。',
    fields: [
      { key: 'model', label: '模型名称', required: true },
      { key: 'apiKey', label: 'API密钥', secret: true },
    ],
    steps: [
      '填写模型和服务端密钥',
      '执行配置检查',
      '用不含敏感信息的小任务核对真实返回',
      '配置岗位范围、输出预算和人工审核',
    ],
    docs: 'https://api-docs.deepseek.com/api/create-chat-completion/',
  },
  openai: {
    label:'OpenAI / Codex 模型',category:'AI岗位',mode:'handoff',description:'通过 OpenAI 官方 Responses API 调用所选模型，密钥加密保存。',
    fields:[{key:'model',label:'模型ID',required:true},{key:'apiKey',label:'OpenAI API密钥',secret:true}],
    steps:['保存API连接','获取本账户可用模型','真实推理连通测试','设置企业或项目默认模型'],
    docs:'https://developers.openai.com/api/docs/models',
  },
  image_provider: {
    label: '生成式图片服务',
    category: '内容生产',
    mode: 'handoff',
    description:
      '保存供应商配置，导出带品牌/尺寸/提示词的请求，按回执导入成果。未配置供应商时保留待接入。',
    fields: [
      { key: 'vendor', label: '供应商名称', required: true },
      { key: 'model', label: '模型/版本', required: true },
      { key: 'endpoint', label: '官方接口地址（HTTPS）' },
      { key: 'apiKey', label: 'API密钥', secret: true },
    ],
    steps: [
      '核实供应商与图片使用条款',
      '配置模型、尺寸和密钥',
      '下载任务请求包接入供应商或网关',
      '通过签名回调或人工上传图片并核对成果',
    ],
    docs: 'https://platform.openai.com/docs/guides/image-generation',
  },
  video_provider: {
    label: '生成式视频服务',
    category: '内容生产',
    mode: 'handoff',
    description:
      '管理异步视频任务、供应商任务号、素材与结果回执；不会把模板渲染视为模型生成。',
    fields: [
      { key: 'vendor', label: '供应商名称', required: true },
      { key: 'model', label: '视频模型', required: true },
      { key: 'endpoint', label: '官方接口地址（HTTPS）' },
      { key: 'apiKey', label: 'API密钥', secret: true },
    ],
    steps: [
      '确认供应商视频任务协议',
      '配置画幅、时长与模型',
      '通过请求包或自有网关提交',
      '保存任务号，回调或导入成片并验收',
    ],
    docs: '',
  },
  wechat_official: {
    label: '微信公众号',
    category: '渠道发布',
    mode: 'handoff',
    description:
      '分别记录素材、草稿、发布任务号和回执。外部发布须通过官方平台或接入网关完成。',
    fields: [
      { key: 'appId', label: '公众号AppID', required: true },
      { key: 'accountName', label: '公众号名称', required: true },
      { key: 'appSecret', label: 'AppSecret', secret: true },
      { key: 'operator', label: '发布负责人', required: true },
    ],
    steps: [
      '确认账号资质和接口权限',
      '配置AppID与服务端AppSecret、IP白名单',
      '已审核内容生成发布请求包',
      '在官方平台/网关创建草稿并发布',
      '导入发布任务号和最终回执',
    ],
    docs: 'https://developers.weixin.qq.com/doc/offiaccount/Publish/Publish.html',
  },
  video_channel: {
    label: '微信视频号',
    category: '渠道发布',
    mode: 'handoff',
    description: '视频号单独授权，不复用公众号接口冒充视频号发布。',
    fields: [
      { key: 'accountId', label: '视频号ID', required: true },
      { key: 'operator', label: '操作负责人', required: true },
      { key: 'vendor', label: '官方/获授权服务商' },
      { key: 'accessToken', label: '服务商令牌', secret: true },
    ],
    steps: [
      '确认视频号主体和授权范围',
      '按官方或获授权服务商完成接入',
      '提交已审核视频及标题封面',
      '登记实际发布链接和回执',
    ],
    docs: 'https://channels.weixin.qq.com/',
  },
  redbook: {
    label: '小红书',
    category: '渠道发布',
    mode: 'handoff',
    description: '保留笔记、图片和实际发布回执；使用官方或授权服务商能力。',
    fields: [
      { key: 'accountId', label: '账号/主体ID', required: true },
      { key: 'operator', label: '操作负责人', required: true },
      { key: 'vendor', label: '授权服务商' },
      { key: 'accessToken', label: '授权令牌', secret: true },
    ],
    steps: [
      '核实开放平台或服务商权限',
      '审核图文/视频与合规要求',
      '下载发布包或经授权网关操作',
      '登记实际笔记链接与回执',
    ],
    docs: 'https://open.xiaohongshu.com/',
  },
  iot_gateway: {
    label: '水电与IoT网关',
    category: '园区设备',
    mode: 'handoff',
    description:
      '按网关仪表映射接收签名累计读数，入库为待审核抄表，审核后算费。',
    fields: [
      { key: 'gatewayId', label: '网关编号', required: true },
      {
        key: 'protocol',
        label: '现场协议（MQTT/Modbus/HTTP等）',
        required: true,
      },
      { key: 'operator', label: '现场负责人', required: true },
      { key: 'callbackSecret', label: '回调签名密钥', secret: true },
    ],
    steps: [
      '登记计量点和真实仪表编号',
      '配置网关协议与字段映射',
      '配置HMAC签名回调并发送ping验证',
      '累计读数入待审核抄表',
      '人工确认后生成用量账单',
    ],
    docs: '',
  },
  bank_gateway: {
    label: '银行/支付与流水',
    category: '财务税务',
    mode: 'handoff',
    description:
      '收付款任务、实际流水导入、差额核对和财务人工确认。不会自动转账。',
    fields: [
      { key: 'vendor', label: '银行或支付服务商', required: true },
      { key: 'merchantId', label: '商户/企业编号', required: true },
      { key: 'operator', label: '财务负责人', required: true },
      { key: 'callbackSecret', label: '自有网关签名密钥', secret: true },
    ],
    steps: [
      '核实企业账户和官方授权',
      '对接自有网关或导出待处理付款单',
      '导入实际流水及交易号',
      '核对金额、账户和业务单据',
      '经理在现有财务模块登记实际收付',
    ],
    docs: 'https://pay.weixin.qq.com/doc/v3/merchant/',
  },
  invoice_gateway: {
    label: '电子发票服务',
    category: '财务税务',
    mode: 'handoff',
    description:
      '开票申请、材料、官方/服务商回执与原票归档，独立于内部发票台账。',
    fields: [
      { key: 'vendor', label: '开票平台/授权服务商', required: true },
      { key: 'taxpayerId', label: '本企业纳税人识别号', required: true },
      { key: 'operator', label: '开票负责人', required: true },
      { key: 'apiKey', label: '服务商密钥', secret: true },
    ],
    steps: [
      '确认企业授权及可用开票接口',
      '审核购销资料和金额税额',
      '导出开票申请并在官方/授权平台办理',
      '导入真实票号、原票文件和回执',
      '在税务台账核对并关联业务',
    ],
    docs: 'https://etax.chinatax.gov.cn/',
  },
  tax_gateway: {
    label: '税务申报交接',
    category: '财务税务',
    mode: 'handoff',
    description:
      '材料清单、申报交接、官方回执及缴款登记；没有统一自动申报接口时采用人工闭环。',
    fields: [
      { key: 'taxpayerId', label: '纳税人识别号', required: true },
      { key: 'region', label: '主管税务地区', required: true },
      { key: 'operator', label: '申报负责人', required: true },
      { key: 'vendor', label: '服务商（如有）' },
    ],
    steps: [
      '核实企业税种和实际申报期限',
      '整理票据、账本及缺失资料',
      '审核并导出交接包',
      '到官方税务系统办理',
      '导入回执及实际申报/缴款日期',
    ],
    docs: 'https://etax.chinatax.gov.cn/',
  },
  professional_service: {
    label: '专业服务与合作网关',
    category: '合作生态',
    mode: 'handoff',
    description: '向获授权合作方交接明确范围和验收条件，保存回执和成果。',
    fields: [
      { key: 'vendor', label: '合作方名称', required: true },
      { key: 'operator', label: '本方负责人', required: true },
      { key: 'serviceScope', label: '服务授权范围', required: true },
      { key: 'callbackSecret', label: '回调签名密钥', secret: true },
    ],
    steps: [
      '确认合作主体、责任和资料范围',
      '审核服务交接包',
      '通过自有渠道交付获授权资料',
      '登记接单、阶段成果及验收回执',
    ],
    docs: '',
  },
};
for (const spec of Object.values(connectionSpecs))
  if (
    spec.mode === 'handoff' &&
    !spec.fields.some((f) => f.key === 'callbackSecret')
  )
    spec.fields.push({
      key: 'callbackSecret',
      label: '自有网关回调签名密钥（可选）',
      secret: true,
    });
export type Connection = {
  id: string;
  companyId: string;
  provider: string;
  name: string;
  config: Record<string, string>;
  enabled: number;
  testStatus: string;
  testMessage: string;
  version: string;
  updatedAt: string;
  secrets: string[];
};
export type IntegrationJob = {
  id: string;
  companyId: string;
  connectionId: string;
  recordId: string;
  recordVersion: string;
  kind: string;
  title: string;
  status: string;
  payload: Record<string, unknown>;
  result: Record<string, unknown>;
  attempts: number;
  maxAttempts: number;
  nextRetryAt: string;
  remoteId: string;
  version: string;
  createdAt: string;
  updatedAt: string;
};
export const jobStates: Record<string, string> = {
  draft: '待审核',
  approved: '已审核',
  blocked: '待补配置',
  waiting_result: '待外部结果',
  running: '执行中',
  succeeded: '已完成',
  failed: '执行失败',
  cancelled: '已取消',
};
