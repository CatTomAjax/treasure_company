import type { MySqlStatement } from '@/db/mysql';
import { protectLegacy } from '@/lib/platform-auth';
import { database } from '@/lib/store';
import { financeCategories, invoiceTax, toCents } from '@/lib/finance';
import {
  billKinds,
  parkCompany,
  type FinanceBill,
} from '@/lib/finance-business';

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
function text(
  b: Record<string, unknown>,
  k: string,
  max = 120,
  required = true,
) {
  const v = b[k];
  if (typeof v !== 'string' || v.length > max || (required && !v.trim()))
    throw new Validation(`请检查${k}字段`);
  return v.trim();
}
function date(b: Record<string, unknown>, k: string) {
  const v = text(b, k, 10);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(v) ||
    !Number.isFinite(Date.parse(v)) ||
    new Date(v).toISOString().slice(0, 10) !== v
  )
    throw new Validation('请填写有效日期');
  return v;
}
function amount(v: unknown) {
  try {
    return toCents(v);
  } catch (e) {
    throw new Validation((e as Error).message);
  }
}
function rate(v: unknown) {
  if (
    typeof v !== 'string' ||
    !/^\d{1,3}(\.\d{1,2})?$/.test(v) ||
    Number(v) > 100
  )
    throw new Validation('票面税率须为 0 至 100，最多两位小数');
  return Math.round(Number(v) * 100);
}
async function company(id: string) {
  if (
    !(await database()
      .prepare('SELECT id FROM treasure_finance_companies WHERE id=?')
      .bind(id)
      .first())
  )
    throw new Validation('账套不存在', 404);
}
const audit = (companyId: string, billId: string, message: string) =>
  database()
    .prepare(
      'INSERT INTO treasure_finance_audit(id,companyId,billId,message,createdAt) VALUES(?,?,?,?,?)',
    )
    .bind(
      crypto.randomUUID(),
      companyId,
      billId,
      message,
      new Date().toISOString(),
    );
function billFields(b: Record<string, unknown>) {
  const kind = text(b, 'kind', 20);
  if (!Object.hasOwn(billKinds, kind)) throw new Validation('单据类型无效');
  const category = text(b, 'category', 30);
  if (!financeCategories.includes(category))
    throw new Validation('业务类别无效');
  const businessDate = date(b, 'date'),
    due = date(b, 'dueDate');
  if (due < businessDate) throw new Validation('到期日期不能早于业务日期');
  return {
    kind,
    title: text(b, 'title'),
    counterparty: text(b, 'counterparty'),
    category,
    date: businessDate,
    dueDate: due,
    amountCents: amount(b.amount),
    taxBps: rate(b.taxRate),
    invoiceNo: text(b, 'invoiceNo', 80, false),
    note: text(b, 'note', 2000, false),
  };
}
async function legacyGET(request: Request) {
  try {
    const id =
      new URL(request.url).searchParams.get('companyId') || parkCompany;
    await company(id);
    const db = database();
    const results = await db.batch([
      db.prepare('SELECT * FROM treasure_finance_companies ORDER BY createdAt'),
      db
        .prepare(
          "SELECT a.*,a.openingCents+COALESCE(SUM(CASE WHEN e.status='confirmed' THEN CASE WHEN e.direction='income' THEN e.amountCents ELSE -e.amountCents END ELSE 0 END),0) AS balanceCents FROM treasure_finance_accounts a LEFT JOIN treasure_finance_entries e ON e.accountId=a.id AND e.companyId=a.companyId WHERE a.companyId=? GROUP BY a.id ORDER BY a.createdAt",
        )
        .bind(id),
      db
        .prepare(
          'SELECT b.*,d.name AS attachmentName FROM treasure_finance_bills b LEFT JOIN treasure_finance_documents d ON d.billId=b.id WHERE b.companyId=? ORDER BY b.date DESC,b.createdAt DESC',
        )
        .bind(id),
      db
        .prepare(
          'SELECT * FROM treasure_finance_payments WHERE companyId=? ORDER BY createdAt DESC',
        )
        .bind(id),
      db
        .prepare(
          'SELECT * FROM treasure_finance_audit WHERE companyId=? ORDER BY createdAt DESC LIMIT 500',
        )
        .bind(id),
    ]);
    return json({
      companies: results[0].results,
      accounts: results[1].results,
      bills: results[2].results,
      payments: results[3].results,
      audits: results[4].results,
    });
  } catch (e) {
    return json(
      {
        error:
          e instanceof Validation
            ? e.message
            : '财务数据加载失败，请检查数据库迁移',
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
    if (raw.length > 1500000)
      throw new Validation('凭证文件过大，请使用小于 800KB 的 PDF 或图片', 413);
    let b: Record<string, unknown>;
    try {
      b = JSON.parse(raw);
    } catch {
      throw new Validation('请求格式无效');
    }
    if (!b || typeof b !== 'object' || Array.isArray(b))
      throw new Validation('请求格式无效');
    const db = database(),
      now = new Date().toISOString();
    if (b.action === 'company.create') {
      const id = crypto.randomUUID(),
        name = text(b, 'name');
      await db
        .prepare('INSERT INTO treasure_finance_companies VALUES(?,?,?)')
        .bind(id, name, now)
        .run();
      return json({ id }, 201);
    }
    const companyId =
      typeof b.companyId === 'string' ? b.companyId : parkCompany;
    await company(companyId);
    if (b.action === 'account.create') {
      const name = text(b, 'name', 80),
        type = text(b, 'type', 20);
      if (!['银行账户', '现金', '微信 / 支付宝', '其他'].includes(type))
        throw new Validation('账户类型无效');
      let openingCents = 0;
      if (b.opening !== '0' && b.opening !== '0.00') {
        const negative =
          typeof b.opening === 'string' && b.opening.startsWith('-');
        openingCents =
          amount(negative ? (b.opening as string).slice(1) : b.opening) *
          (negative ? -1 : 1);
      }
      const id = crypto.randomUUID();
      await db.batch([
        db
          .prepare(
            'INSERT INTO treasure_finance_accounts(id,companyId,name,type,openingCents,createdAt) VALUES(?,?,?,?,?,?)',
          )
          .bind(id, companyId, name, type, openingCents, now),
        audit(
          companyId,
          '',
          `建立资金账户「${name}」，期初余额 ${(openingCents / 100).toFixed(2)} 元`,
        ),
      ]);
      return json({ id }, 201);
    }
    if (b.action === 'bill.create') {
      const f = billFields(b),
        id = crypto.randomUUID();
      await db.batch([
        db
          .prepare(
            'INSERT INTO treasure_finance_bills(id,companyId,kind,title,counterparty,category,date,dueDate,amountCents,taxBps,invoiceNo,note,status,createdAt,updatedAt,version) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
          )
          .bind(
            id,
            companyId,
            f.kind,
            f.title,
            f.counterparty,
            f.category,
            f.date,
            f.dueDate,
            f.amountCents,
            f.taxBps,
            f.invoiceNo,
            f.note,
            'pending',
            now,
            now,
            crypto.randomUUID(),
          ),
        audit(companyId, id, '提交单据，待审核'),
      ]);
      return json({ id }, 201);
    }
    const id = text(b, 'id', 60),
      current = await db
        .prepare(
          'SELECT * FROM treasure_finance_bills WHERE id=? AND companyId=?',
        )
        .bind(id, companyId)
        .first<FinanceBill>();
    if (!current) throw new Validation('当前账套中没有该单据', 404);
    const previous = text(b, 'version', 60);
    if (previous !== current.version)
      throw new Validation('单据已变化，请刷新后重试', 409);
    const next = crypto.randomUUID();
    const guardedAudit = (message: string) =>
      db
        .prepare(
          'INSERT INTO treasure_finance_audit(id,companyId,billId,message,createdAt) SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM treasure_finance_bills WHERE id=? AND version=?)',
        )
        .bind(crypto.randomUUID(), companyId, id, message, now, id, next);
    let statements: MySqlStatement[] = [];
    if (b.action === 'bill.edit') {
      if (!['pending', 'rejected'].includes(current.status))
        throw new Validation('仅待审核或退回单据可以编辑', 409);
      const f = billFields(b);
      statements = [
        db
          .prepare(
            "UPDATE treasure_finance_bills SET kind=?,title=?,counterparty=?,category=?,date=?,dueDate=?,amountCents=?,taxBps=?,invoiceNo=?,note=?,status='pending',reviewNote='',updatedAt=?,version=? WHERE id=? AND companyId=? AND version=?",
          )
          .bind(
            f.kind,
            f.title,
            f.counterparty,
            f.category,
            f.date,
            f.dueDate,
            f.amountCents,
            f.taxBps,
            f.invoiceNo,
            f.note,
            now,
            next,
            id,
            companyId,
            previous,
          ),
        guardedAudit('修改资料并重新提交审核'),
      ];
    } else if (b.action === 'bill.voucher') {
      if (current.status === 'void')
        throw new Validation('作废单据不能修改凭证', 409);
      const invoiceNo = text(b, 'invoiceNo', 80, false),
        note = text(b, 'note', 2000, false);
      statements = [
        db
          .prepare(
            'UPDATE treasure_finance_bills SET invoiceNo=?,note=?,updatedAt=?,version=? WHERE id=? AND companyId=? AND version=?',
          )
          .bind(invoiceNo, note, now, next, id, companyId, previous),
        db
          .prepare(
            'UPDATE treasure_finance_entries SET invoiceNo=?,updatedAt=? WHERE paymentId IN (SELECT id FROM treasure_finance_payments WHERE billId=?) AND EXISTS(SELECT 1 FROM treasure_finance_bills WHERE id=? AND version=?)',
          )
          .bind(invoiceNo, now, id, id, next),
        guardedAudit('补充票据编号与业务说明'),
      ];
    } else if (b.action === 'bill.review') {
      const status = text(b, 'status', 20),
        reason = text(b, 'reason', 500, false);
      if (
        !(
          (current.status === 'pending' &&
            ['approved', 'rejected'].includes(status)) ||
          (current.status !== 'void' &&
            current.paidCents === 0 &&
            status === 'void')
        )
      )
        throw new Validation('状态流转无效，已收付单据须先冲销', 409);
      if ((status === 'rejected' || status === 'void') && !reason)
        throw new Validation('请填写退回或作废原因');
      statements = [
        db
          .prepare(
            'UPDATE treasure_finance_bills SET status=?,reviewNote=?,updatedAt=?,version=? WHERE id=? AND companyId=? AND version=?',
          )
          .bind(status, reason, now, next, id, companyId, previous),
        guardedAudit(
          `${{ approved: '审核通过', rejected: '退回修改', void: '作废单据' }[status]}${reason ? '：' + reason : ''}`,
        ),
      ];
    } else if (b.action === 'payment.create') {
      if (current.status !== 'approved')
        throw new Validation('审核通过后才能登记收付款', 409);
      const cents = amount(b.amount);
      if (cents > current.amountCents - current.paidCents)
        throw new Validation('收付款金额超过剩余未收付金额');
      const accountId = text(b, 'accountId', 60);
      if (
        !(await db
          .prepare(
            'SELECT id FROM treasure_finance_accounts WHERE id=? AND companyId=?',
          )
          .bind(accountId, companyId)
          .first())
      )
        throw new Validation('请选择当前账套的资金账户');
      const paymentDate = date(b, 'date');
      if (paymentDate < current.date)
        throw new Validation('收付款日期不能早于业务日期');
      const reference = text(b, 'reference', 120, false),
        note = text(b, 'note', 2000, false),
        paymentId = crypto.randomUUID(),
        entryId = crypto.randomUUID();
      const direction = current.kind === 'receivable' ? 'income' : 'expense';
      statements = [
        db
          .prepare(
            "UPDATE treasure_finance_bills SET paidCents=paidCents+?,updatedAt=?,version=? WHERE id=? AND companyId=? AND version=? AND status='approved' AND amountCents-paidCents>=?",
          )
          .bind(cents, now, next, id, companyId, previous, cents),
        db
          .prepare(
            "INSERT INTO treasure_finance_payments(id,companyId,billId,accountId,amountCents,date,reference,note,status,createdAt) SELECT ?,?,?,?,?,?,?,?,'posted',? WHERE EXISTS(SELECT 1 FROM treasure_finance_bills WHERE id=? AND version=?)",
          )
          .bind(
            paymentId,
            companyId,
            id,
            accountId,
            cents,
            paymentDate,
            reference,
            note,
            now,
            id,
            next,
          ),
        db
          .prepare(
            "INSERT INTO treasure_finance_entries(id,date,direction,category,counterparty,amountCents,taxBps,taxCents,invoiceNo,note,status,createdAt,updatedAt,companyId,accountId,paymentId) SELECT ?,?,?,?,?,?,?,?,?,?,'confirmed',?,?,?,?,? WHERE EXISTS(SELECT 1 FROM treasure_finance_bills WHERE id=? AND version=?)",
          )
          .bind(
            entryId,
            paymentDate,
            direction,
            current.category,
            current.counterparty,
            cents,
            current.taxBps,
            invoiceTax(cents, current.taxBps),
            current.invoiceNo,
            `${current.title} · ${reference || '手工收付登记'}${note ? ' · ' + note : ''}`,
            now,
            now,
            companyId,
            accountId,
            paymentId,
            id,
            next,
          ),
        guardedAudit(
          `登记${direction === 'income' ? '收款' : '付款'} ${(cents / 100).toFixed(2)} 元${reference ? '，参考号 ' + reference : ''}`,
        ),
      ];
    } else if (b.action === 'payment.reverse') {
      const paymentId = text(b, 'paymentId', 60),
        reason = text(b, 'reason', 500);
      const payment = await db
        .prepare(
          "SELECT * FROM treasure_finance_payments WHERE id=? AND companyId=? AND billId=? AND status='posted'",
        )
        .bind(paymentId, companyId, id)
        .first<{ amountCents: number }>();
      if (!payment) throw new Validation('收付款记录不存在或已冲销', 409);
      statements = [
        db
          .prepare(
            'UPDATE treasure_finance_bills SET paidCents=paidCents-?,updatedAt=?,version=? WHERE id=? AND companyId=? AND version=? AND paidCents>=?',
          )
          .bind(
            payment.amountCents,
            now,
            next,
            id,
            companyId,
            previous,
            payment.amountCents,
          ),
        db
          .prepare(
            "UPDATE treasure_finance_payments SET status='reversed' WHERE id=? AND EXISTS(SELECT 1 FROM treasure_finance_bills WHERE id=? AND version=?)",
          )
          .bind(paymentId, id, next),
        db
          .prepare(
            "UPDATE treasure_finance_entries SET status='void',updatedAt=? WHERE paymentId=? AND companyId=? AND EXISTS(SELECT 1 FROM treasure_finance_bills WHERE id=? AND version=?)",
          )
          .bind(now, paymentId, companyId, id, next),
        guardedAudit(
          `冲销 ${(payment.amountCents / 100).toFixed(2)} 元：${reason}`,
        ),
      ];
    } else if (b.action === 'attachment.save') {
      if (current.status === 'void')
        throw new Validation('作废单据不能补凭证', 409);
      const name = text(b, 'name', 180),
        mime = text(b, 'mime', 50),
        data = text(b, 'data', 1100000);
      if (
        !['application/pdf', 'image/png', 'image/jpeg'].includes(mime) ||
        !/^([A-Za-z0-9+/]{4})*([A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
          data,
        ) ||
        data.length > Math.ceil(819200 / 3) * 4
      )
        throw new Validation('请使用小于 800KB 的 PDF、PNG 或 JPG');
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
        db
          .prepare(
            'UPDATE treasure_finance_bills SET updatedAt=?,version=? WHERE id=? AND companyId=? AND version=?',
          )
          .bind(now, next, id, companyId, previous),
        db
          .prepare(
            'INSERT INTO treasure_finance_documents(billId,companyId,name,mime,data) SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM treasure_finance_bills WHERE id=? AND version=?) ON DUPLICATE KEY UPDATE name=VALUES(name),mime=VALUES(mime),data=VALUES(data)',
          )
          .bind(id, companyId, name, mime, data, id, next),
        guardedAudit(`保存原始凭证「${name}」`),
      ];
    } else throw new Validation('不支持的操作');
    if (b.action === 'payment.create' || b.action === 'payment.reverse') {
      const denominator = 10000 + current.taxBps,
        half = Math.floor(denominator / 2);
      statements.splice(
        statements.length - 1,
        0,
        db
          .prepare(
            "WITH amounts AS (SELECT id,amountCents,SUM(amountCents) OVER (ORDER BY createdAt,id) AS cumulative FROM treasure_finance_payments WHERE billId=? AND status='posted'), taxes AS (SELECT id,TRUNCATE((cumulative*?+?)/?,0)-TRUNCATE(((cumulative-amountCents)*?+?)/?,0) AS allocated FROM amounts) UPDATE treasure_finance_entries SET taxCents=(SELECT allocated FROM taxes WHERE taxes.id=treasure_finance_entries.paymentId) WHERE paymentId IN (SELECT id FROM taxes) AND companyId=? AND EXISTS(SELECT 1 FROM treasure_finance_bills WHERE id=? AND version=?)",
          )
          .bind(
            id,
            current.taxBps,
            half,
            denominator,
            current.taxBps,
            half,
            denominator,
            companyId,
            id,
            next,
          ),
      );
    }
    const results = await db.batch(statements);
    if (!results[0].meta.changes)
      throw new Validation('单据已变化，请刷新后重试', 409);
    return json({ id, version: next });
  } catch (e) {
    if (e instanceof Validation) return json({ error: e.message }, e.status);
    if (e instanceof Error && /UNIQUE/.test(e.message))
      return json({ error: '名称或票据编号已存在，请核对是否重复录入' }, 409);
    console.error('Finance operation failed', e);
    return json({ error: '保存失败，请稍后重试' }, 500);
  }
}

export const GET = protectLegacy(legacyGET, 'finance');
export const POST = protectLegacy(legacyPOST, 'finance');
