import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
const base=process.env.TEST_BASE_URL||'http://127.0.0.1:3002',suffix=crypto.randomUUID(),companies=[];
let checks=0;
const check=(v,message)=>{assert.ok(v,message);checks++};
async function call(body,status=200,path='/api/tax'){const r=await fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const d=await r.json();assert.equal(r.status,status,`${body.action}: ${JSON.stringify(d)}`);checks++;return d}
async function get(c){const r=await fetch(base+'/api/tax?companyId='+c);assert.equal(r.status,200);return r.json()}
async function op(c,id,action,extra={},status=200,table='invoices'){const item=(await get(c))[table].find(i=>i.id===id);return call({companyId:c,id,version:item.version,action,...extra},status)}
const sample={direction:'input',polarity:'blue',type:'增值税专用发票',invoiceNo:'IN-'+suffix,originalInvoiceNo:'',counterparty:'税务验收供应商',date:'2026-10-01',amount:'113.00',taxAmount:'13.00',note:'测试票据',sourceId:''};
try{
 const a=await call({action:'company.create',name:'税务接口验收-A-'+suffix},201,'/api/finance/business');companies.push(a.id);
 const b=await call({action:'company.create',name:'税务接口验收-B-'+suffix},201,'/api/finance/business');companies.push(b.id);const c=a.id;
 const input=await call({action:'invoice.create',companyId:c,...sample},201);
 const pending=(await get(c)).invoices[0];check(pending.status==='pending'&&pending.taxCents===1300,'票面税额与待核对状态保存');
 await call({action:'invoice.review',companyId:b.id,id:input.id,version:pending.version,status:'verified',reviewer:'核对人',deduction:'ready',reason:''},404);
 await op(c,input.id,'invoice.review',{status:'verified',reviewer:'',deduction:'ready',reason:''},400);
 await op(c,input.id,'invoice.review',{status:'verified',reviewer:'验收会计',deduction:'ready',reason:''});
 const reviewed=(await get(c)).invoices[0];check(reviewed.reviewer==='验收会计'&&reviewed.deduction==='ready','人工核对及进项资料保存');
 await call({action:'invoice.edit',companyId:c,id:input.id,version:pending.version,...sample},409);
 await call({action:'invoice.create',companyId:c,...sample},409);
 await call({action:'invoice.create',companyId:b.id,...sample},201);
 await call({action:'invoice.create',companyId:c,...sample,invoiceNo:'BAD',taxAmount:'114.00'},400);
 await call({action:'invoice.create',companyId:c,...sample,invoiceNo:'BAD',date:'2026-02-30'},400);
 await call({action:'invoice.create',companyId:c,...sample,invoiceNo:'BAD',polarity:'red'},400);
 const red=await call({action:'invoice.create',companyId:c,...sample,polarity:'red',invoiceNo:'RED-'+suffix,originalInvoiceNo:sample.invoiceNo},201);
 await op(c,red.id,'invoice.review',{status:'verified',reviewer:'验收会计',deduction:'ready',reason:''});
 let state=await get(c);check(state.invoices.filter(i=>i.status==='verified').reduce((n,i)=>n+i.taxCents*(i.polarity==='red'?-1:1),0)===0,'红字冲减票面税额');
 await op(c,input.id,'invoice.edit',{...sample,amount:'226.00',taxAmount:'26.00'});check((await get(c)).invoices.find(i=>i.id===input.id).status==='pending','修改资料后须重新核对');
 const pdf=Buffer.from('%PDF-1.4\n税务验收\n%%EOF').toString('base64');
 await op(c,input.id,'attachment.save',{name:'验收发票.pdf',mime:'application/pdf',data:pdf});
 const doc=await fetch(`${base}/api/tax/document?companyId=${c}&invoiceId=${input.id}`);check(doc.status===200,'原票可下载');check(Buffer.from(await doc.arrayBuffer()).toString('base64')===pdf,'原票字节一致');
 check((await fetch(`${base}/api/tax/document?companyId=${b.id}&invoiceId=${input.id}`)).status===404,'原票账套隔离');
 await op(c,red.id,'invoice.review',{status:'void',reason:'测试作废'});check((await get(c)).invoices.find(i=>i.id===red.id).status==='void','本地作废记录保留');
 const bill=await call({action:'bill.create',companyId:c,kind:'receivable',title:'归集验收业务',counterparty:'客户',category:'企业服务',date:'2026-10-01',dueDate:'2026-10-10',amount:'1130.00',taxRate:'13',invoiceNo:'BILL-'+suffix,note:''},201,'/api/finance/business');
 let business=await (await fetch(base+'/api/finance/business?companyId='+c)).json();let current=business.bills.find(x=>x.id===bill.id);
 await call({action:'bill.review',companyId:c,id:bill.id,version:current.version,status:'approved',reason:''},200,'/api/finance/business');
 const source=(await get(c)).sources.find(s=>s.sourceId==='bill:'+bill.id);check(source.amountCents===113000&&source.taxCents===13000,'完整财务单据归集预填');
 const imported=await call({action:'invoice.create',companyId:c,...sample,direction:'output',invoiceNo:source.invoiceNo,amount:'1130.00',taxAmount:'130.00',sourceId:source.sourceId},201);
 await call({action:'invoice.create',companyId:c,...sample,direction:'output',invoiceNo:'DUPLICATE-'+suffix,amount:'1130.00',taxAmount:'130.00',sourceId:source.sourceId},409);
 await call({action:'invoice.create',companyId:b.id,...sample,invoiceNo:'FOREIGN-'+suffix,sourceId:source.sourceId},400);
 const filingFields={taxType:'增值税及附加',periodStart:'2026-09-01',periodEnd:'2026-09-30',deadline:'2026-10-15',owner:'验收会计',amount:'500.00',note:'资料验收'};
 const filing=await call({action:'filing.create',companyId:c,...filingFields},201);
 await call({action:'filing.create',companyId:c,...filingFields},409);
 await call({action:'filing.create',companyId:c,...filingFields,periodEnd:'2026-08-30'},400);
 await op(c,filing.id,'filing.status',{status:'paid',reason:'',paymentReference:'X',paidDate:'2026-10-13'},409,'filings');
 await op(c,filing.id,'filing.status',{status:'prepared',reason:''},200,'filings');
 await op(c,filing.id,'filing.status',{status:'filed',reason:'',filingNo:'',filedDate:'2026-10-13'},400,'filings');
 await op(c,filing.id,'filing.status',{status:'filed',reason:'',filingNo:'RECEIPT-'+suffix,filedDate:'2026-10-13'},200,'filings');
 await op(c,filing.id,'filing.status',{status:'void',reason:'不能取消实际申报'},409,'filings');
 await op(c,filing.id,'filing.edit',filingFields,409,'filings');
 await op(c,filing.id,'filing.status',{status:'paid',reason:'',paymentReference:'PAY-'+suffix,paidDate:'2026-10-13'},200,'filings');
 const paid=(await get(c)).filings[0];check(paid.status==='paid'&&paid.filingNo==='RECEIPT-'+suffix&&paid.paymentReference==='PAY-'+suffix,'申报与缴款回执持久化');
 check((await get(b.id)).filings.length===0,'申报事项账套隔离');check((await get(c)).audits.length>=10,'税务操作记录留存');
 const origin=await fetch(base+'/api/tax',{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://invalid.example'},body:JSON.stringify({action:'invoice.create',companyId:c,...sample})});check(origin.status===403,'税务写入拒绝跨站请求');
 console.log(`PASS ${checks} tax checks: invoices / reviews / red invoices / source deduplication / attachments / filing lifecycle / isolation / audit`);
}finally{const ids=companies.map(c=>`'${c}'`).join(',')||"'none'";writeFileSync('work/tax-test-cleanup.sql',`-- Only test companies created by this run\n${['taxDocuments','taxInvoices','taxFilings','financeDocuments','financeEntries','financePayments','financeAudit','financeBills','financeAccounts','financeCompanies'].map(t=>`DELETE FROM ${t} WHERE ${t==='financeCompanies'?'id':'companyId'} IN (${ids});`).join('\n')}\n`);console.log('Cleanup: work/tax-test-cleanup.sql')}
