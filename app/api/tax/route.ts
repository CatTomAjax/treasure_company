import type { MySqlStatement } from '@/db/mysql';
import { protectLegacy } from '@/lib/platform-auth';
import { database } from '@/lib/store';
import { invoiceTax, toCents, type FinanceEntry } from '@/lib/finance';
import { parkCompany, type FinanceBill } from '@/lib/finance-business';
import {
  invoiceTypes,
  taxTypes,
  deductionStates,
  filingStates,
  type TaxInvoice,
  type TaxFiling,
  type TaxSource,
} from '@/lib/tax';
const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
class Validation extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
const labels: Record<string, string> = {
  invoiceNo: '发票号码',
  counterparty: '往来单位',
  reviewer: '核对人',
  reason: '原因',
  owner: '负责人',
  filingNo: '申报回执号',
  paymentReference: '缴款参考号',
};
function field(
  b: Record<string, unknown>,
  key: string,
  max = 120,
  required = true,
) {
  const v = b[key];
  if (typeof v !== 'string' || v.length > max || (required && !v.trim()))
    throw new Validation(`请检查${labels[key] || key}字段`);
  return v.trim();
}
function date(b: Record<string, unknown>, key: string) {
  const v = field(b, key, 10);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(v) ||
    !Number.isFinite(Date.parse(v)) ||
    new Date(v).toISOString().slice(0, 10) !== v
  )
    throw new Validation('请填写有效日期');
  return v;
}
function cents(v: unknown, zero = false) {
  if (zero && typeof v === 'string' && /^0(?:\.0{1,2})?$/.test(v)) return 0;
  try {
    return toCents(v);
  } catch (e) {
    throw new Validation((e as Error).message);
  }
}
async function requireCompany(id: string) {
  if (
    !(await database()
      .prepare('SELECT id FROM treasure_finance_companies WHERE id=?')
      .bind(id)
      .first())
  )
    throw new Validation('财务账套不存在', 404);
}
async function sources(companyId: string) {
  const db = database();
  const [b, e] = await db.batch([
    db
      .prepare(
        "SELECT * FROM treasure_finance_bills WHERE companyId=? AND status='approved'",
      )
      .bind(companyId),
    db
      .prepare(
        "SELECT * FROM treasure_finance_entries WHERE companyId=? AND status='confirmed' AND paymentId IS NULL",
      )
      .bind(companyId),
  ]);
  return [
    ...(b.results as FinanceBill[]).map((i) => ({
      sourceId: 'bill:' + i.id,
      title: i.title,
      direction: i.kind === 'receivable' ? 'output' : 'input',
      counterparty: i.counterparty,
      date: i.date,
      amountCents: i.amountCents,
      taxCents: invoiceTax(i.amountCents, i.taxBps),
      invoiceNo: i.invoiceNo,
      billId: i.id,
    })),
    ...(e.results as FinanceEntry[]).map((i) => ({
      sourceId: 'entry:' + i.id,
      title: i.category + ' · ' + i.counterparty,
      direction: i.direction === 'income' ? 'output' : 'input',
      counterparty: i.counterparty,
      date: i.date,
      amountCents: i.amountCents,
      taxCents: i.taxCents,
      invoiceNo: i.invoiceNo,
    })),
  ] as TaxSource[];
}
async function legacyGET(request: Request) {
  try {
    const companyId =
      new URL(request.url).searchParams.get('companyId') || parkCompany;
    await requireCompany(companyId);
    const db = database();
    const [companies, invoices, filings, audits] = await db.batch([
      db.prepare('SELECT * FROM treasure_finance_companies ORDER BY createdAt'),
      db
        .prepare(
          "SELECT i.*,d.name AS attachmentName,fd.name AS sourceAttachmentName FROM treasure_tax_invoices i LEFT JOIN treasure_tax_documents d ON d.invoiceId=i.id LEFT JOIN treasure_finance_documents fd ON i.sourceId='bill:'||fd.billId AND fd.companyId=i.companyId WHERE i.companyId=? ORDER BY i.date DESC,i.createdAt DESC",
        )
        .bind(companyId),
      db
        .prepare(
          'SELECT * FROM treasure_tax_filings WHERE companyId=? ORDER BY deadline,status',
        )
        .bind(companyId),
      db
        .prepare(
          "SELECT * FROM treasure_finance_audit WHERE companyId=? AND billId LIKE 'tax:%' ORDER BY createdAt DESC LIMIT 300",
        )
        .bind(companyId),
    ]);
    return json({
      companies: companies.results,
      invoices: invoices.results,
      filings: filings.results,
      sources: await sources(companyId),
      audits: audits.results,
    });
  } catch (e) {
    return json(
      {
        error:
          e instanceof Validation
            ? e.message
            : '税务数据加载失败，请检查数据库迁移',
      },
      e instanceof Validation ? e.status : 503,
    );
  }
}
async function legacyPOST(request: Request) {
  try {
    const origin = request.headers.get('origin');
    if (origin && origin !== new URL(request.url).origin)
      throw new Validation('请求来源无效', 403);
    const raw = await request.text();
    if (raw.length > 1500000) throw new Validation('凭证文件过大', 413);
    let b: Record<string, unknown>;
    try {
      b = JSON.parse(raw);
    } catch {
      throw new Validation('请求格式无效');
    }
    if (!b || typeof b !== 'object' || Array.isArray(b))
      throw new Validation('请求格式无效');
    const companyId =
      typeof b.companyId === 'string' ? b.companyId : parkCompany;
    await requireCompany(companyId);
    const db = database(),
      now = new Date().toISOString(),
      next = crypto.randomUUID();
    const audit = (
      id: string,
      message: string,
      guard?: 'taxInvoices' | 'taxFilings',
    ) =>
      db
        .prepare(
          `INSERT INTO treasure_finance_audit(id,companyId,billId,message,createdAt) SELECT ?,?,?,?,?${guard ? ` WHERE EXISTS(SELECT 1 FROM ${guard === 'taxInvoices' ? 'treasure_tax_invoices' : 'treasure_tax_filings'} WHERE id=? AND version=?)` : ''}`,
        )
        .bind(
          crypto.randomUUID(),
          companyId,
          'tax:' + id,
          message,
          now,
          ...(guard ? [id, next] : []),
        );
    const invoiceFields = async () => {
      const direction = field(b, 'direction', 10),
        polarity = field(b, 'polarity', 10),
        type = field(b, 'type', 30);
      if (
        !['output', 'input'].includes(direction) ||
        !['blue', 'red'].includes(polarity) ||
        !invoiceTypes.includes(type)
      )
        throw new Validation('发票类型无效');
      const amountCents = cents(b.amount),
        taxCents = cents(b.taxAmount, true);
      if (taxCents > amountCents)
        throw new Validation('票面税额不能超过含税金额');
      const originalInvoiceNo = field(b, 'originalInvoiceNo', 80, false),
        invoiceNo = field(b, 'invoiceNo', 80);
      if (
        polarity === 'red' &&
        (!originalInvoiceNo || originalInvoiceNo === invoiceNo)
      )
        throw new Validation('红字票据请填写不同的原发票号码');
      const sourceId = field(b, 'sourceId', 70, false);
      if (
        sourceId &&
        !(await sources(companyId)).some(
          (s) => s.sourceId === sourceId && s.direction === direction,
        )
      )
        throw new Validation('关联财务业务无效或方向不一致');
      return {
        direction,
        polarity,
        type,
        invoiceNo,
        originalInvoiceNo,
        counterparty: field(b, 'counterparty'),
        date: date(b, 'date'),
        amountCents,
        taxCents,
        note: field(b, 'note', 2000, false),
        sourceId,
      };
    };
    const filingFields = () => {
      const taxType = field(b, 'taxType', 40);
      if (!taxTypes.includes(taxType)) throw new Validation('税费项目无效');
      const periodStart = date(b, 'periodStart'),
        periodEnd = date(b, 'periodEnd'),
        deadline = date(b, 'deadline');
      if (periodEnd < periodStart || deadline < periodEnd)
        throw new Validation('所属期或截止日期顺序无效');
      return {
        taxType,
        periodStart,
        periodEnd,
        deadline,
        owner: field(b, 'owner', 80),
        amountCents: cents(b.amount, true),
        note: field(b, 'note', 2000, false),
      };
    };
    if (b.action === 'invoice.create') {
      const f = await invoiceFields(),
        id = crypto.randomUUID();
      await db.batch([
        db
          .prepare(
            "INSERT INTO treasure_tax_invoices(id,companyId,direction,polarity,type,invoiceNo,originalInvoiceNo,counterparty,date,amountCents,taxCents,deduction,status,reviewer,note,sourceId,version,createdAt,updatedAt) VALUES(?,?,?,?,?,?,?,?,?,?,?,'pending','pending','',?,?,?,?,?)",
          )
          .bind(
            id,
            companyId,
            f.direction,
            f.polarity,
            f.type,
            f.invoiceNo,
            f.originalInvoiceNo,
            f.counterparty,
            f.date,
            f.amountCents,
            f.taxCents,
            f.note,
            f.sourceId,
            next,
            now,
            now,
          ),
        audit(id, '登记发票，待核对'),
      ]);
      return json({ id }, 201);
    }
    if (b.action === 'filing.create') {
      const f = filingFields(),
        id = crypto.randomUUID();
      await db.batch([
        db
          .prepare(
            "INSERT INTO treasure_tax_filings(id,companyId,taxType,periodStart,periodEnd,deadline,owner,amountCents,status,note,version,createdAt,updatedAt) VALUES(?,?,?,?,?,?,?,?,'pending',?,?,?,?)",
          )
          .bind(
            id,
            companyId,
            f.taxType,
            f.periodStart,
            f.periodEnd,
            f.deadline,
            f.owner,
            f.amountCents,
            f.note,
            next,
            now,
            now,
          ),
        audit(id, '建立申报跟进事项'),
      ]);
      return json({ id }, 201);
    }
    const id = field(b, 'id', 60),
      version = field(b, 'version', 60);
    let statements: MySqlStatement[] = [];
    if (
      (typeof b.action === 'string' && b.action.startsWith('invoice.')) ||
      b.action === 'attachment.save'
    ) {
      const current = await db
        .prepare(
          'SELECT * FROM treasure_tax_invoices WHERE id=? AND companyId=?',
        )
        .bind(id, companyId)
        .first<TaxInvoice>();
      if (!current) throw new Validation('当前账套没有该发票', 404);
      if (current.version !== version)
        throw new Validation('发票已变化，请刷新后重试', 409);
      if (current.status === 'void')
        throw new Validation('作废发票不能继续修改', 409);
      const update = (sql: string, values: unknown[]) =>
        db
          .prepare(
            `UPDATE treasure_tax_invoices SET ${sql},updatedAt=?,version=? WHERE id=? AND companyId=? AND version=?`,
          )
          .bind(...values, now, next, id, companyId, version);
      if (b.action === 'invoice.edit') {
        const f = await invoiceFields();
        statements = [
          update(
            "direction=?,polarity=?,type=?,invoiceNo=?,originalInvoiceNo=?,counterparty=?,date=?,amountCents=?,taxCents=?,note=?,sourceId=?,status='pending',deduction='pending',reviewer=''",
            [
              f.direction,
              f.polarity,
              f.type,
              f.invoiceNo,
              f.originalInvoiceNo,
              f.counterparty,
              f.date,
              f.amountCents,
              f.taxCents,
              f.note,
              f.sourceId,
            ],
          ),
          audit(id, '修改发票资料，重新核对', 'taxInvoices'),
        ];
      } else if (b.action === 'invoice.review') {
        const status = field(b, 'status', 20);
        if (
          !['verified', 'void'].includes(status) ||
          (status === 'verified' && current.status !== 'pending')
        )
          throw new Validation('发票状态流转无效', 409);
        const reason = field(b, 'reason', 500, false);
        if (status === 'void' && !reason)
          throw new Validation('请填写作废原因');
        const reviewer =
          status === 'verified' ? field(b, 'reviewer', 80) : current.reviewer;
        const deduction =
          current.direction === 'output'
            ? 'excluded'
            : status === 'void'
              ? current.deduction
              : field(b, 'deduction', 20);
        if (!['pending', 'ready', 'excluded'].includes(deduction))
          throw new Validation('进项资料状态无效');
        statements = [
          update('status=?,reviewer=?,deduction=?', [
            status,
            reviewer,
            deduction,
          ]),
          audit(
            id,
            status === 'verified'
              ? `人工核对：${reviewer}；进项资料：${deductionStates[deduction as keyof typeof deductionStates]}`
              : '作废发票：' + reason,
            'taxInvoices',
          ),
        ];
      } else if (b.action === 'attachment.save') {
        const name = field(b, 'name', 180),
          mime = field(b, 'mime', 50),
          data = field(b, 'data', 1100000);
        if (
          !['application/pdf', 'image/png', 'image/jpeg'].includes(mime) ||
          !/^([A-Za-z0-9+/]{4})*([A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
            data,
          ) ||
          data.length > Math.ceil(819200 / 3) * 4
        )
          throw new Validation('请使用 800KB 内的 PDF、PNG 或 JPG');
        const bytes = atob(data);
        if (
          !(
            (mime === 'application/pdf' && bytes.startsWith('%PDF-')) ||
            (mime === 'image/png' && bytes.startsWith('\x89PNG\r\n\x1a\n')) ||
            (mime === 'image/jpeg' && bytes.startsWith('\xff\xd8\xff'))
          )
        )
          throw new Validation('文件内容与类型不符');
        statements = [
          update('note=note', []),
          db
            .prepare(
              'INSERT INTO treasure_tax_documents(invoiceId,companyId,name,mime,data) SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM treasure_tax_invoices WHERE id=? AND version=?) ON DUPLICATE KEY UPDATE name=VALUES(name),mime=VALUES(mime),data=VALUES(data)',
            )
            .bind(id, companyId, name, mime, data, id, next),
          audit(id, '保存原始发票凭证：' + name, 'taxInvoices'),
        ];
      } else throw new Validation('不支持的操作');
    } else {
      const current = await db
        .prepare(
          'SELECT * FROM treasure_tax_filings WHERE id=? AND companyId=?',
        )
        .bind(id, companyId)
        .first<TaxFiling>();
      if (!current) throw new Validation('当前账套没有该申报事项', 404);
      if (current.version !== version)
        throw new Validation('申报事项已变化，请刷新后重试', 409);
      const update = (sql: string, values: unknown[]) =>
        db
          .prepare(
            `UPDATE treasure_tax_filings SET ${sql},updatedAt=?,version=? WHERE id=? AND companyId=? AND version=?`,
          )
          .bind(...values, now, next, id, companyId, version);
      if (b.action === 'filing.edit') {
        if (!['pending', 'prepared'].includes(current.status))
          throw new Validation('已申报事项的金额和所属期不能直接修改', 409);
        const f = filingFields();
        statements = [
          update(
            "taxType=?,periodStart=?,periodEnd=?,deadline=?,owner=?,amountCents=?,note=?,status='pending'",
            [
              f.taxType,
              f.periodStart,
              f.periodEnd,
              f.deadline,
              f.owner,
              f.amountCents,
              f.note,
            ],
          ),
          audit(id, '修改申报事项，重新准备资料', 'taxFilings'),
        ];
      } else if (b.action === 'filing.status') {
        const status = field(b, 'status', 20),
          reason = field(b, 'reason', 500, false);
        if (status === 'prepared' && current.status === 'pending')
          statements = [update("status='prepared'", [])];
        else if (status === 'filed' && current.status === 'prepared') {
          const filedDate = date(b, 'filedDate');
          if (filedDate < current.periodEnd)
            throw new Validation('申报日期不能早于所属期结束');
          statements = [
            update("status='filed',filingNo=?,filedDate=?", [
              field(b, 'filingNo'),
              filedDate,
            ]),
          ];
        } else if (status === 'paid' && current.status === 'filed') {
          const paidDate = date(b, 'paidDate');
          if (paidDate < current.filedDate)
            throw new Validation('缴款日期不能早于申报日期');
          statements = [
            update("status='paid',paymentReference=?,paidDate=?", [
              field(b, 'paymentReference'),
              paidDate,
            ]),
          ];
        } else if (
          status === 'void' &&
          ['pending', 'prepared'].includes(current.status) &&
          reason
        )
          statements = [update("status='void'", [])];
        else
          throw new Validation(
            '状态流转无效；取消须填原因，已申报事项不能取消',
            409,
          );
        statements.push(
          audit(
            id,
            `申报管理状态：${filingStates[status as keyof typeof filingStates]}${reason ? '；' + reason : ''}`,
            'taxFilings',
          ),
        );
      } else throw new Validation('不支持的操作');
    }
    const results = await db.batch(statements);
    if (!results[0].meta.changes)
      throw new Validation('记录已变化，请刷新后重试', 409);
    return json({ id, version: next });
  } catch (e) {
    if (e instanceof Validation) return json({ error: e.message }, e.status);
    if (e instanceof Error && /UNIQUE/.test(e.message))
      return json(
        { error: '发票号码、关联业务或同税费所属期已登记，请核对是否重复' },
        409,
      );
    console.error('Tax operation failed', e);
    return json({ error: '税务记录保存失败，请稍后重试' }, 500);
  }
}

export const GET = protectLegacy(legacyGET, 'finance');
export const POST = protectLegacy(legacyPOST, 'finance');
