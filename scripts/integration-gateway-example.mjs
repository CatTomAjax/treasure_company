/** This is the project's own gateway protocol, not a vendor's payment SDK. */
import { readFileSync } from 'node:fs';
import { createHmac } from 'node:crypto';
const endpoint = process.env.INTEGRATION_CALLBACK_URL,
  secret = process.env.INTEGRATION_SIGNING_SECRET,
  file = process.argv[2];
if (!endpoint || !secret || !file)
  throw new Error(
    '请设置 INTEGRATION_CALLBACK_URL、INTEGRATION_SIGNING_SECRET，并传入事件JSON文件路径。密钥不要放入命令参数。',
  );
const url = new URL(endpoint);
if (
  url.protocol !== 'https:' &&
  !(
    url.protocol === 'http:' &&
    ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
  )
)
  throw new Error('网关回调只允许HTTPS或本机HTTP');
const raw = readFileSync(file, 'utf8');
if (raw.length > 128000) throw new Error('事件文件过大');
const event = JSON.parse(raw);
if (!event.eventId || !event.type)
  throw new Error('需设置唯一eventId与事件type');
const timestamp = String(Math.floor(Date.now() / 1000)),
  signature = createHmac('sha256', secret)
    .update(timestamp + '.' + raw)
    .digest('hex');
const response = await fetch(url, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Integration-Timestamp': timestamp,
    'X-Integration-Signature': signature,
  },
  body: raw,
  signal: AbortSignal.timeout(15000),
});
const result = await response.json();
if (!response.ok)
  throw new Error(
    `回调拒绝（${response.status}）：${result.error || '请核对配置'}`,
  );
console.log(
  JSON.stringify({
    accepted: result.accepted,
    replayed: !!result.replayed,
    eventId: event.eventId,
  }),
);
