import type { PptItem, PptState } from './ppt-model';
import { PlatformError, str } from './platform-auth';
const day = () =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
const record = (
  title: string,
  fields: Record<string, string> = {},
): PptItem => ({
  id: crypto.randomUUID(),
  title,
  status: '草稿',
  date: day(),
  ...fields,
});
function find(s: PptState, collection: string, id: unknown) {
  const found = s.collections[collection]?.find((x) => x.id === id);
  if (!found) throw new PlatformError('关联记录不存在', 404);
  return found;
}
function linked(
  s: PptState,
  collection: string,
  sourceId: string,
  create: () => PptItem,
) {
  const old = s.collections[collection].find((x) => x.sourceId === sourceId);
  if (old) return old;
  const item = create();
  item.sourceId = sourceId;
  s.collections[collection].unshift(item);
  return item;
}
function checks(b: Record<string, unknown>, count: number) {
  if (
    !Array.isArray(b.checks) ||
    b.checks.length !== count ||
    !b.checks.every((x) => x === true)
  )
    throw new PlatformError('请完成全部人工确认项');
}
export function afterPptSave(
  s: PptState,
  collection: string,
  item: PptItem,
  old: PptItem | undefined,
  actor: string,
) {
  if (!old && !item.date) item.date = day();
  if (!item.owner) item.owner = actor;
  if (collection === 'documents' && !old) s.settings.activeDocument = item.id;
  if (
    ['tasks', 'projects', 'collaboration'].includes(collection) &&
    item.progress !== undefined &&
    (!Number.isFinite(Number(item.progress)) ||
      Number(item.progress) < 0 ||
      Number(item.progress) > 100)
  )
    throw new PlatformError('进度必须在0至100之间');
  if (
    ['orders', 'runs'].includes(collection) &&
    item.stage !== undefined &&
    (!Number.isInteger(Number(item.stage)) ||
      Number(item.stage) < 0 ||
      Number(item.stage) > 4)
  )
    throw new PlatformError('流程阶段无效');
  if (collection === 'runs' && !old) {
    s.settings.activeRun = item.id;
    s.settings.workflowStage = item.stage || '0';
  }
  if (collection === 'requirements' && !old)
    s.settings.activeRequirement = item.id;
  if (collection === 'spaces' && old && item.date && item.date !== old.date) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(item.date))
      throw new PlatformError('预约日期无效');
    const renew = old.status === '已出租',
      target = renew ? 'leases' : 'bookings';
    if (
      s.collections[target].some(
        (x) =>
          x.spaceId === item.id &&
          x.date === item.date &&
          x.status !== '已取消',
      )
    )
      throw new PlatformError('该日期已有预约或续租安排');
    s.collections[target].unshift(
      record(`${item.title} · ${renew ? '续租安排' : '预约参观'}`, {
        spaceId: item.id,
        date: item.date,
        owner: actor,
        amount: item.price,
        status: renew ? '待确认' : '已预约',
        content: item.content,
      }),
    );
  }
  if (collection === 'meters') {
    const next = Number(item.reading),
      previous = Number(old?.reading || 0);
    if (!Number.isFinite(next) || next < 0 || (old && next < previous))
      throw new PlatformError('累计读数不能为负，也不能小于上次读数');
    if (old && next > previous) {
      const usage = Math.round((next - previous) * 1000) / 1000,
        rate = Number(item.rate || (item.type === '水' ? '4.5' : '0.85'));
      if (!Number.isFinite(rate) || rate < 0 || rate > 1000)
        throw new PlatformError('计量单价无效');
      const reading = record(`${item.title} · ${day()}`, {
        meterId: item.id,
        space: item.space,
        type: item.type,
        previous: String(previous),
        reading: String(next),
        usage: String(usage),
        rate: String(rate),
        amount: (usage * rate).toFixed(2),
        status: '已确认',
        owner: actor,
      });
      s.collections.readings.unshift(reading);
      s.collections.bills.unshift(
        record(`${item.space} ${item.type}用量账单`, {
          sourceId: reading.id,
          type: '收入',
          amount: reading.amount,
          status: '待收款',
          customer: item.owner || item.space,
          invoice: '待开票',
          content: `${previous} → ${next} ${item.unit}，用量 ${usage}，单价 ${rate}`,
          owner: actor,
        }),
      );
    }
  }
  if (collection === 'knowledge' && old && old.content !== item.content) {
    s.collections.versions.unshift(
      record(item.title, {
        recordId: item.id,
        version: old.version || 'v1.0',
        content: old.content,
        owner: actor,
        status: old.status,
        date: day(),
      }),
    );
    const n = Number((old.version || 'v1.0').replace('v', ''));
    item.version = `v${(Number.isFinite(n) ? n + 0.1 : 1).toFixed(1)}`;
  }
  if (
    collection === 'bills' &&
    ['已收款', '已付款'].includes(item.status) &&
    !['已收款', '已付款'].includes(old?.status || '')
  )
    linked(s, 'payments', item.id, () =>
      record(item.title, {
        billId: item.id,
        amount: item.amount,
        type: item.type,
        status: '已确认',
        owner: actor,
        content: '本地账务确认记录，不执行银行转账。',
      }),
    );
  if (collection === 'receivables') {
    if (
      !Number.isInteger(Number(item.stage || 0)) ||
      Number(item.stage || 0) < 0 ||
      Number(item.stage || 0) > 5
    )
      throw new PlatformError('回款条件阶段须为0至5');
    if (item.status === '已收款') {
      item.stage = '5';
      const bill = linked(s, 'bills', item.id, () =>
        record(item.title, {
          amount: item.amount,
          customer: item.customer,
          type: '收入',
          status: '已收款',
          invoice: '已开票',
          owner: actor,
          date: day(),
          receivableId: item.id,
        }),
      );
      linked(s, 'payments', bill.id, () =>
        record(item.title, {
          billId: bill.id,
          amount: item.amount,
          type: '收入',
          status: '已确认',
          owner: actor,
          content: '根据负责人确认的到账记录入账，不执行银行转账。',
        }),
      );
    }
  }
}
export function runPptOperation(
  s: PptState,
  action: string,
  b: Record<string, unknown>,
  actor: string,
): string {
  if (
    [
      'video.script',
      'video.storyboard',
      'video.captions',
      'video.template',
    ].includes(action)
  ) {
    const scenes = s.collections.scenes;
    if (!scenes.length) throw new PlatformError('请先导入镜头素材');
    if (action === 'video.script') {
      s.settings.videoScript = scenes
        .map(
          (scene, i) =>
            `${i + 1}. ${scene.title.replace(/\.[a-z0-9]+$/i, '')}：${scene.caption || '展示业务场景，连接企业与伙伴。'}`,
        )
        .join('\n');
      return '已按镜头资料生成本地脚本，可编辑后保存；不调用外部模型';
    }
    if (action === 'video.storyboard') {
      if (!s.settings.videoScript)
        throw new PlatformError('请先生成或填写视频脚本');
      const lines = s.settings.videoScript
        .split('\n')
        .map((x) => x.trim())
        .filter(Boolean)
        .slice(0, 12);
      const originals = [...scenes];
      s.collections.scenes = lines.map((line, i) => ({
        ...originals[i % originals.length],
        id: originals[i]?.id || crypto.randomUUID(),
        title: line.split(/[:：]/)[0].slice(0, 100),
        caption: line.replace(/^.*?[:：]/, '').slice(0, 200),
        seconds: originals[i]?.seconds || '5',
        status: '待审核',
      }));
      return '已按脚本整理可编辑分镜，素材与字幕已同步';
    }
    if (action === 'video.captions') {
      for (const scene of scenes)
        scene.caption =
          scene.caption ||
          scene.title.replace(/^\d+[_、.\s]*/, '').replace(/\.[a-z0-9]+$/i, '');
      return '已依据镜头文案补齐字幕；语音识别需要在接口中心接入';
    }
    for (const scene of scenes) scene.transition = '淡入淡出';
    return '本地淡入淡出模板已应用到全部镜头';
  }
  if (action === 'import.confirm') {
    const source = find(s, 'imports', b.id);
    if (!b.fields || typeof b.fields !== 'object' || Array.isArray(b.fields))
      throw new PlatformError('请确认识别字段');
    const values = b.fields as Record<string, unknown>;
    const customer = str(values, '客户名称', 200),
      owner = str(values, '负责人', 100);
    const amount = str(values, '合同金额', 30),
      contract = str(values, '合同编号', 100, false);
    if (!Number.isFinite(Number(amount)) || Number(amount) < 0)
      throw new PlatformError('合同金额须为有效非负数字');
    const collections: Record<string, string> = {
      客户档案: 'customers',
      项目管理: 'projects',
      合同订单: 'orders',
      回款计划: 'receivables',
      企业知识: 'knowledge',
    };
    if (
      !Array.isArray(b.targets) ||
      !b.targets.length ||
      b.targets.some((t) => typeof t !== 'string' || !collections[t]) ||
      new Set(b.targets).size !== b.targets.length
    )
      throw new PlatformError('请选择有效且不重复的复用对象');
    const mapping = Object.fromEntries(
      Object.entries(values).filter(
        ([k, v]) =>
          ['客户名称', '合同编号', '合同金额', '付款节点', '负责人'].includes(
            k,
          ) &&
          typeof v === 'string' &&
          v.length <= 1000,
      ),
    ) as Record<string, string>;
    const generated: Record<string, string> = {};
    for (const target of b.targets as string[]) {
      const collection = collections[target];
      const result = linked(s, collection, `${source.id}:${collection}`, () =>
        record(`${customer} · ${target}`, {
          customer,
          owner,
          amount,
          contract,
          content: `来源：${source.title}\n${JSON.stringify(mapping)}\n\n原文：\n${source.content}`,
          status: '草稿',
          ...(collection === 'projects' ? { progress: '0', start: day() } : {}),
          ...(collection === 'orders' ? { stage: '0' } : {}),
          ...(collection === 'receivables' ? { stage: '0' } : {}),
          ...(collection === 'knowledge'
            ? { category: '导入资料', sources: source.id, roles: '项目经理' }
            : {}),
        }),
      );
      generated[collection] = result.id;
    }
    if (generated.orders && generated.projects)
      find(s, 'orders', generated.orders).projectId = generated.projects;
    if (generated.receivables && generated.orders)
      find(s, 'receivables', generated.receivables).orderId = generated.orders;
    source.mapping = JSON.stringify(mapping);
    source.targets = JSON.stringify(b.targets);
    source.generated = JSON.stringify(generated);
    source.count = String(Object.keys(mapping).length);
    source.status = '已确认';
    return `已复用到${b.targets.length}类业务对象；重复确认沿用原记录，原文已保留`;
  }
  if (action === 'requirement.confirm') {
    checks(b, 3);
    const r = find(s, 'requirements', b.id);
    r.status = '已确认';
    const q = linked(s, 'quotations', r.id, () =>
      record(`${r.title} · 报价`, {
        amount: r.amount || '0',
        content: `交付内容：${r.content}\n包含范围：${r.scope}\n不包含：${r.excluded}\n报价金额：¥${r.amount || '待确认'}\n验收与修改轮次请确认。`,
        owner: r.owner,
        status: '待确认',
        version: 'v1.0',
        requirementId: r.id,
      }),
    );
    q.requirementId = r.id;
    s.settings.activeQuotation = q.id;
    return '需求已确认，并生成关联报价草稿';
  }
  if (action === 'quotation.confirm') {
    checks(b, 2);
    const q = find(s, 'quotations', b.id);
    q.status = '已确认';
    if (typeof b.content === 'string') q.content = b.content.slice(0, 60000);
    const r =
      s.collections.requirements.find((x) => x.id === q.requirementId) ||
      s.collections.requirements[0];
    const p = linked(s, 'projects', q.id, () =>
      record(r?.title || q.title, {
        customer: r?.customer || '',
        amount: q.amount,
        owner: r?.owner || actor,
        content: q.content,
        status: '待开始',
        progress: '0',
        start: day(),
        date: r?.date || day(),
        quotationId: q.id,
      }),
    );
    for (const [i, t] of ['需求复核', '方案执行', '客户验收'].entries())
      linked(s, 'tasks', `${p.id}-${i}`, () =>
        record(t, {
          project: p.id,
          owner: p.owner,
          content: q.content,
          status: '待开始',
          progress: '0',
          priority: '中',
          date: p.date,
          checks: '确认任务范围,完成交付,资料归档',
        }),
      );
    s.settings.activeProject = p.id;
    return '报价已确认，项目、责任任务和验收节点已创建';
  }
  if (action === 'demand.connect') {
    const d = find(s, 'demands', b.id);
    d.status = '对接中';
    const o = linked(s, 'orders', d.id, () =>
      record(d.title, {
        customer: d.customer,
        amount: '0',
        owner: actor,
        content: d.content,
        status: '需求确认中',
        stage: '0',
        demandId: d.id,
      }),
    );
    s.settings.activeOrder = o.id;
    linked(s, 'communications', o.id, () =>
      record('合作意向已建立', {
        orderId: o.id,
        content: `需求方：${d.customer}；预算：${d.budget}。范围与报价等待双方确认。`,
        owner: actor,
        status: '已记录',
      }),
    );
    return '已建立关联合作订单和沟通记录，等待确认范围与报价';
  }
  if (action === 'order.advance') {
    const o = find(s, 'orders', b.id),
      next = Number(b.stage),
      stage = Number(o.stage || 0);
    if (!Number.isInteger(next) || next !== stage + 1 || next > 4)
      throw new PlatformError('请依次完成履约阶段');
    if (
      next === 3 &&
      !s.collections.deliverables.some((x) => x.orderId === o.id)
    )
      throw new PlatformError('请先上传交付成果');
    if (
      next === 4 &&
      !s.collections.deliverables
        .filter((x) => x.orderId === o.id)
        .every((x) => x.status === '已确认')
    )
      throw new PlatformError('请先确认全部交付成果');
    o.stage = String(next);
    o.status = ['需求确认中', '方案报价中', '执行中', '待验收', '已归档'][next];
    if (next === 2) {
      const project = linked(s, 'projects', o.id, () =>
        record(o.title, {
          content: o.content,
          owner: o.owner,
          amount: o.amount,
          customer: o.customer,
          status: '进行中',
          progress: '0',
          date: day(),
          start: day(),
          orderId: o.id,
        }),
      );
      o.projectId = project.id;
      for (const [i, title] of ['计划确认', '交付执行', '成果验收'].entries())
        linked(s, 'tasks', `${project.id}-${i}`, () =>
          record(title, {
            project: project.id,
            content: o.content,
            owner: o.owner,
            status: '待开始',
            progress: '0',
            priority: '中',
            date: day(),
            checks: '确认范围,形成成果,人工审核',
          }),
        );
      s.settings.activeProject = project.id;
    }
    if (next === 4)
      linked(s, 'receivables', o.id, () =>
        record(`${o.title} · 回款`, {
          amount: o.amount,
          customer: o.customer,
          owner: o.owner,
          content: '请按合同核对验收、发票与付款条件。',
          status: '待开票',
          stage: '3',
          orderId: o.id,
        }),
      );
    return '履约阶段已推进，相关资料已同步';
  }
  if (action === 'space.book' || action === 'space.renew') {
    const room = find(s, 'spaces', b.id),
      date = str(b, 'date', 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date)))
      throw new PlatformError('预约日期无效');
    const renew = action === 'space.renew';
    if (!renew && room.status === '已出租')
      throw new PlatformError('已出租空间不能预约');
    const collection = renew ? 'leases' : 'bookings';
    if (
      s.collections[collection].some(
        (x) =>
          x.spaceId === room.id && x.date === date && x.status !== '已取消',
      )
    )
      throw new PlatformError('该空间已有相同日期的安排');
    s.collections[collection].unshift(
      record(`${room.title} · ${renew ? '续租安排' : '预约参观'}`, {
        spaceId: room.id,
        date,
        owner: actor,
        amount: room.price,
        status: renew ? '待确认' : '已预约',
        content: room.content,
      }),
    );
    if (!renew) room.status = '已预约';
    room.date = date;
    return renew
      ? '已生成续租安排，等待负责人确认'
      : '预约已保存，房源状态已更新';
  }
  if (action === 'template.apply') {
    const t = find(s, 'templates', b.id),
      p = linked(s, 'projects', t.id, () =>
        record(`${t.title}试点项目`, {
          content: t.content,
          owner: actor,
          status: '待开始',
          progress: '0',
          start: day(),
          date: day(),
          templateId: t.id,
        }),
      );
    for (const [step, title] of t.steps.split(',').entries())
      linked(s, 'tasks', `${p.id}-${step}`, () =>
        record(title, {
          owner: actor,
          project: p.id,
          status: '待开始',
          priority: '中',
          progress: '0',
          date: day(),
          content: `依据${t.title}模板执行，完成后由负责人审核。`,
          checks: '确认范围,完成成果,人工审核',
        }),
      );
    const run = linked(s, 'runs', p.id, () =>
      record(t.title + '协同任务', {
        content: t.content,
        owner: actor,
        stage: '0',
        status: '待执行',
        project: p.id,
      }),
    );
    s.settings.activeProject = p.id;
    s.settings.activeRun = run.id;
    s.settings.workflowStage = run.stage;
    return '行业方案已配置：项目、岗位协同任务与责任事项已建立';
  }
  if (action === 'workflow.create') {
    const title = str(b, 'title', 200),
      run = record(title, {
        content: str(b, 'content', 30000, false),
        owner: actor,
        stage: '0',
        status: '待执行',
      });
    s.collections.runs.unshift(run);
    s.settings.activeRun = run.id;
    s.settings.workflowStage = '0';
    return '协同任务已创建';
  }
  if (action === 'document.generate') {
    const doc = find(s, 'documents', b.id),
      instruction = str(b, 'instruction', 3000),
      knowledge = s.collections.knowledge
        .filter((x) => x.status === '已发布')
        .slice(0, 3);
    doc.content =
      b.mode === '优化'
        ? `${doc.content.trim()}\n\n修订建议（本地规则）\n${instruction}\n请核对结构、业务依据、交付范围和负责人，并在人工审核后采用。`
        : `${doc.title}\n\n任务目标\n${instruction}\n\n业务依据\n${knowledge.map((k) => `「${k.title}」\n${k.content}`).join('\n\n')}\n\n执行计划\n1. 确认需求、范围与负责人。\n2. 制定计划并形成可编辑成果。\n3. 人工审核后交付与归档。\n\n待确认事项\n实际金额、日期、承诺与客户信息请负责人复核。`;
    doc.provider = '本地规则模板';
    doc.status = '草稿';
    return '已依据企业知识生成可编辑文档草稿';
  }
  throw new PlatformError('操作无效');
}
