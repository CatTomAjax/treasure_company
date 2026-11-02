import assert from 'node:assert/strict';
import {writeFile,mkdir} from 'node:fs/promises';
const base=process.env.TEST_BASE_URL||'http://localhost:3000';
let checks=0,id;
const check=(value,label)=>{assert.ok(value,label);checks++;console.log('PASS '+label)};
async function read(){const r=await fetch(base+'/api/park');assert.equal(r.status,200);return (await r.json()).tickets}
async function post(body,status=200,headers={}){const r=await fetch(base+'/api/park',{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body)});const raw=await r.text();let data;try{data=JSON.parse(raw)}catch{data={error:raw}}assert.equal(r.status,status,JSON.stringify(data));return data.ticket}
try{
 const before=await read();check(before.length>=12,'seeded property records load');
 const body={action:'create',title:'QA-'+Date.now(),location:'QA office',category:'设施维修',priority:'普通',reporter:'QA',description:'Integration fixture'};
 await post({...body,title:' '},400);check((await read()).length===before.length,'invalid title does not persist');
 await post(body,403,{Origin:'https://outside.example'});checks++;console.log('PASS cross origin rejected');
 let ticket=await post(body,201);id=ticket.id;check(ticket.status==='待处理','created pending');
 check((await read()).some(t=>t.id===id&&t.description===body.description),'ticket survives independent read');
 await post({action:'status',id,updatedAt:ticket.updatedAt,status:'已完成'},409);checks++;console.log('PASS cannot skip processing');
 const stale=ticket.updatedAt;ticket=await post({action:'status',id,updatedAt:stale,status:'处理中'});check(ticket.status==='处理中','processing saved');
 await post({action:'status',id,updatedAt:stale,status:'已完成'},409);checks++;console.log('PASS stale update rejected');
 ticket=await post({action:'status',id,updatedAt:ticket.updatedAt,status:'已完成'});check(ticket.status==='已完成','completion saved');
 ticket=await post({action:'status',id,updatedAt:ticket.updatedAt,status:'待处理'});check((await read()).find(t=>t.id===id).status==='待处理','completed ticket reopened and persisted');
 console.log(checks+' property integration checks passed');
}finally{if(id){await mkdir('work',{recursive:true});await writeFile('work/park-test-cleanup.sql',`DELETE FROM treasure_service_tickets WHERE id='${id}';\n`);}}

