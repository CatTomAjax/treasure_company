import { database } from '@/lib/store';
import {
  body,
  currentUser,
  digest,
  emailValue,
  failure,
  passwordHash,
  PlatformError,
  reply,
  sessionCookie,
  str,
  tenants,
  validatePassword,
} from '@/lib/platform-auth';
export async function GET(request: Request) {
  try {
    const initialized = !!(await database()
      .prepare("SELECT `key` FROM treasure_metadata WHERE `key`='platform-auth-initialized'")
      .first());
    const user = await currentUser(request);
    return reply({
      initialized,
      user,
      tenants: user ? await tenants(user) : [],
    });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    const b = await body(request, 12000),
      db = database(),
      action = str(b, 'action'),
      now = new Date().toISOString();
    if (action === 'logout') {
      const token = request.headers
        .get('cookie')
        ?.split(';')
        .map((s) => s.trim())
        .find((s) => s.startsWith('qianhai_session='))
        ?.slice(16);
      if (token)
        await db
          .prepare("DELETE FROM treasure_platform_sessions WHERE tokenHash=?")
          .bind(await digest(token))
          .run();
      const r = reply({ ok: true });
      r.headers.set('Set-Cookie', sessionCookie(request, '', true));
      return r;
    }
    const email = emailValue(b),
      password = str(b, 'password', 128);
    validatePassword(password);
    if (action === 'setup') {
      if (
        await db
          .prepare(
            "SELECT `key` FROM treasure_metadata WHERE `key`='platform-auth-initialized'",
          )
          .first()
      )
        throw new PlatformError('管理员已经设置，请直接登录', 409);
      const id = crypto.randomUUID(),
        salt = crypto.randomUUID(),
        hash = await passwordHash(password, salt),
        name = str(b, 'name', 80);
      await db.batch([
        db.prepare(
          "INSERT INTO treasure_metadata(`key`,value) VALUES('platform-auth-initialized','1')",
        ),
        db
          .prepare(
            "INSERT INTO treasure_finance_companies(id,name,createdAt) VALUES(?,?,?) ON DUPLICATE KEY UPDATE `id`=`id`",
          )
          .bind('park', '前海创客中心运营', now),
        db
          .prepare(
            "INSERT INTO treasure_platform_users(id,email,name,salt,passwordHash,isAdmin,active,createdAt) VALUES(?,?,?,?,?,1,1,?)",
          )
          .bind(id, email, name, salt, hash, now),
        db
          .prepare(
            "INSERT INTO treasure_platform_members(userId,companyId,role) VALUES(?,'park','admin')",
          )
          .bind(id),
      ]);
    } else if (action !== 'login') throw new PlatformError('操作无效');
    const key = await digest(email),
      attempt = await db
        .prepare(
          "SELECT attempts,expiresAt FROM treasure_platform_login_attempts WHERE `key`=?",
        )
        .bind(key)
        .first<{ attempts: number; expiresAt: string }>();
    if (attempt && attempt.expiresAt > now && attempt.attempts >= 10)
      throw new PlatformError('登录失败次数过多，请 15 分钟后再试', 429);
    await db
      .prepare(
        "INSERT INTO treasure_platform_login_attempts(`key`,attempts,expiresAt) VALUES(?,1,?) ON DUPLICATE KEY UPDATE attempts=CASE WHEN expiresAt<? THEN 1 ELSE attempts+1 END,expiresAt=CASE WHEN expiresAt<? THEN VALUES(expiresAt) ELSE expiresAt END",
      )
      .bind(key, new Date(Date.now() + 900000).toISOString(), now, now)
      .run();
    const u = await db
      .prepare("SELECT * FROM treasure_platform_users WHERE email=? AND active=1")
      .bind(email)
      .first<{ id: string; salt: string; passwordHash: string }>();
    const hash = await passwordHash(
      password,
      u?.salt || 'invalid-user-timing-salt',
    );
    if (!u || hash !== u.passwordHash)
      throw new PlatformError('邮箱或密码错误', 401);
    const token = crypto.randomUUID() + crypto.randomUUID();
    await db.batch([
      db.prepare("DELETE FROM treasure_platform_login_attempts WHERE `key`=?").bind(key),
      db.prepare("DELETE FROM treasure_platform_sessions WHERE expiresAt<?").bind(now),
      db
        .prepare(
          "INSERT INTO treasure_platform_sessions(tokenHash,userId,expiresAt) VALUES(?,?,?)",
        )
        .bind(
          await digest(token),
          u.id,
          new Date(Date.now() + 43200000).toISOString(),
        ),
    ]);
    const response = reply({ ok: true });
    response.headers.set('Set-Cookie', sessionCookie(request, token));
    return response;
  } catch (e) {
    return failure(e);
  }
}
