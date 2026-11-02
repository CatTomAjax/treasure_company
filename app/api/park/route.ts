import {protectLegacy} from '@/lib/platform-auth';
import {database} from '@/lib/store';
import {ticketSeeds,type Ticket,type TicketStatus} from '@/lib/park-data';
const json=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
async function seed(){const db=database();if(await db.prepare("SELECT value FROM treasure_metadata WHERE `key`=?").bind('park-seeded').first())return;await db.batch([...ticketSeeds.map(t=>db.prepare("INSERT INTO treasure_service_tickets (id,title,location,category,priority,reporter,description,status,createdAt,updatedAt) VALUES (?,?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE `id`=`id`").bind(t.id,t.title,t.location,t.category,t.priority,t.reporter,t.description,t.status,t.createdAt,t.updatedAt)),db.prepare("INSERT INTO treasure_metadata (`key`,value) VALUES (?,?) ON DUPLICATE KEY UPDATE `key`=`key`").bind('park-seeded','1')]);}
async function legacyGET(_request:Request){try{await seed();const rows=await database().prepare("SELECT * FROM treasure_service_tickets ORDER BY createdAt DESC LIMIT 500").all();return json({tickets:rows.results});}catch{return json({error:'物业工单暂时无法加载，请稍后重试'},503)}}
async function legacyPOST(request:Request){try{
 const raw=await request.text();
 const origin=request.headers.get('origin');if(origin&&origin!==new URL(request.url).origin)return json({error:'请求来源无效'},403);
 if(raw.length>16000)return json({error:'内容过长'},413);
 let b:Record<string,unknown>;try{b=JSON.parse(raw)}catch{return json({error:'请求格式无效'},400)}if(!b||typeof b!=='object'||Array.isArray(b))return json({error:'请求格式无效'},400);
 await seed();const db=database();const now=new Date().toISOString();
 if(b.action==='create'){
  const limits:Record<string,number>={title:150,location:100,category:30,priority:10,reporter:60,description:4000};for(const [key,max] of Object.entries(limits)){if(typeof b[key]!=='string'||!(b[key] as string).trim()||(b[key] as string).length>max)return json({error:'请完整填写工单信息，且不要超过字段长度限制'},400)}
  if(!['普通','紧急'].includes(b.priority as string))return json({error:'优先级无效'},400);
  const t:Ticket={id:crypto.randomUUID(),title:(b.title as string).trim(),location:(b.location as string).trim(),category:b.category as string,priority:b.priority as string,reporter:(b.reporter as string).trim(),description:(b.description as string).trim(),status:'待处理',createdAt:now,updatedAt:now};
  await db.prepare("INSERT INTO treasure_service_tickets (id,title,location,category,priority,reporter,description,status,createdAt,updatedAt) VALUES (?,?,?,?,?,?,?,?,?,?)").bind(t.id,t.title,t.location,t.category,t.priority,t.reporter,t.description,t.status,now,now).run();return json({ticket:t},201);
 }
 if(b.action==='status'){
  if(typeof b.id!=='string'||typeof b.updatedAt!=='string')return json({error:'工单信息无效'},400);
  const t=await db.prepare("SELECT * FROM treasure_service_tickets WHERE id=?").bind(b.id).first<Ticket>();if(!t)return json({error:'工单不存在'},404);
  const transitions:Record<TicketStatus,TicketStatus[]>={'待处理':['处理中'],'处理中':['已完成','待处理'],'已完成':['待处理']};if(!transitions[t.status].includes(b.status as TicketStatus))return json({error:'工单状态流转无效'},409);
  const result=await db.prepare("UPDATE treasure_service_tickets SET status=?,updatedAt=? WHERE id=? AND updatedAt=?").bind(b.status,now,b.id,b.updatedAt).run();if(!result.meta.changes)return json({error:'工单已更新，请重新打开后再操作'},409);return json({ticket:{...t,status:b.status,updatedAt:now}});
 }
 return json({error:'操作无效'},400);
 }catch{return json({error:'操作失败，请稍后重试'},500)}}


export const GET=protectLegacy(legacyGET,'park');
export const POST=protectLegacy(legacyPOST,'park');
