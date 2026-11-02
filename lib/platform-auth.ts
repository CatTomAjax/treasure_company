import { database } from './store';
import type { PlatformUser, Tenant } from './platform-config';
export class PlatformError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export const reply = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
export function failure(e: unknown) {
  if (e instanceof PlatformError) return reply({ error: e.message }, e.status);
  console.error('Platform operation failed', e);
  return reply({ error: '操作失败，请检查数据库迁移或稍后重试' }, 500);
}
export function sameOrigin(request: Pick<Request, 'headers' | 'url'>) {
  const origin = request.headers.get('origin');
  if (
    (origin && origin !== new URL(request.url).origin) ||
    request.headers.get('sec-fetch-site') === 'cross-site'
  )
    throw new PlatformError('请求来源无效', 403);
}
export async function body(
  request: Pick<Request, 'headers' | 'url' | 'text'>,
  max = 160000,
) {
  if (Number(request.headers.get('content-length') || 0) > max)
    throw new PlatformError('请求过大', 413);
  const raw = await request.text();
  sameOrigin(request);
  if (raw.length > max) throw new PlatformError('请求过大', 413);
  let b: Record<string, unknown>;
  try {
    b = JSON.parse(raw);
  } catch {
    throw new PlatformError('JSON 格式无效');
  }
  if (!b || typeof b !== 'object' || Array.isArray(b))
    throw new PlatformError('请求格式无效');
  return b;
}
export function str(
  b: Record<string, unknown>,
  key: string,
  max = 200,
  required = true,
) {
  const v = b[key];
  if (typeof v !== 'string' || v.length > max || (required && !v.trim()))
    throw new PlatformError(`请检查 ${key} 字段`);
  return v.trim();
}
export async function digest(s: string) {
  return [
    ...new Uint8Array(
      await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)),
    ),
  ]
    .map((x) => x.toString(16).padStart(2, '0'))
    .join('');
}
export async function passwordHash(password: string, salt: string) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  return [
    ...new Uint8Array(
      await crypto.subtle.deriveBits(
        {
          name: 'PBKDF2',
          salt: new TextEncoder().encode(salt),
          iterations: 100000,
          hash: 'SHA-256',
        },
        key,
        256,
      ),
    ),
  ]
    .map((x) => x.toString(16).padStart(2, '0'))
    .join('');
}
export function validatePassword(password: string) {
  if (password.length < 12 || password.length > 128)
    throw new PlatformError('密码须为 12 至 128 个字符');
}
export function emailValue(b: Record<string, unknown>) {
  const email = str(b, 'email', 200).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    throw new PlatformError('请输入有效邮箱');
  return email;
}
export function sessionCookie(request: Request, token: string, clear = false) {
  return `qianhai_session=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${clear ? 0 : 43200}${new URL(request.url).protocol === 'https:' ? '; Secure' : ''}`;
}
export async function currentUser(
  request: Request,
): Promise<PlatformUser | null> {
  const token = request.headers
    .get('cookie')
    ?.split(';')
    .map((x) => x.trim())
    .find((x) => x.startsWith('qianhai_session='))
    ?.slice(16);
  if (!token) return null;
  const u = await database()
    .prepare(
      "SELECT u.id,u.name,u.email,u.isAdmin FROM treasure_platform_sessions s JOIN treasure_platform_users u ON u.id=s.userId WHERE s.tokenHash=? AND s.expiresAt>? AND u.active=1",
    )
    .bind(await digest(token), new Date().toISOString())
    .first<PlatformUser>();
  return u ? { ...u, isAdmin: !!u.isAdmin } : null;
}
export async function tenants(user: PlatformUser): Promise<Tenant[]> {
  return (
    await (
      user.isAdmin
        ? database().prepare(
            "SELECT id,name,'admin' AS role FROM treasure_finance_companies ORDER BY createdAt",
          )
        : database()
            .prepare(
              "SELECT c.id,c.name,m.role FROM treasure_finance_companies c JOIN treasure_platform_members m ON m.companyId=c.id WHERE m.userId=? ORDER BY c.createdAt",
            )
            .bind(user.id)
    ).all<Tenant>()
  ).results;
}
export async function context(
  request: Request,
  companyId: string,
  write = false,
) {
  const user = await currentUser(request);
  if (!user) throw new PlatformError('请先登录', 401);
  const tenant = (await tenants(user)).find((t) => t.id === companyId);
  if (!tenant) throw new PlatformError('无权访问该企业', 403);
  if (write && tenant.role === 'viewer')
    throw new PlatformError('当前账号只有查看权限', 403);
  return { user, tenant };
}
export function requireManager(role: string) {
  if (!['admin', 'manager'].includes(role))
    throw new PlatformError('此操作需要管理员或经理权限', 403);
}
/** Protect retained routes without rewriting existing financial transactions. */
export function protectLegacy(
  handler: (request: Request) => Promise<Response>,
  area: 'finance' | 'workspace' | 'park',
) {
  return async (request: Request) => {
    try {
      const p = new URL(request.url).searchParams;
      let b: Record<string, unknown> = {},
        forward = request;
      if (request.method !== 'GET') {
        const raw = await request.text();
        sameOrigin(request);
        if (raw.length > 2400000) throw new PlatformError('请求过大', 413);
        try {
          b = JSON.parse(raw);
        } catch {
          throw new PlatformError('JSON 格式无效');
        }
        if (!b || typeof b !== 'object' || Array.isArray(b))
          throw new PlatformError('请求格式无效');
        forward = new Request(request.url, {
          method: request.method,
          headers: request.headers,
          body: raw,
        });
      }
      const requested =
        typeof b.companyId === 'string'
          ? b.companyId
          : p.get('companyId') || 'park';
      if (
        p.get('companyId') &&
        typeof b.companyId === 'string' &&
        p.get('companyId') !== b.companyId
      )
        throw new PlatformError('企业参数不一致');
      const { user, tenant } = await context(
        request,
        area === 'finance' ? requested : 'park',
        request.method !== 'GET',
      );
      if (area === 'finance') requireManager(tenant.role);
      if (b.action === 'company.create' && !user.isAdmin)
        throw new PlatformError('只有平台管理员可以创建企业', 403);
      if (area !== 'finance' && !user.isAdmin)
        throw new PlatformError(
          '旧内容空间仅限平台管理员；请使用企业知识库和内容生产入口',
          403,
        );
      const response = await handler(forward);
      if (
        area === 'finance' &&
        request.method === 'GET' &&
        response.ok &&
        response.headers.get('content-type')?.includes('application/json')
      ) {
        const d = (await response.json()) as Record<string, unknown>;
        if (Array.isArray(d.companies)) {
          const allowed = new Set((await tenants(user)).map((t) => t.id));
          d.companies = d.companies.filter((c: { id: string }) =>
            allowed.has(c.id),
          );
        }
        return reply(d);
      }
      return response;
    } catch (e) {
      return failure(e);
    }
  };
}
