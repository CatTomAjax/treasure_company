import assert from 'node:assert/strict';
import {writeFile,mkdir} from 'node:fs/promises';
const base=process.env.TEST_BASE_URL||'http://localhost:3000';
let checks=0;const ids=[];let knowledgeId='';const suffix=Date.now();
function check(value,message){assert.ok(value,message);checks++;console.log(`PASS ${message}`)}
async function get(){const r=await fetch(`${base}/api/workspace`);assert.equal(r.status,200);return r.json()}
async function post(body,status=200,extra={}){const r=await fetch(`${base}/api/workspace`,{method:'POST',headers:{'Content-Type':'application/json',...extra},body:JSON.stringify(body)});const raw=await r.text();let data;try{data=JSON.parse(raw)}catch{data={error:raw}}assert.equal(r.status,status,JSON.stringify(data));return data}
const initial=await get();check(initial.tasks.length>=5&&initial.knowledge.length>=3,'workspace initializes persistent sample records');
check(initial.aiMode==='demo','missing model credential is explicitly demo mode');
const body={action:'create',title:`QA 内容 ${suffix}`,type:'招商文案',brief:'为机器人创业团队介绍园区共创与空间服务，具体价格待确认。',audience:'机器人创业团队',channel:'微信公众号',owner:'QA',dueDate:'2026-09-15'};
await post({...body,title:''},400);check((await get()).tasks.length===initial.tasks.length,'invalid request does not create a task');
await post(body,403,{Origin:'https://outside.example'});checks++;console.log('PASS cross-origin mutation rejected');
const k=await post({action:'knowledge',title:`QA 机器人 ${suffix}`,category:'品牌资料',content:'机器人创业团队共创资料，明确具体价格与房源待确认。'});knowledgeId=k.id;check((await get()).knowledge.some(x=>x.id===k.id),'knowledge text persists across requests');
const created=await post(body,201);ids.push(created.task.id);let task=created.task;check(task.status==='draft'&&task.source==='模板演示生成','generation creates a clearly labelled draft');check(task.content.includes(body.brief)&&created.sources.some(s=>s.includes(`QA 机器人 ${suffix}`)),'generation preserves brief and retrieves relevant knowledge');
check((await get()).tasks.some(t=>t.id===task.id),'draft survives independent read');
await post({...task,action:'save',status:'archived'},409);checks++;console.log('PASS cannot skip review and archive draft');
const saved=await post({...task,action:'save',content:task.content+'\nQA 编辑内容'});check(saved.task.content.includes('QA 编辑内容'),'draft content editable');
await post({...task,action:'save'},409);checks++;console.log('PASS stale version cannot overwrite latest edit');task=saved.task;
task=(await post({...task,action:'save',status:'review'})).task;check(task.status==='review','submit for human review');
await post({...task,action:'save',status:'approved'},400);checks++;console.log('PASS approval requires all review checks');
await post({...task,action:'save',status:'approved',reviewChecks:[true,true,true],content:'未经审核的新内容'},409);checks++;console.log('PASS approved transition cannot silently replace content');
task=(await post({...task,action:'save',status:'draft',comment:'请补充事实来源'})).task;check(task.status==='draft'&&task.comment==='请补充事实来源','review can return draft with feedback');
task=(await post({...task,action:'save',status:'review'})).task;task=(await post({...task,action:'save',status:'approved',reviewChecks:[true,true,true]})).task;check(task.status==='approved','checked content enters publishing queue');
task=(await post({...task,action:'save',status:'archived'})).task;check(task.status==='archived','archive after approval');
const flow=initial.flows.find(f=>f.type==='招商文案');await post({action:'flow',id:flow.id,enabled:false});await post({...body,flowId:flow.id},409);checks++;console.log('PASS paused workflow blocks new run');
await post({action:'flow',id:flow.id,enabled:true});const flowTask=(await post({...body,title:`QA workflow ${suffix}`,flowId:flow.id},201)).task;ids.push(flowTask.id);check(flowTask.status==='review','workflow runs retrieval and generation, stops at human review');
const after=await get();check(after.flows.find(f=>f.id===flow.id).runs===flow.runs+1,'workflow count reflects successful run');check(after.activities.some(a=>a.taskId===task.id),'task actions produce persistent activity records');
// Clean up only fixtures created by this test, using explicit returned UUIDs.
for(const id of [...ids,knowledgeId])assert.match(id,/^[a-f0-9-]{36}$/);
const sql=`DELETE FROM treasure_tasks WHERE id IN (${ids.map(id=>`'${id}'`).join(',')});
DELETE FROM treasure_activities WHERE taskId IN (${ids.map(id=>`'${id}'`).join(',')});
DELETE FROM treasure_knowledge WHERE id='${knowledgeId}';\nDELETE FROM activities WHERE message='运营团队更新了知识资料 · QA 机器人 ${suffix}';
UPDATE treasure_flows SET runs=${flow.runs},enabled=${flow.enabled?1:0} WHERE id='${flow.id}';\n`;
await mkdir('work',{recursive:true});await writeFile('work/test-cleanup.sql',sql);console.log(`PASS ${checks} integration checks`);
