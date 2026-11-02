import {protectLegacy} from '@/lib/platform-auth';
import { env } from '@/lib/server-env';
import { database,initialize,event } from '@/lib/store';
import { generate } from '@/lib/generation';
import { contentTypes,statusLabels,type Task,type Knowledge,type Flow,type TaskStatus } from '@/lib/workbench-data';
const json=(value:unknown,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'no-store'}});
class InputError extends Error { constructor(message:string,public status=400){super(message)} }
function string(data:Record<string,unknown>,key:string,max=200,required=true){const value=data[key];if(typeof value!=='string'||value.length>max||(required&&!value.trim()))throw new InputError(`请填写有效的${({title:'标题',brief:'创作需求',owner:'负责人',audience:'目标读者',content:'内容'} as Record<string,string>)[key]||key}`);return value.trim();}
function aiKey(){return (env as unknown as {DEEPSEEK_API_KEY?:string}).DEEPSEEK_API_KEY;}
async function legacyGET(_request:Request){try {await initialize();const db=database();const [tasks,knowledge,flows,activities]=await Promise.all([db.prepare("SELECT * FROM treasure_tasks ORDER BY updatedAt DESC LIMIT 1000").all(),db.prepare("SELECT * FROM treasure_knowledge ORDER BY updatedAt DESC LIMIT 200").all(),db.prepare("SELECT * FROM treasure_flows ORDER BY id").all<Flow>(),db.prepare("SELECT * FROM treasure_activities ORDER BY createdAt DESC LIMIT 30").all()]);return json({tasks:tasks.results,knowledge:knowledge.results,flows:flows.results.map(f=>({...f,enabled:!!f.enabled})),activities:activities.results,aiMode:aiKey()?'live':'demo'});}catch{return json({error:'工作空间暂时无法加载，请稍后重试。'},503)}}
async function legacyPOST(request:Request){
 try{
  const raw=await request.text();
  const origin=request.headers.get('origin');if(origin&&origin!==new URL(request.url).origin)throw new InputError('请求来源无效',403);
  if(raw.length>100000)throw new InputError('内容过长，请缩减后重试',413);
  let b:Record<string,unknown>;try{b=JSON.parse(raw)}catch{throw new InputError('请求格式无效')};if(!b||typeof b!=='object'||Array.isArray(b))throw new InputError('请求格式无效');
  await initialize();const db=database();const now=new Date().toISOString();
  if(b.action==='create'){
   const title=string(b,'title',160),type=string(b,'type',30),brief=string(b,'brief',4000),audience=string(b,'audience',200),channel=string(b,'channel',100),owner=string(b,'owner',80);if(!contentTypes.includes(type))throw new InputError('内容类型无效');
   const dueDate=string(b,'dueDate',10,false);if(dueDate&&!/^\d{4}-\d{2}-\d{2}$/.test(dueDate))throw new InputError('日期格式无效');
   let flow:Flow|null=null;if(b.flowId){flow=await db.prepare("SELECT * FROM treasure_flows WHERE id=?").bind(string(b,'flowId')).first<Flow>();if(!flow?.enabled||flow.type!==type)throw new InputError('此工作流已暂停或类型不匹配',409);}
   const knowledge=(await db.prepare("SELECT * FROM treasure_knowledge LIMIT 200").all<Knowledge>()).results;
   const generated=await generate({title,type,brief,audience,channel},knowledge,aiKey());
   const task:Task={id:crypto.randomUUID(),title,type,brief,audience,channel,owner,dueDate,status:flow?'review':'draft',content:generated.content,createdAt:now,updatedAt:now,source:generated.source,comment:''};
   const ops=[db.prepare("INSERT INTO treasure_tasks (id,title,type,brief,audience,channel,owner,status,content,createdAt,updatedAt,source,comment,dueDate) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(task.id,title,type,brief,audience,channel,owner,task.status,task.content,now,now,task.source,'',dueDate),event(task.id,`${owner} ${flow?'运行工作流并提交审核':'创建了内容草稿'} · ${title}`)];
   if(flow)ops.push(db.prepare("UPDATE treasure_flows SET runs=runs+1 WHERE id=?").bind(flow.id));
   await db.batch(ops);return json({task,sources:generated.sources},201);
  }
  if(b.action==='save'){
   const id=string(b,'id');const old=await db.prepare("SELECT * FROM treasure_tasks WHERE id=?").bind(id).first<Task>();if(!old)throw new InputError('未找到内容任务',404);
   const version=string(b,'updatedAt',60);if(old.updatedAt!==version)throw new InputError('任务已被更新，请刷新后重试，避免覆盖他人修改。',409);
   const status=string(b,'status',20) as TaskStatus;const allowed:Record<TaskStatus,TaskStatus[]>={draft:['draft','review'],review:['review','draft','approved'],approved:['approved','draft','archived'],archived:['archived','draft']};if(!allowed[old.status].includes(status))throw new InputError('请按草稿、审核、发布队列、归档的流程操作',409);
   const content=string(b,'content',50000,false),comment=string(b,'comment',4000,false),title=string(b,'title',160),owner=string(b,'owner',80),dueDate=string(b,'dueDate',10,false);
   if(dueDate&&!/^\d{4}-\d{2}-\d{2}$/.test(dueDate))throw new InputError('日期格式无效');
   if(old.status==='review'&&status==='approved'&&(!Array.isArray(b.reviewChecks)||b.reviewChecks.length!==3||!b.reviewChecks.every(v=>v===true)))throw new InputError('请完成全部审核检查');
   if(old.status==='review'&&status==='draft'&&!comment)throw new InputError('请填写退回修改意见');
   if(status!=='draft'&&!content)throw new InputError('内容为空，无法提交审核');
   if(old.status!=='draft'&&status!=='draft'&&(content!==old.content||title!==old.title))throw new InputError('修改已提交内容前，请先退回草稿重新审核',409);
   const result=await db.prepare("UPDATE treasure_tasks SET title=?,content=?,owner=?,dueDate=?,comment=?,status=?,updatedAt=? WHERE id=? AND updatedAt=?").bind(title,content,owner,dueDate,comment,status,now,id,version).run();if(!result.meta.changes)throw new InputError('任务已被更新，请刷新后重试。',409);
   await event(id,`${owner} ${status===old.status?'保存了内容':`将内容设为${statusLabels[status]}`} · ${title}`).run();
   return json({task:{...old,title,content,owner,dueDate,comment,status,updatedAt:now}});
  }
  if(b.action==='knowledge'){
   const id=b.id?string(b,'id'):crypto.randomUUID(),title=string(b,'title',160),category=string(b,'category',50),content=string(b,'content',20000);
   const existing=await db.prepare("SELECT * FROM treasure_knowledge WHERE id=?").bind(id).first<Knowledge>();
   if(existing){const version=string(b,'updatedAt',60);const result=await db.prepare("UPDATE treasure_knowledge SET title=?,category=?,content=?,updatedAt=? WHERE id=? AND updatedAt=?").bind(title,category,content,now,id,version).run();if(!result.meta.changes)throw new InputError('资料已更新，请刷新后重新编辑',409);}else await db.prepare("INSERT INTO treasure_knowledge (id,title,category,content,updatedAt) VALUES (?,?,?,?,?)").bind(id,title,category,content,now).run();
   await event('',`运营团队更新了知识资料 · ${title}`).run();return json({id});
  }
  if(b.action==='flow'){
   const id=string(b,'id');if(typeof b.enabled!=='boolean')throw new InputError('工作流状态无效');const r=await db.prepare("UPDATE treasure_flows SET enabled=? WHERE id=?").bind(b.enabled?1:0,id).run();if(!r.meta.changes)throw new InputError('工作流不存在',404);return json({ok:true});
  }
  throw new InputError('不支持此操作');
 }catch(e){if(e instanceof InputError)return json({error:e.message},e.status);if(e instanceof Error&&e.message.startsWith('AI 服务'))return json({error:e.message},502);return json({error:'操作未完成，请稍后重试。'},500)}
}


export const GET=protectLegacy(legacyGET,'workspace');
export const POST=protectLegacy(legacyPOST,'workspace');
