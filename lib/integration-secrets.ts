import { env } from '@/lib/server-env';
import { database } from './store';
import { PlatformError } from './platform-auth';
const encode = (b: Uint8Array) =>
  btoa(Array.from(b, (c) => String.fromCharCode(c)).join(''));
const decode = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
async function key() {
  const master = (env as unknown as { PLATFORM_MASTER_KEY?: string })
    .PLATFORM_MASTER_KEY;
  if (!master || !/^([a-f0-9]{64})$/i.test(master))
    throw new PlatformError(
      '密钥加密尚未配置：本地重启服务会自动初始化，线上需设置 PLATFORM_MASTER_KEY',
      503,
    );
  return crypto.subtle.importKey(
    'raw',
    Uint8Array.from(master.match(/../g)!, (s) => parseInt(s, 16)),
    { name: 'AES-GCM' },
    false,
    ['encrypt', 'decrypt'],
  );
}
export async function encryptSecret(
  companyId: string,
  connectionId: string,
  field: string,
  value: string,
) {
  if (value.length > 8000) throw new PlatformError('密钥过长');
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: nonce,
      additionalData: new TextEncoder().encode(
        `${companyId}/${connectionId}/${field}`,
      ),
    },
    await key(),
    new TextEncoder().encode(value),
  );
  return {
    nonce: encode(nonce),
    ciphertext: encode(new Uint8Array(encrypted)),
  };
}
export async function readSecret(
  companyId: string,
  connectionId: string,
  field: string,
) {
  const row = await database()
    .prepare(
      "SELECT s.nonce,s.ciphertext FROM treasure_integration_secrets s JOIN treasure_integration_connections c ON c.id=s.connectionId WHERE c.companyId=? AND s.connectionId=? AND s.field=?",
    )
    .bind(companyId, connectionId, field)
    .first<{ nonce: string; ciphertext: string }>();
  if (!row) return '';
  try {
    return new TextDecoder().decode(
      await crypto.subtle.decrypt(
        {
          name: 'AES-GCM',
          iv: decode(row.nonce),
          additionalData: new TextEncoder().encode(
            `${companyId}/${connectionId}/${field}`,
          ),
        },
        await key(),
        decode(row.ciphertext),
      ),
    );
  } catch (e) {
    if (e instanceof PlatformError) throw e;
    throw new PlatformError('密钥无法解密，请检查主密钥或重新配置连接', 503);
  }
}
export async function textModelSettings(companyId: string) {
  const row = await database()
    .prepare(
      "SELECT id,config FROM treasure_integration_connections WHERE companyId=? AND provider='deepseek' AND enabled=1 ORDER BY updatedAt DESC LIMIT 1",
    )
    .bind(companyId)
    .first<{ id: string; config: string }>();
  const server = env as unknown as {
    DEEPSEEK_API_KEY?: string;
    DEEPSEEK_MODEL?: string;
    LOCAL_AI_DISABLED?: string;
  };
  if (server.LOCAL_AI_DISABLED === '1')
    return { key: '', model: 'deepseek-flash', connectionId: '' };
  return {
    key: row
      ? (await readSecret(companyId, row.id, 'apiKey')) ||
        server.DEEPSEEK_API_KEY ||
        ''
      : server.DEEPSEEK_API_KEY || '',
    model: row
      ? JSON.parse(row.config).model || 'deepseek-flash'
      : server.DEEPSEEK_MODEL || 'deepseek-flash',
    connectionId: row?.id || '',
  };
}
