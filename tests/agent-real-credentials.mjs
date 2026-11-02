import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

/** Read the existing configured credential into memory only. No credential is returned over HTTP or saved. */
export async function configuredDeepSeek() {
  for (const file of ['.env', '.dev.vars'])
    if (existsSync(file)) process.loadEnvFile(file);
  if (process.env.DEEPSEEK_API_KEY)
    return {
      key: process.env.DEEPSEEK_API_KEY,
      model: process.env.DEEPSEEK_MODEL || 'deepseek-flash',
      source: 'server-environment',
    };
  const {createPool}=await import('../db/mysql.ts');
  const db=createPool();
  try {
    const [[row]]=await db.query("SELECT c.id,c.companyId,c.config,s.nonce,s.ciphertext FROM treasure_integration_connections c JOIN treasure_integration_secrets s ON s.connectionId=c.id AND s.field='apiKey' WHERE c.provider='deepseek' AND c.enabled=1 ORDER BY c.updatedAt DESC LIMIT 1");
    if(!row)return null;
    const master=process.env.PLATFORM_MASTER_KEY||readFileSync('data/integration-master.key','utf8').trim();
    const key=await crypto.subtle.importKey('raw',Buffer.from(master,'hex'),{name:'AES-GCM'},false,['decrypt']);
    const clear=await crypto.subtle.decrypt({name:'AES-GCM',iv:Buffer.from(row.nonce,'base64'),additionalData:new TextEncoder().encode(row.companyId+'/'+row.id+'/apiKey')},key,Buffer.from(row.ciphertext,'base64'));
    const [[pref]]=await db.query('SELECT model FROM treasure_model_preferences WHERE companyId=? AND connectionId=? ORDER BY updatedAt DESC LIMIT 1',[row.companyId,row.id]);
    return {key:new TextDecoder().decode(clear),model:pref?.model||JSON.parse(row.config).model||'deepseek-flash',source:'existing-encrypted-connection'};
  }finally{await db.end()}
}
