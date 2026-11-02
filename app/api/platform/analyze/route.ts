import {
  body,
  context,
  failure,
  reply,
  requireManager,
  str,
} from '@/lib/platform-auth';
import { allRecords, cents } from '@/lib/platform-service';
import { database } from '@/lib/store';
export async function POST(request: Request) {
  try {
    const b = await body(request, 4000),
      companyId = str(b, 'companyId'),
      { tenant } = await context(request, companyId),
      question = str(b, 'question', 500),
      records = await allRecords(companyId);
    let answer = '',
      sources: string[] = [];
    const format = (v: number) =>
      new Intl.NumberFormat('zh-CN', {
        style: 'currency',
        currency: 'CNY',
      }).format(v / 100);
    if (/利润|毛利|成本|收入|回款|资金|应收|应付/.test(question)) {
      requireManager(tenant.role);
      const bills = (
        await database()
          .prepare(
            "SELECT id,kind,amountCents,paidCents FROM treasure_finance_bills WHERE companyId=? AND status='approved'",
          )
          .bind(companyId)
          .all<{
            id: string;
            kind: string;
            amountCents: number;
            paidCents: number;
          }>()
      ).results;
      const actual = records.filter(
          (r) =>
            r.kind === 'cost' &&
            r.status === '已确认' &&
            r.data.basis === '实际',
        ),
        estimated = records.filter(
          (r) =>
            r.kind === 'cost' &&
            r.status === '已确认' &&
            r.data.basis === '估算',
        ),
        unknown = records.filter(
          (r) =>
            r.kind === 'cost' &&
            r.status === '已确认' &&
            r.data.basis === '未知',
        );
      answer = `本企业已审核应收余额 ${format(bills.filter((b) => b.kind === 'receivable').reduce((s, b) => s + b.amountCents - b.paidCents, 0))}；已审核应付/报销余额 ${format(bills.filter((b) => b.kind !== 'receivable').reduce((s, b) => s + b.amountCents - b.paidCents, 0))}。\n已确认项目实际成本 ${format(actual.reduce((s, r) => s + cents(r.data.amount), 0))}，估算成本 ${format(estimated.reduce((s, r) => s + cents(r.data.amount), 0))}，未知成本 ${unknown.length} 项。\n金额只反映当前录入和审核记录，不能据此把应收当作到账或认定完整会计利润。`;
      sources = [
        ...bills.map((b) => b.id),
        ...actual.map((r) => r.id),
        ...estimated.map((r) => r.id),
        ...unknown.map((r) => r.id),
      ];
    } else if (/客户|商机|成交|报价/.test(question)) {
      const opp = records.filter((r) => r.kind === 'opportunity');
      answer = `客户 ${records.filter((r) => r.kind === 'customer').length} 个，商机 ${opp.length} 个。\n已验证 ${opp.filter((r) => r.status === '已验证').length}，方案沟通 ${opp.filter((r) => r.status === '方案沟通').length}，已成交 ${opp.filter((r) => r.status === '已成交').length}，未成交 ${opp.filter((r) => r.status === '未成交').length}。\n这是当前阶段分布；有效商机推进率须结合相同观察批次和阶段历史核对。`;
      sources = opp.map((r) => r.id);
    } else if (/知识|引用|AI|岗位/.test(question)) {
      const steps = (
        await database()
          .prepare(
            "SELECT id,inputTokens,outputTokens,sources FROM treasure_business_ai_steps WHERE companyId=?",
          )
          .bind(companyId)
          .all<{
            id: string;
            inputTokens: number;
            outputTokens: number;
            sources: string;
          }>()
      ).results;
      answer = `已确认知识 ${records.filter((r) => r.kind === 'knowledge' && r.status === '已确认').length} 条；岗位执行 ${steps.length} 步；知识引用 ${steps.reduce((s, x) => s + JSON.parse(x.sources).length, 0)} 次。\n输入 ${steps.reduce((s, x) => s + x.inputTokens, 0)} token，输出 ${steps.reduce((s, x) => s + x.outputTokens, 0)} token。费用以供应商账户实际计价为准。`;
      sources = steps.map((s) => s.id);
    } else if (/项目|交付|任务|逾期|验收/.test(question)) {
      const tasks = records.filter((r) => r.kind === 'task'),
        projects = records.filter((r) => r.kind === 'project');
      answer = `项目 ${projects.length} 个，责任任务 ${tasks.length} 个；任务待处理 ${tasks.filter((r) => r.status === '待处理').length}，处理中 ${tasks.filter((r) => r.status === '处理中').length}，待确认 ${tasks.filter((r) => r.status === '待确认').length}，已完成 ${tasks.filter((r) => r.status === '已完成').length}。\n已确认验收记录 ${records.filter((r) => r.kind === 'acceptance' && r.status === '已确认').length} 条。`;
      sources = [...projects, ...tasks].map((r) => r.id);
    } else
      answer =
        '当前规则查询支持：项目交付、任务状态、客户商机、报价、项目成本、应收应付及知识岗位使用。请在问题中说明希望查看的业务指标。';
    return reply({
      answer,
      sources: sources.slice(0, 80),
      mode: '当前企业实际数据 · 固定口径规则查询',
    });
  } catch (e) {
    return failure(e);
  }
}
