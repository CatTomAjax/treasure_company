import { csv, chinaToday, type FinanceCompany } from './finance-business';
export type TaxInvoice = {
  id: string;
  companyId: string;
  direction: 'output' | 'input';
  polarity: 'blue' | 'red';
  type: string;
  invoiceNo: string;
  originalInvoiceNo: string;
  counterparty: string;
  date: string;
  amountCents: number;
  taxCents: number;
  deduction: 'pending' | 'ready' | 'excluded';
  status: 'pending' | 'verified' | 'void';
  reviewer: string;
  note: string;
  sourceId: string;
  version: string;
  createdAt: string;
  updatedAt: string;
  attachmentName?: string;
  sourceAttachmentName?:string;
};
export type TaxFiling = {
  id: string;
  companyId: string;
  taxType: string;
  periodStart: string;
  periodEnd: string;
  deadline: string;
  owner: string;
  amountCents: number;
  status: 'pending' | 'prepared' | 'filed' | 'paid' | 'void';
  filingNo: string;
  filedDate: string;
  paymentReference: string;
  paidDate: string;
  note: string;
  version: string;
  createdAt: string;
  updatedAt: string;
};
export type TaxSource = {
  sourceId: string;
  title: string;
  direction: 'output' | 'input';
  counterparty: string;
  date: string;
  amountCents: number;
  taxCents: number;
  invoiceNo: string;
  billId?: string;
};
export type TaxData = {
  companies: FinanceCompany[];
  invoices: TaxInvoice[];
  filings: TaxFiling[];
  sources: TaxSource[];
  audits: { id: string; billId: string; message: string; createdAt: string }[];
};
export const invoiceTypes = ['增值税专用发票', '普通发票', '其他凭证'];
export const taxTypes = [
  '增值税及附加',
  '企业所得税',
  '个人所得税',
  '其他税费',
];
export const invoiceStates = {
  pending: '待核对',
  verified: '已核对',
  void: '已作废',
};
export const deductionStates = {
  pending: '待核验',
  ready: '已确认纳入',
  excluded: '不纳入',
};
export const filingStates = {
  pending: '待准备',
  prepared: '资料齐备',
  filed: '已申报',
  paid: '已缴税',
  void: '已取消',
};
export function taxSummary(invoices: TaxInvoice[], month: string) {
  const list = invoices.filter(
    (i) => i.date.startsWith(month) && i.status !== 'void',
  );
  const verified = list.filter((i) => i.status === 'verified');
  const total = (rows: TaxInvoice[]) =>
    rows.reduce((n, i) => n + i.taxCents * (i.polarity === 'red' ? -1 : 1), 0);
  return {
    output: total(verified.filter((i) => i.direction === 'output')),
    input: total(verified.filter((i) => i.direction === 'input')),
    ready: total(
      verified.filter(
        (i) => i.direction === 'input' && i.deduction === 'ready',
      ),
    ),
    pending: list.filter(
      (i) =>
        i.status === 'pending' ||
        (i.direction === 'input' && i.deduction === 'pending'),
    ).length,
  };
}
export function filingOpen(f: TaxFiling) {
  return (
    !['paid', 'void'].includes(f.status) &&
    !(f.status === 'filed' && f.amountCents === 0)
  );
}
export function filingLate(f: TaxFiling) {
  return filingOpen(f) && f.deadline < chinaToday();
}
export function invoiceCsv(list: TaxInvoice[]) {
  return csv([
    [
      '开票日期',
      '类型',
      '票据种类',
      '红蓝字',
      '发票号码',
      '原发票号码',
      '往来单位',
      '含税金额(元)',
      '不含税金额(元)',
      '票面税额(元)',
      '核对状态',
      '进项资料状态',
      '核对人',
      '备注',
    ],
    ...list.map((i) => [
      i.date,
      i.direction === 'output' ? '销项' : '进项',
      i.type,
      i.polarity === 'red' ? '红字' : '蓝字',
      i.invoiceNo,
      i.originalInvoiceNo,
      i.counterparty,
      (i.amountCents / 100)*(i.polarity==='red'?-1:1),
      ((i.amountCents - i.taxCents) / 100)*(i.polarity==='red'?-1:1),
      (i.taxCents / 100)*(i.polarity==='red'?-1:1),
      invoiceStates[i.status],
      i.direction === 'input' ? deductionStates[i.deduction] : '—',
      i.reviewer,
      i.note,
    ]),
  ]);
}
export function filingCsv(list: TaxFiling[]) {
  return csv([
    [
      '税费项目',
      '所属期起',
      '所属期止',
      '截止日期',
      '负责人',
      '申报金额(元)',
      '状态',
      '申报回执号',
      '申报日期',
      '缴款参考号',
      '缴款日期',
      '备注',
    ],
    ...list.map((f) => [
      f.taxType,
      f.periodStart,
      f.periodEnd,
      f.deadline,
      f.owner,
      (f.amountCents / 100).toFixed(2),
      filingStates[f.status],
      f.filingNo,
      f.filedDate,
      f.paymentReference,
      f.paidDate,
      f.note,
    ]),
  ]);
}
export function filingCalendar(list: TaxFiling[]) {
  const fold=(line:string)=>{let result='',width=0;for(const character of line){const bytes=new TextEncoder().encode(character).length;if(width+bytes>75){result+='\r\n ';width=1}result+=character;width+=bytes}return result};
  const escape = (s: string) =>
    s
      .replaceAll('\\', '\\\\')
      .replaceAll('\n', '\\n')
      .replaceAll(',', '\\,')
      .replaceAll(';', '\\;');
  return (
    [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Qianhai//Tax Management//ZH',
      'CALSCALE:GREGORIAN',
      ...list
        .filter(filingOpen)
        .flatMap((f) => [
          'BEGIN:VEVENT',
          `UID:${f.id}@qianhai-local`,
          `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').split('.')[0]}Z`,
          `DTSTART;VALUE=DATE:${f.deadline.replaceAll('-', '')}`,
          `DTEND;VALUE=DATE:${new Date(Date.parse(f.deadline) + 86400000).toISOString().slice(0, 10).replaceAll('-', '')}`,
          `SUMMARY:${escape(f.taxType + '申报 / 缴款截止')}`,
          `DESCRIPTION:${escape(`所属期 ${f.periodStart} 至 ${f.periodEnd}；负责人 ${f.owner}；按录入截止日期跟进。`)}`,
          'END:VEVENT',
        ]),
      'END:VCALENDAR',
    ].map(fold).join('\r\n') + '\r\n'
  );
}
