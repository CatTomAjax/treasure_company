import assert from 'node:assert/strict';
const base=process.env.TEST_BASE_URL||'http://127.0.0.1:3002';
const r=await fetch(base+'/api/finance');
assert.equal(r.status,200,'AI 财税接口必须提供独立收支账本');
const data=await r.json();
assert.ok(Array.isArray(data.entries),'账本必须返回持久化记录');
console.log('Finance endpoint available');
