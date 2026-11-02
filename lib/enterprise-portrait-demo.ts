import type { BusinessRecord } from './platform-config';
import { buildPortraitGraph } from './enterprise-portrait';

/** Explicitly fictional data, never inserted into the business database. */
export function demoPortraitGraph() {
  const companyId = 'portrait-demo';
  const row = (
    id: string,
    kind: string,
    title: string,
    data: Record<string, string>,
    status = '已确认',
  ): BusinessRecord => ({
    id,
    companyId,
    kind,
    title,
    data,
    status,
    owner: '演示负责人',
    dueDate: '',
    version: 'demo-v1',
    createdAt: '2026-11-03T00:00:00.000Z',
    updatedAt: '2026-11-03T00:00:00.000Z',
  });
  const companies = [
    [
      'self',
      '前海创客中心',
      '产业服务',
      '数字化、人工智能、活动策划、空间设计',
      '连接园区企业与专业服务，让每一次合作都有据可循。',
      '品牌升级、视频制作、系统开发',
      '创客开放日、园区数字化运营',
      '本企业',
    ],
    [
      'zhichuang',
      '智创未来',
      '数字科技',
      '系统开发、数字化、人工智能、物联网',
      '以技术连接业务，为成长企业构建数字化系统与智能应用。',
      '视觉设计、品牌策划',
      '制造企业数据平台、园区智能运营系统',
    ],
    [
      'chuangyi',
      '创意纪元',
      '品牌创意',
      '品牌策划、视觉设计、品牌升级、内容运营',
      '从品牌定位到视觉表达，陪伴企业完成品牌成长。',
      '数据分析、视频制作',
      '科技品牌全案、创客开放日视觉系统',
    ],
    [
      'yunqi',
      '云启智联',
      '人工智能',
      '人工智能、智能体、自动化、数据分析、系统开发',
      '以智能体和自动化流程，交付轻量敏捷的企业工具。',
      '品牌策划',
      '企业智能客服、业务流程自动化',
    ],
    [
      'yingxiang',
      '光合影像',
      '影像传媒',
      '视频制作、宣传片、摄影、剪辑、内容运营',
      '用影像讲述企业故事，提供从创意到成片的一站式制作。',
      '活动策划',
      '园区宣传片、科技产品影像',
    ],
    [
      'xinghe',
      '星河工业设计',
      '产品设计',
      '工业设计、智能硬件、用户体验、产品设计',
      '以产品体验为起点，连接工业设计与量产落地。',
      '物联网、系统开发',
      '智能家居终端、工业设备交互',
    ],
    [
      'wanqu',
      '湾区智造',
      '智能制造',
      '智能硬件、物联网、机器人、自动化',
      '面向制造企业提供设备联网与智能硬件解决方案。',
      '数据分析、工业设计',
      '工厂设备联网、智能仓储终端',
    ],
    [
      'yuansheng',
      '原生空间',
      '空间设计',
      '空间设计、品牌设计、活动策划',
      '为办公与商业空间打造有温度的场所体验。',
      '视觉设计',
      '共享办公空间、品牌展厅设计',
    ],
    [
      'kuajing',
      '远航跨境',
      '跨境贸易',
      '跨境、电商、营销、供应链',
      '帮助本土品牌进入海外市场，连接渠道与供应链。',
      '品牌策划、视频制作、数据分析',
      '消费品牌出海、跨境电商运营',
    ],
    [
      'qinglu',
      '青麓企服',
      '专业服务',
      '财税、法律、知识产权',
      '为成长型企业提供经营合规与知识产权服务。',
      '数字化',
      '企业财税服务、知识产权规划',
    ],
  ];
  const records = companies.map(
    ([id, title, industry, capabilities, summary, needs, cases, profileType]) =>
      row(id, 'enterprise', title, {
        industry,
        capabilities,
        summary,
        needs,
        cases,
        profileType: profileType || '合作伙伴',
        sharing: '授权展示',
        location: '深圳 · 前海',
        contact: '演示联系人',
      }),
  );
  for (const [id, provider] of [
    ['video', 'yingxiang'],
    ['digital', 'zhichuang'],
    ['brand', 'chuangyi'],
  ]) {
    records.push(
      row(`customer-${id}`, 'customer', `${provider} 客户档案`, {
        enterpriseId: provider,
      }),
    );
    records.push(
      row(
        `order-${id}`,
        'order',
        {
          video: '创客开放日宣传片',
          digital: '园区数字运营平台',
          brand: '创客生态品牌升级',
        }[id] || id,
        { customerId: `customer-${id}`, scope: '依照确认范围交付并完成验收' },
        '履约中',
      ),
    );
  }
  records.push(
    row(
      'collab-design',
      'collaboration',
      '开放日联合策展',
      { partnerId: 'yuansheng', responsibility: '展陈空间与场地体验设计' },
      '协作中',
    ),
  );
  records.push(
    row('need-video', 'demand', '开放日品牌影像制作', {
      scope: '视频制作、宣传片、内容运营',
      sharing: '仅本企业',
    }),
  );
  records.push(
    row('need-hardware', 'demand', '智能硬件交互体验升级', {
      enterpriseId: 'zhichuang',
      scope: '工业设计、用户体验、智能硬件',
      sharing: '仅本企业',
    }),
  );
  records.push(
    row('need-brand', 'demand', '出海品牌整合营销', {
      enterpriseId: 'kuajing',
      scope: '品牌策划、视觉设计、视频制作',
      sharing: '仅本企业',
    }),
  );
  records.push(
    row('need-data', 'demand', '设备数据智能分析', {
      enterpriseId: 'wanqu',
      scope: '数据分析、系统开发、自动化',
      sharing: '仅本企业',
    }),
  );
  return buildPortraitGraph({
    companyId,
    companyName: '前海创客中心',
    records,
    mode: 'demo',
  });
}
