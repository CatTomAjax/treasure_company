export type FinanceEntry = {
  id: string; date: string; direction: 'income' | 'expense'; category: string;
  counterparty: string; amountCents: number; taxBps: number; taxCents: number;
  invoiceNo: string; note: string; status: 'pending' | 'confirmed' | 'void';
  createdAt: string; updatedAt: string;
  companyId?:string; accountId?:string|null; paymentId?:string|null;
};
export const financeCategories = ['空间租赁', '物业服务', '企业服务', '活动收入', '设备采购', '水电支出', '维修维护', '办公费用', '其他'];
export const money = (cents: number) => (cents / 100).toLocaleString('zh-CN', {minimumFractionDigits: 2, maximumFractionDigits: 2});
export function toCents(value: unknown) {
  if (typeof value !== 'string' || !/^\d{1,9}(\.\d{1,2})?$/.test(value)) throw new Error('金额须大于 0，最多保留两位小数');
  const [whole, fraction = ''] = value.split('.');
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  if (!Number.isSafeInteger(cents) || cents <= 0) throw new Error('金额须大于 0');
  return cents;
}
export function invoiceTax(amountCents: number, taxBps: number) {
  const denominator = BigInt(10000 + taxBps);
  return Number((BigInt(amountCents) * BigInt(taxBps) + denominator / BigInt(2)) / denominator);
}
export function summarize(entries: FinanceEntry[]) {
  const active = entries.filter(e => e.status !== 'void');
  const confirmed = active.filter(e => e.status === 'confirmed');
  const total = (rows: FinanceEntry[], d: string, field: 'amountCents' | 'taxCents' = 'amountCents') => rows.filter(e => e.direction === d).reduce((n, e) => n + e[field], 0);
  const income = total(confirmed, 'income'), expense = total(confirmed, 'expense');
  const categories = [...new Set(confirmed.map(e => e.category))].map(category => ({category, income: total(confirmed.filter(e => e.category === category), 'income'), expense: total(confirmed.filter(e => e.category === category), 'expense')}));
  return {income, expense, net: income - expense, pending: active.filter(e => e.status === 'pending').length,
    missingInvoices: active.filter(e => !e.invoiceNo).length, incomeTax: total(confirmed, 'income', 'taxCents'), expenseTax: total(confirmed, 'expense', 'taxCents'), count: active.length, categories};
}
export function localFinanceReport(entries: FinanceEntry[], month: string) {
  const s = summarize(entries);
  if (!s.count) return `${month} 暂无有效收支记录。请先登记收支并审核确认，再生成分析。`;
  const top = [...s.categories].sort((a, b) => b.expense - a.expense)[0];
  return `${month} 收支核查\n\n已确认收入：¥${money(s.income)}\n已确认支出：¥${money(s.expense)}\n已确认现金净额：¥${money(s.net)}\n\n待处理事项\n• ${s.pending} 笔收支尚未确认，未计入上方现金汇总。\n• ${s.missingInvoices} 笔记录缺少票据编号，请补齐凭证并人工核验。${top?.expense ? `\n• 支出最高类别为${top.category}：¥${money(top.expense)}，建议复核对应合同、凭证与预算。` : ''}\n\n票面税额口径\n收入票面税额：¥${money(s.incomeTax)}；支出票面税额：¥${money(s.expenseTax)}。仅按录入的含税金额和税率拆分，未判定抵扣资格、适用优惠或申报义务。\n\n本报告由本地规则生成，未调用大模型；现金净额不等同会计利润，正式记账和申报请由财务人员复核。`;
}
export function financeCsv(entries: FinanceEntry[],accounts:{id:string;name:string}[]=[]) {
  const cell = (value: string) => '"' + (/^[\s]*[=+@-]/.test(value) ? "'" + value : value).replaceAll('"', '""') + '"';
  const rows = [['日期', '资金账户','来源','收支', '类别', '往来单位', '含税金额', '税率(%)', '收付拆分税额', '票据编号', '状态', '备注','流水ID'], ...entries.map(e => [e.date,accounts.find(a=>a.id===e.accountId)?.name||'未分配',e.paymentId?'关联单据收付':'手工登记', e.direction === 'income' ? '收入' : '支出', e.category, e.counterparty, (e.amountCents/100).toFixed(2), (e.taxBps/100).toString(), (e.taxCents/100).toFixed(2), e.invoiceNo, {pending:'待确认',confirmed:'已确认',void:'已作废'}[e.status], e.note,e.id])];
  return '\ufeff' + rows.map(row => row.map(cell).join(',')).join('\r\n');
}
