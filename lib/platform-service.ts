import type { MySqlStatement } from '@/db/mysql';
import { database } from './store';
import {
  modules,
  type BusinessRecord,
  type PlatformUser,
} from './platform-config';
import { PlatformError, requireManager } from './platform-auth';
export type Actor = { user: PlatformUser; role: string };
export type RawRecord = Omit<BusinessRecord, 'data'> & { data: string };
export const decode = (r: RawRecord): BusinessRecord => ({
  ...r,
  data: JSON.parse(r.data),
});
export const today = () =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
export function validDate(v: string) {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(v) &&
    Number.isFinite(Date.parse(v)) &&
    new Date(v).toISOString().slice(0, 10) === v
  );
}
export const cents = (v: string) => Math.round(Number(v || 0) * 100);
export async function getRecord(companyId: string, id: string) {
  const r = await database()
    .prepare("SELECT * FROM treasure_business_records WHERE companyId=? AND id=?")
    .bind(companyId, id)
    .first<RawRecord>();
  if (!r) throw new PlatformError('业务记录不存在', 404);
  return decode(r);
}
export async function allRecords(companyId: string) {
  return (
    await database()
      .prepare(
        "SELECT * FROM treasure_business_records WHERE companyId=? ORDER BY updatedAt DESC",
      )
      .bind(companyId)
      .all<RawRecord>()
  ).results.map(decode);
}
export function checkSensitive(kind: string, role: string) {
  if (
    [
      'employee',
      'recruitment',
      'admin',
      'cost',
      'purchase',
      'supplierQuote','invoiceRequest','taxHandoff',
    ].includes(kind)
  )
    requireManager(role);
}
export function newRecord(
  companyId: string,
  kind: string,
  title: string,
  owner: string,
  data: Record<string, string>,
  dueDate = '',
  status?: string,
): BusinessRecord {
  if (!Object.hasOwn(modules, kind)) throw new PlatformError('业务类型无效');
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    companyId,
    kind,
    title,
    owner,
    dueDate,
    status: status || modules[kind].states[0],
    data,
    version: crypto.randomUUID(),
    createdAt: now,
    updatedAt: now,
  };
}
export async function validate(
  r: BusinessRecord,
  pending: BusinessRecord[] = [],
) {
  const spec = modules[r.kind];
  if (!spec) throw new PlatformError('业务类型无效');
  if (
    !r.title.trim() ||
    r.title.length > 160 ||
    !r.owner.trim() ||
    r.owner.length > 100
  )
    throw new PlatformError('请填写标题和负责人');
  if (r.dueDate && !validDate(r.dueDate))
    throw new PlatformError('截止日期无效');
  if (!spec.states.includes(r.status)) throw new PlatformError('状态无效');
  const allowed = new Set(spec.fields.map((f) => f.key));
  for (const key of Object.keys(r.data)) {
    if (!allowed.has(key)) throw new PlatformError(`未定义字段：${key}`);
  }
  for (const f of spec.fields) {
    const v = r.data[f.key] ?? '';
    if (
      typeof v !== 'string' ||
      v.length > (f.type === 'textarea' ? 30000 : 2000)
    )
      throw new PlatformError(`${f.label}过长或类型无效`);
    if (f.required && !v.trim()) throw new PlatformError(`请填写${f.label}`);
    if (!v) continue;
    if (
      f.type === 'money' &&
      (!/^\d{1,9}(\.\d{1,2})?$/.test(v) || !Number.isSafeInteger(cents(v)))
    )
      throw new PlatformError(`${f.label}须为最多两位小数的非负金额`);
    if (
      f.type === 'number' &&
      (!/^(?:\d+)(?:\.\d{1,4})?$/.test(v) ||
        !Number.isFinite(Number(v)) ||
        Number(v) < (f.min ?? 0) ||
        Number(v) > (f.max ?? 1000000000))
    )
      throw new PlatformError(`${f.label}数值超出允许范围`);
    if (f.type === 'date' && !validDate(v))
      throw new PlatformError(`${f.label}日期无效`);
    if (
      f.type === 'datetime' &&
      (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v) ||
        !Number.isFinite(Date.parse(v)))
    )
      throw new PlatformError(`${f.label}时间无效`);
    if (f.type === 'select' && !f.options?.includes(v))
      throw new PlatformError(`${f.label}选项无效`);
    if (f.type === 'url') {
      try {
        if (new URL(v).protocol !== 'https:') throw new Error();
      } catch {
        throw new PlatformError(`${f.label}须为 HTTPS 原文链接`);
      }
    }
    if (f.type === 'ref') {
      const target =
        pending.find((x) => x.id === v && x.companyId === r.companyId) ||
        (await getRecord(r.companyId, v));
      if (target.kind !== f.ref)
        throw new PlatformError(`${f.label}关联类型不匹配`);
    }
  }
  const d = r.data;
  if (d.startDate && d.endDate && d.endDate < d.startDate)
    throw new PlatformError('结束日期不能早于开始日期');
  if (d.start && d.end && d.end <= d.start)
    throw new PlatformError('结束时间必须晚于开始时间');
  if(r.kind==='video'&&d.audioId&&!await database().prepare("SELECT id FROM treasure_business_files WHERE id=? AND companyId=? AND recordId=? AND mime LIKE 'audio/%'").bind(d.audioId,r.companyId,r.id).first())throw new PlatformError('配乐不属于当前视频业务');
  if (r.kind === 'video' && d.timeline) {
    let scenes: { text: string; seconds: number; assetId: string; start?:number }[];
    try {
      scenes = JSON.parse(d.timeline);
    } catch {
      throw new PlatformError('时间线JSON无效');
    }
    if (!Array.isArray(scenes) || !scenes.length || scenes.length > 30)
      throw new PlatformError('时间线须包含1至30个镜头');
    let total = 0;
    for (const s of scenes) {
      if (
        typeof s.text !== 'string' ||
        s.text.length > 2000 ||
        !Number.isFinite(s.seconds) ||
        s.seconds < 1 ||
        s.seconds > 60 || (s.start!==undefined&&(!Number.isFinite(s.start)||s.start<0||s.start>36000)) ||
        typeof s.assetId !== 'string'
      )
        throw new PlatformError('镜头内容或时长无效');
      total += s.seconds;
      if (
        s.assetId &&
        !(await database()
          .prepare(
            "SELECT id FROM treasure_business_files WHERE id=? AND recordId=? AND companyId=? AND (mime LIKE 'image/%' OR mime LIKE 'video/%')",
          )
          .bind(s.assetId, r.id, r.companyId)
          .first())
      )
        throw new PlatformError('镜头素材不属于当前业务');
    }
    if (total > 300) throw new PlatformError('视频最长300秒');
  }
  if (['contract','order'].includes(r.kind)) { const target=await getRecord(r.companyId,r.kind==='contract'?d.quotationId:d.contractId);if(!['已确认','已归档'].includes(target.status))throw new PlatformError('合同或订单须引用已确认依据');if(cents(d.amount)>cents(target.data.amount))throw new PlatformError('金额超过已确认上游单据，请先确认变更'); }
  if(r.kind==='invoiceRequest'){const bill=await database().prepare("SELECT amountCents FROM treasure_finance_bills WHERE companyId=? AND id=?").bind(r.companyId,d.billId).first<{amountCents:number}>();if(!bill)throw new PlatformError('财务业务单号不属于当前企业');if(cents(d.amount)>bill.amountCents||cents(d.taxAmount)>cents(d.amount))throw new PlatformError('开票申请金额或税额无效');}
  if(r.kind==='taxHandoff'&&!await database().prepare("SELECT id FROM treasure_tax_filings WHERE companyId=? AND id=?").bind(r.companyId,d.filingId).first())throw new PlatformError('申报事项不属于当前企业');
  if (r.kind === 'reading' && Number(d.current) < Number(d.previous))
    throw new PlatformError('期末读数不得小于期初读数，换表须另建计量点');
  if (
    r.kind === 'material' &&
    d.brandColor &&
    !/^#[\da-f]{6}$/i.test(d.brandColor)
  )
    throw new PlatformError('品牌色须为 #RRGGBB 格式');
  if (
    d.milestoneId &&
    d.projectId &&
    (await getRecord(r.companyId, d.milestoneId)).data.projectId !== d.projectId
  )
    throw new PlatformError('里程碑不属于所选项目');
  if (
    d.deliveryId &&
    d.projectId &&
    (await getRecord(r.companyId, d.deliveryId)).data.projectId !== d.projectId
  )
    throw new PlatformError('交付版本不属于所选项目');
  if (
    r.kind === 'quotation' &&
    d.requirementId &&
    !['已确认', '已归档'].includes(
      (await getRecord(r.companyId, d.requirementId)).status,
    )
  )
    throw new PlatformError('报价须引用已确认的需求版本');
  if (
    r.kind === 'project' &&
    d.quotationId &&
    !['已确认', '已归档'].includes(
      (await getRecord(r.companyId, d.quotationId)).status,
    )
  )
    throw new PlatformError('项目须引用已确认报价');
  if (r.kind === 'aiRun') {
    const roles = [d.role1, d.role2, d.role3].filter(Boolean);
    if (new Set(roles).size !== roles.length)
      throw new PlatformError('接力岗位不可重复');
    if (d.role3 && !d.role2) throw new PlatformError('请先配置第二岗位');
  }
  if (r.kind === 'notice' && d.recipients) {
    const ids = [...new Set(d.recipients.split(/[,，\s]+/).filter(Boolean))];
    if (ids.length > 100) throw new PlatformError('单次发文最多 100 家企业');
    for (const id of ids)
      if (
        !(await database()
          .prepare("SELECT id FROM treasure_finance_companies WHERE id=?")
          .bind(id)
          .first())
      )
        throw new PlatformError('接收企业ID不存在');
  }
}
export function insertOp(r: BusinessRecord) {
  return database()
    .prepare(
      "INSERT INTO treasure_business_records(id,companyId,kind,title,owner,dueDate,status,data,version,createdAt,updatedAt) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
    )
    .bind(
      r.id,
      r.companyId,
      r.kind,
      r.title,
      r.owner,
      r.dueDate,
      r.status,
      JSON.stringify(r.data),
      r.version,
      r.createdAt,
      r.updatedAt,
    );
}
export function relationOps(r: BusinessRecord) {
  const db = database();
  return [
    db
      .prepare("DELETE FROM treasure_business_relations WHERE recordId=? AND companyId=?")
      .bind(r.id, r.companyId),
    ...modules[r.kind].fields
      .filter((f) => f.type === 'ref' && r.data[f.key])
      .map((f) =>
        db
          .prepare(
            "INSERT INTO treasure_business_relations(companyId,recordId,field,targetId) VALUES(?,?,?,?)",
          )
          .bind(r.companyId, r.id, f.key, r.data[f.key]),
      ),
  ];
}
export function auditOp(r: BusinessRecord, actor: Actor, action: string) {
  return database()
    .prepare(
      "INSERT INTO treasure_business_history(id,companyId,recordId,actorId,actorName,action,snapshot,createdAt) VALUES(?,?,?,?,?,?,?,?)",
    )
    .bind(
      crypto.randomUUID(),
      r.companyId,
      r.id,
      actor.user.id,
      actor.user.name,
      action,
      JSON.stringify(r),
      r.updatedAt,
    );
}
export async function createRecord(r: BusinessRecord, actor: Actor) {
  checkSensitive(r.kind, actor.role);
  await validate(r);
  await database().batch([
    insertOp(r),
    ...relationOps(r),
    auditOp(r, actor, '录入'),
  ]);
  return r;
}
export function updateOp(r: BusinessRecord, version: string) {
  return database()
    .prepare(
      "UPDATE treasure_business_records SET title=?,owner=?,dueDate=?,status=?,data=?,version=CASE WHEN version=? THEN ? ELSE NULL END,updatedAt=? WHERE id=? AND companyId=?",
    )
    .bind(
      r.title,
      r.owner,
      r.dueDate,
      r.status,
      JSON.stringify(r.data),
      version,
      r.version,
      r.updatedAt,
      r.id,
      r.companyId,
    );
}
export async function updateRecord(
  r: BusinessRecord,
  previous: BusinessRecord,
  actor: Actor,
  action: string,
  extra: MySqlStatement[] = [],
) {
  await validate(r);
  try {
    await database().batch([
      updateOp(r, previous.version),
      ...relationOps(r),
      auditOp(r, actor, action),
      ...extra,
    ]);
  } catch (e) {
    if (String(e).includes('businessRecords.version'))
      throw new PlatformError('记录已更新，请刷新后重试', 409);
    if(String(e).includes('collection_plan_limit'))throw new PlatformError('分期确认金额超过订单金额',409);
    if (String(e).includes('booking_overlap'))
      throw new PlatformError('该空间此时段已有预约', 409);
    if (String(e).includes('lease_overlap'))
      throw new PlatformError('租约与已有租约日期冲突', 409);
    if (String(e).includes('reading_overlap'))
      throw new PlatformError('该计量点已有重叠账期的确认抄表记录', 409);
    if (String(e).includes('receivable_limit'))
      throw new PlatformError('累计应收超过合同及确认增项，操作未写入', 409);
    if (String(e).includes('meter_in_use'))
      throw new PlatformError(
        '该计量点已有确认账单，调整单价或房源请新建计量点',
        409,
      );
    if (String(e).includes('UNIQUE'))
      throw new PlatformError('记录已存在或操作已完成，请刷新核对', 409);
    throw e;
  }
  return r;
}
export async function transition(r: BusinessRecord, to: string, actor: Actor) {
  const spec = modules[r.kind];
  checkSensitive(r.kind, actor.role);
  if (r.kind === 'aiRun')
    throw new PlatformError('请通过接力执行和人工确认推进工作流');
  if (!spec.transitions[r.status]?.includes(to))
    throw new PlatformError('状态流转无效', 409);
  if (
    spec.review?.includes(to) ||
    spec.review?.includes(r.status) ||
    ['已归档', '已终止', '已关闭', '已离职', '已取消'].includes(to)
  )
    requireManager(actor.role);
  const d = r.data;
  if (to === spec.states[0] && spec.review?.includes(r.status)) {
    const linked = await database()
      .prepare(
        "SELECT sourceId AS id FROM treasure_business_automations WHERE sourceId=? UNION ALL SELECT recordId AS id FROM treasure_business_relations WHERE targetId=? LIMIT 1",
      )
      .bind(r.id, r.id)
      .first();
    if (linked)
      throw new PlatformError(
        '该确认版本已被后续业务引用，请复制为新版本后修订',
        409,
      );
  }
  if (
    to === '已确认' &&
    ['requirement', 'quotation', 'change', 'acceptance'].includes(r.kind) &&
    (!d.confirmedBy || !d.confirmationEvidence)
  )
    throw new PlatformError('请先填写客户确认人与确认凭据');
  if (to === '已完成' && ['task', 'service','afterSale'].includes(r.kind) && !d.result)
    throw new PlatformError('请先填写实际处理结果');
  if (r.kind === 'opportunity' && to === '未成交' && !d.lossReason)
    throw new PlatformError('请记录未成交原因');
  if (
    r.kind === 'acceptance' &&
    to === '已确认' &&
    (await getRecord(r.companyId, d.deliveryId)).status !== '已确认'
  )
    throw new PlatformError('交付版本须先经确认');
  if (r.kind === 'project' && to === '已验收') {
    const records = await allRecords(r.companyId);
    if (
      !records.some(
        (x) =>
          x.kind === 'acceptance' &&
          x.data.projectId === r.id &&
          x.status === '已确认',
      )
    )
      throw new PlatformError('尚无通过的验收记录');
    if (
      records.some(
        (x) =>
          ['task', 'milestone'].includes(x.kind) &&
          x.data.projectId === r.id &&
          x.status !== '已完成',
      )
    )
      throw new PlatformError('项目仍有未完成任务或里程碑');
  }
  if (r.kind === 'supplierQuote' && to === '已选定') {
    const purchase = await getRecord(r.companyId, d.purchaseId);
    if (purchase.status !== '已确认')
      throw new PlatformError('采购需求须先审核确认');
  }
  const next = {
    ...r,
    status: to,
    version: crypto.randomUUID(),
    updatedAt: new Date().toISOString(),
  };
  const extra: MySqlStatement[] = [];
  if (r.kind === 'notice' && to === '已确认') {
    requireManager(actor.role);
    const ids = [...new Set(d.recipients.split(/[,，\s]+/).filter(Boolean))];
    for (const id of ids)
      extra.push(
        database()
          .prepare(
            "INSERT INTO treasure_business_notice_inbox(id,companyId,noticeId,senderCompanyId,title,content,status,response,version,createdAt) VALUES(?,?,?,?,?,?,'未读','',?,?) ON DUPLICATE KEY UPDATE title=VALUES(title),content=VALUES(content),status='未读',response='',version=VALUES(version)",
          )
          .bind(
            crypto.randomUUID(),
            id,
            r.id,
            r.companyId,
            r.title,
            d.content,
            crypto.randomUUID(),
            next.updatedAt,
          ),
      );
  }
  return updateRecord(next, r, actor, `状态：${r.status} → ${to}`, extra);
}
/** All generated records and idempotency keys commit in the same D1 transaction. */
export async function automate(
  source: BusinessRecord,
  action: string,
  actor: Actor,
) {
  requireManager(actor.role);
  const db = database();
  const existing = await db
    .prepare(
      "SELECT targetId FROM treasure_business_automations WHERE sourceId=? AND action=? AND companyId=?",
    )
    .bind(source.id, action, source.companyId)
    .first<{ targetId: string }>();
  if (existing) return { id: existing.targetId, replayed: true };
  const d = source.data,
    generated: BusinessRecord[] = [];
  const extra: MySqlStatement[] = [];
  let targetId = '';
  if (action === 'project.fromQuote') {
    if (source.kind !== 'quotation' || source.status !== '已确认')
      throw new PlatformError('请选择已确认报价');
    const requirement = await getRecord(source.companyId, d.requirementId);
    const p = newRecord(
      source.companyId,
      'project',
      source.title,
      source.owner,
      {
        customerId: requirement.data.customerId || '',
        quotationId: source.id,
        scope: d.scope,
        amount: d.amount,
        startDate: today(),
        acceptanceCriteria: requirement.data.acceptanceCriteria,
      },
      source.dueDate,
    );
    generated.push(p);
    targetId = p.id;
    for (const label of ['启动与资料核对', '阶段交付', '验收与移交'])
      generated.push(
        newRecord(
          source.companyId,
          'milestone',
          label,
          source.owner,
          {
            projectId: p.id,
            deliverable: label,
            criteria: '按已确认报价和验收要求核对',
          },
          source.dueDate,
        ),
      );
  } else if (action === 'knowledge.fromReview') {
    if (source.kind !== 'retrospective' || source.status !== '已确认')
      throw new PlatformError('复盘须审核确认后回库');
    const k = newRecord(
      source.companyId,
      'knowledge',
      source.title + ' · 岗位经验',
      source.owner,
      {
        layer: '岗位经验',
        category: '项目复盘',
        content: [d.outcome, d.lessons, d.feedback, d.reusable].join('\n\n'),
        source: `项目复盘 ${source.id} / ${source.version}`,
        projectId: d.projectId,
      },
      source.dueDate,
    );
    generated.push(k);
    targetId = k.id;
  } else if (action === 'tasks.fromTemplate') {
    if (source.kind !== 'project') throw new PlatformError('请选择项目');
    const templates = (await allRecords(source.companyId)).filter(
      (x) => x.kind === 'template' && x.status === '已确认',
    );
    const template =
      templates.find((x) => x.data.industry === '通用') || templates[0];
    if (!template) throw new PlatformError('请先审核一个项目模板');
    const steps = template.data.steps
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 30);
    for (const step of steps)
      generated.push(
        newRecord(
          source.companyId,
          'task',
          step.slice(0, 160),
          source.owner,
          {
            projectId: source.id,
            nextAction: step,
            doneCriteria: template.data.criteria,
            priority: '普通',
          },
          source.dueDate,
        ),
      );
    targetId = source.id;
  } else if (action === 'bill.fromSource') {
    if (
      !['acceptance', 'reading', 'lease', 'supplierQuote', 'change'].includes(
        source.kind,
      ) ||
      (source.kind === 'supplierQuote'
        ? source.status !== '已选定'
        : source.status !== '已确认')
    )
      throw new PlatformError('该业务尚不能生成财务单据');
    let amount = 0,
      counterparty = '',
      kind = 'receivable',
      due = source.dueDate || today();
    if (source.kind === 'acceptance') {
      const p = await getRecord(source.companyId, d.projectId);
      amount = cents(d.amount);
      due = d.paymentDue;
      counterparty = p.data.customerId
        ? (await getRecord(source.companyId, p.data.customerId)).title
        : p.title;
      const records = await allRecords(source.companyId);
      const total =
        cents(p.data.amount) +
        records
          .filter(
            (x) =>
              x.kind === 'change' &&
              x.data.projectId === p.id &&
              x.status === '已确认',
          )
          .reduce((s, x) => s + cents(x.data.amount), 0);
      const prior =
        (
          await db
            .prepare(
              "SELECT COALESCE(SUM(b.amountCents),0) AS total FROM treasure_business_automations a JOIN treasure_business_records r ON r.id=a.sourceId JOIN treasure_finance_bills b ON b.id=a.targetId WHERE a.companyId=? AND a.action='bill.fromSource' AND r.kind IN ('acceptance','change') AND JSON_UNQUOTE(JSON_EXTRACT(r.data,'$.projectId'))=? AND b.status<>'void'",
            )
            .bind(source.companyId, p.id)
            .first<{ total: number }>()
        )?.total || 0;
      if (prior + amount > total)
        throw new PlatformError('累计应收超过合同及已确认变更金额');
    }
    if (source.kind === 'reading') {
      const meter = await getRecord(source.companyId, d.meterId);
      amount = Math.round(
        (Number(d.current) - Number(d.previous)) *
          Number(meter.data.price) *
          100,
      );
      counterparty = d.payer;
    }
    if (source.kind === 'lease') {
      amount = cents(d.rent);
      counterparty = (await getRecord(source.companyId, d.enterpriseId)).title;
    }
    if (source.kind === 'supplierQuote') {
      amount = cents(d.amount);
      counterparty = d.supplier;
      kind = 'payable';
    }
    if (source.kind === 'change') {
      const p = await getRecord(source.companyId, d.projectId);
      amount = cents(d.amount);
      counterparty = p.data.customerId
        ? (await getRecord(source.companyId, p.data.customerId)).title
        : p.title;
    }
    if (amount <= 0 || !Number.isSafeInteger(amount))
      throw new PlatformError('单据金额须大于零');
    targetId = crypto.randomUUID();
    const now = new Date().toISOString();
    extra.push(
      db
        .prepare(
          "INSERT INTO treasure_finance_bills(id,companyId,kind,title,counterparty,category,date,dueDate,amountCents,paidCents,taxBps,invoiceNo,note,status,reviewNote,createdAt,updatedAt,version) VALUES(?,?,?,?,?,?,?,?,?,0,0,'',?,'pending','',?,?,?)",
        )
        .bind(
          targetId,
          source.companyId,
          kind,
          source.title,
          counterparty,
          source.kind === 'lease' ? '空间租赁' : '其他',
          today(),
          due < today() ? today() : due,
          amount,
          `业务来源 ${source.kind} / ${source.id} / ${source.version}。税率尚未核对，请补录票面信息。`,
          now,
          now,
          crypto.randomUUID(),
        ),
      db
        .prepare(
          "INSERT INTO treasure_finance_audit(id,companyId,billId,message,createdAt) VALUES(?,?,?,?,?)",
        )
        .bind(
          crypto.randomUUID(),
          source.companyId,
          targetId,
          `${actor.user.name} 从业务记录创建待审核单据`,
          now,
        ),
    );
  } else throw new PlatformError('自动化动作无效');
  for (const r of generated) {
    await validate(r, generated);
    extra.push(
      insertOp(r),
      ...relationOps(r),
      auditOp(r, actor, `来自 ${source.id}`),
    );
  }
  extra.push(
    db
      .prepare(
        "INSERT INTO treasure_business_automations(companyId,sourceId,action,targetId) VALUES(?,?,?,?)",
      )
      .bind(source.companyId, source.id, action, targetId),
  );
  const updated = {
    ...source,
    version: crypto.randomUUID(),
    updatedAt: new Date().toISOString(),
  };
  await updateRecord(updated, source, actor, `执行 ${action}`, extra);
  return { id: targetId, records: generated };
}
