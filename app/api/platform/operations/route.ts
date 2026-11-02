import type { MySqlStatement } from '@/db/mysql';
import { database } from '@/lib/store';
import {
  body,
  context,
  failure,
  PlatformError,
  reply,
  requireManager,
  str,
} from '@/lib/platform-auth';
import {
  cents,
  getRecord,
  newRecord,
  validate,
  insertOp,
  relationOps,
  auditOp,
  updateRecord,
  today,
} from '@/lib/platform-service';
import type { BusinessRecord } from '@/lib/platform-config';
export async function POST(request: Request) {
  try {
    const b = await body(request),
      companyId = str(b, 'companyId'),
      { user, tenant } = await context(request, companyId, true);
    requireManager(tenant.role);
    const actor = { user, role: tenant.role },
      r = await getRecord(companyId, str(b, 'id'));
    if (r.version !== str(b, 'version'))
      throw new PlatformError('业务版本已更新', 409);
    const action = str(b, 'action'),
      db = database(),
      d = r.data;
    let key = action;
    const generated: BusinessRecord[] = [],
      extra: MySqlStatement[] = [];
    let targetId = '';
    if (action === 'lease.monthBill') {
      const period = str(b, 'period', 7);
      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period))
        throw new PlatformError('租金账期无效');
      key += ':' + period;
    }
    const old = await db
      .prepare(
        "SELECT targetId FROM treasure_business_automations WHERE companyId=? AND sourceId=? AND action=?",
      )
      .bind(companyId, r.id, key)
      .first<{ targetId: string }>();
    if (old) return reply({ id: old.targetId, replayed: true });
    if (!['已确认', '履约中'].includes(r.status))
      throw new PlatformError('请先确认业务版本');
    if (action === 'contract.toOrder' && r.kind === 'contract') {
      const out = newRecord(
        companyId,
        'order',
        r.title + ' · 订单',
        r.owner,
        {
          contractId: r.id,
          customerId: d.customerId,
          scope: d.scope,
          amount: d.amount,
          criteria: d.criteria,
        },
        r.dueDate,
      );
      generated.push(out);
      targetId = out.id;
    } else if (action === 'order.toProject' && r.kind === 'order') {
      const out = newRecord(
        companyId,
        'project',
        r.title + ' · 项目',
        r.owner,
        {
          customerId: d.customerId,
          scope: d.scope,
          amount: d.amount,
          startDate: today(),
          acceptanceCriteria: d.criteria,
        },
        r.dueDate,
      );
      generated.push(out);
      targetId = out.id;
    } else if (action === 'renewal.apply' && r.kind === 'renewal') {
      const previous = await getRecord(companyId, d.leaseId);
      if (d.startDate <= previous.data.endDate)
        throw new PlatformError('续租开始日期须晚于原租约结束日期');
      const out = newRecord(
        companyId,
        'lease',
        previous.title + ' · 续租',
        r.owner,
        {
          spaceId: previous.data.spaceId,
          enterpriseId: previous.data.enterpriseId,
          startDate: d.startDate,
          endDate: d.endDate,
          rent: d.rent,
          deposit: d.deposit,
          contract: d.terms,
        },
        d.endDate,
      );
      generated.push(out);
      targetId = out.id;
    } else if (
      (action === 'collectionPlan.bill' && r.kind === 'collectionPlan') ||
      (action === 'lease.monthBill' && r.kind === 'lease')
    ) {
      let amount = 0,
        payer = '',
        due = r.dueDate,
        title = r.title,
        category = '其他';
      if (r.kind === 'collectionPlan') {
        if (!due) throw new PlatformError('请填写本期到期日期');
        const order = await getRecord(companyId, d.orderId);
        if (!['已确认', '履约中', '已完成'].includes(order.status))
          throw new PlatformError('订单须先审核确认');
        const customer = await getRecord(companyId, order.data.customerId);
        payer = customer.title;
        amount = cents(d.amount);
        const prior = await db
          .prepare(
            "SELECT COALESCE(SUM(f.amountCents),0) AS n FROM treasure_business_automations a JOIN treasure_business_records p ON p.id=a.sourceId JOIN treasure_finance_bills f ON f.id=a.targetId WHERE a.companyId=? AND a.action='collectionPlan.bill' AND p.kind='collectionPlan' AND JSON_UNQUOTE(JSON_EXTRACT(p.data,'$.orderId'))=? AND f.status<>'void'",
          )
          .bind(companyId, order.id)
          .first<{ n: number }>();
        if ((prior?.n || 0) + amount > cents(order.data.amount))
          throw new PlatformError('累计分期应收超过订单金额');
      } else {
        const period = key.split(':').at(-1)!;
        if (period < d.startDate.slice(0, 7) || period > d.endDate.slice(0, 7))
          throw new PlatformError('所选账期不在租约周期内');
        const last = new Date(`${period}-01T00:00:00Z`);
        last.setUTCMonth(last.getUTCMonth() + 1);
        last.setUTCDate(0);
        due = last.toISOString().slice(0, 10);
        amount = cents(str(b, 'amount', 20));
        if (amount <= 0)
          throw new PlatformError('请按该账期约定填写实际租金金额');
        payer = (await getRecord(companyId, d.enterpriseId)).title;
        title = `${r.title} · ${period}租金`;
        category = '空间租赁';
      }
      if (!Number.isSafeInteger(amount) || amount <= 0)
        throw new PlatformError('应收金额须大于零');
      targetId = crypto.randomUUID();
      const now = new Date().toISOString();
      extra.push(
        db
          .prepare(
            "INSERT INTO treasure_finance_bills(id,companyId,kind,title,counterparty,category,date,dueDate,amountCents,paidCents,taxBps,invoiceNo,note,status,reviewNote,createdAt,updatedAt,version) VALUES(?,?,'receivable',?,?,?,?,?,?,0,0,'',?,'pending','',?,?,?)",
          )
          .bind(
            targetId,
            companyId,
            title,
            payer,
            category,
            today(),
            due,
            amount,
            `来源 ${r.id} / ${r.version} / ${key}；金额按约定录入，税额须财务核对。`,
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
            companyId,
            targetId,
            `${user.name} 从${r.kind === 'lease' ? '租约账期' : '订单分期'}生成待审核应收`,
            now,
          ),
      );
    } else throw new PlatformError('业务操作不适用');
    for (const g of generated) {
      await validate(g, generated);
      extra.push(
        insertOp(g),
        ...relationOps(g),
        auditOp(g, actor, `来源 ${r.id} / ${r.version}`),
      );
    }
    extra.push(
      db
        .prepare(
          "INSERT INTO treasure_business_automations(companyId,sourceId,action,targetId) VALUES(?,?,?,?)",
        )
        .bind(companyId, r.id, key, targetId),
    );
    await updateRecord(
      {
        ...r,
        version: crypto.randomUUID(),
        updatedAt: new Date().toISOString(),
      },
      r,
      actor,
      `执行 ${key}`,
      extra,
    );
    return reply({ id: targetId, records: generated });
  } catch (e) {
    if (String(e).includes('collection_plan_limit'))
      return failure(new PlatformError('分期计划或累计应收超过订单金额', 409));
    return failure(e);
  }
}
