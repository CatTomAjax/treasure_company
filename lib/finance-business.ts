import { money } from './finance';

export const parkCompany = 'park';
export function selectedFinanceCompany(){try{return typeof window==='undefined'?parkCompany:sessionStorage.getItem('finance-company')||parkCompany}catch{return parkCompany}}
export function rememberFinanceCompany(id:string){try{sessionStorage.setItem('finance-company',id)}catch{/* Session storage is optional. */}}
export type FinanceCompany = { id: string; name: string; createdAt: string };
export type FinanceAccount = {
  id: string;
  companyId: string;
  name: string;
  type: string;
  openingCents: number;
  balanceCents: number;
  createdAt: string;
};
export type FinanceBill = {
  id: string;
  companyId: string;
  kind: 'receivable' | 'payable' | 'reimbursement';
  title: string;
  counterparty: string;
  category: string;
  date: string;
  dueDate: string;
  amountCents: number;
  paidCents: number;
  taxBps: number;
  invoiceNo: string;
  note: string;
  status: 'pending' | 'approved' | 'rejected' | 'void';
  reviewNote: string;
  createdAt: string;
  updatedAt: string;
  version: string;
  attachmentName?: string;
};
export type FinancePayment = {
  id: string;
  companyId: string;
  billId: string;
  accountId: string;
  amountCents: number;
  date: string;
  reference: string;
  note: string;
  status: 'posted' | 'reversed';
  createdAt: string;
};
export type FinanceAudit = {
  id: string;
  companyId: string;
  billId: string;
  message: string;
  createdAt: string;
};
export type FinanceBusiness = {
  companies: FinanceCompany[];
  accounts: FinanceAccount[];
  bills: FinanceBill[];
  payments: FinancePayment[];
  audits: FinanceAudit[];
};
export const billKinds = {
  receivable: '应收',
  payable: '应付',
  reimbursement: '报销',
};
export const billStatus = {
  pending: '待审核',
  approved: '已审核',
  rejected: '已退回',
  void: '已作废',
};
export function chinaToday() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}
export function outstanding(b: FinanceBill) {
  return b.status === 'approved' ? b.amountCents - b.paidCents : 0;
}
export function billState(b: FinanceBill) {
  return b.status !== 'approved'
    ? billStatus[b.status]
    : b.paidCents === b.amountCents
      ? '已结清'
      : b.paidCents > 0
        ? '部分收付'
        : '待收付';
}
export function overdue(b: FinanceBill) {
  return outstanding(b) > 0 && b.dueDate < chinaToday();
}
export function csv(rows: (string | number)[][]) {
  const cell = (v: string | number) => {
    const s = String(v);
    return (
      '"' + (typeof v==='string'&&/^[\s]*[=+@-]/.test(s) ? "'" + s : s).replaceAll('"', '""') + '"'
    );
  };
  return '\ufeff' + rows.map((r) => r.map(cell).join(',')).join('\r\n');
}
export function billsCsv(bills: FinanceBill[]) {
  return csv([
    [
      '类型',
      '业务日期',
      '到期日期',
      '单据名称',
      '往来单位/申请人',
      '类别',
      '金额(元)',
      '已收付(元)',
      '未收付(元)',
      '票据编号',
      '状态',
      '备注',
    ],
    ...bills.map((b) => [
      billKinds[b.kind],
      b.date,
      b.dueDate,
      b.title,
      b.counterparty,
      b.category,
      (b.amountCents / 100).toFixed(2),
      (b.paidCents / 100).toFixed(2),
      ((b.amountCents - b.paidCents) / 100).toFixed(2),
      b.invoiceNo,
      billState(b),
      b.note,
    ]),
  ]);
}
export function downloadCsv(content: string, name: string) {
  const u = URL.createObjectURL(
    new Blob([content], { type: 'text/csv;charset=utf-8' }),
  );
  const a = document.createElement('a');
  a.href = u;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(u), 1000);
}
export const yuan = (n: number) => '¥ ' + money(n);
