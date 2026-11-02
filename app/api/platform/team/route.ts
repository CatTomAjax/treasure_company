import { database } from '@/lib/store';
import {
  body,
  context,
  currentUser,
  emailValue,
  failure,
  passwordHash,
  PlatformError,
  reply,
  requireManager,
  str,
  validatePassword,
} from '@/lib/platform-auth';
export async function GET(request: Request) {
  try {
    const companyId =
      new URL(request.url).searchParams.get('companyId') || 'park';
    const { tenant } = await context(request, companyId);
    requireManager(tenant.role);
    return reply({
      members: (
        await database()
          .prepare(
            "SELECT u.id,u.name,u.email,u.active,m.role FROM treasure_platform_members m JOIN treasure_platform_users u ON u.id=m.userId WHERE m.companyId=? ORDER BY u.name",
          )
          .bind(companyId)
          .all()
      ).results,
    });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    const b = await body(request, 20000),
      action = str(b, 'action'),
      companyId = str(b, 'companyId'),
      { user, tenant } = await context(request, companyId, true),
      db = database(),
      now = new Date().toISOString();
    if (action === 'tenant.create') {
      if (!user.isAdmin) throw new PlatformError('需要平台管理员权限', 403);
      const id = crypto.randomUUID();
      await db.batch([
        db
          .prepare(
            "INSERT INTO treasure_finance_companies(id,name,createdAt) VALUES(?,?,?)",
          )
          .bind(id, str(b, 'name', 120), now),
        db
          .prepare(
            "INSERT INTO treasure_platform_members(userId,companyId,role) VALUES(?,?,'admin')",
          )
          .bind(user.id, id),
      ]);
      return reply({ id }, 201);
    }
    if (tenant.role !== 'admin')
      throw new PlatformError('需要企业管理员权限', 403);
    const role = str(b, 'role');
    if (!['admin', 'manager', 'member', 'viewer'].includes(role))
      throw new PlatformError('角色无效');
    if (action === 'member.create') {
      const email = emailValue(b),
        existing = await db
          .prepare("SELECT id FROM treasure_platform_users WHERE email=?")
          .bind(email)
          .first<{ id: string }>();
      let id = existing?.id;
      if (existing) {
        if (!user.isAdmin)
          throw new PlatformError('添加已有账号需要平台管理员操作', 403);
        await db
          .prepare(
            "INSERT INTO treasure_platform_members(userId,companyId,role) VALUES(?,?,?) ON DUPLICATE KEY UPDATE role=VALUES(role)",
          )
          .bind(id, companyId, role)
          .run();
      } else {
        const password = str(b, 'password', 128);
        validatePassword(password);
        id = crypto.randomUUID();
        const salt = crypto.randomUUID();
        await db.batch([
          db
            .prepare(
              "INSERT INTO treasure_platform_users(id,email,name,salt,passwordHash,isAdmin,active,createdAt) VALUES(?,?,?,?,?,0,1,?)",
            )
            .bind(
              id,
              email,
              str(b, 'name', 80),
              salt,
              await passwordHash(password, salt),
              now,
            ),
          db
            .prepare(
              "INSERT INTO treasure_platform_members(userId,companyId,role) VALUES(?,?,?)",
            )
            .bind(id, companyId, role),
        ]);
      }
      return reply({ id }, 201);
    }
    if (action === 'member.role') {
      const id = str(b, 'id');
      if (id === user.id) throw new PlatformError('不能在这里修改自己的权限');
      const target = await db
        .prepare("SELECT isAdmin FROM treasure_platform_users WHERE id=?")
        .bind(id)
        .first<{ isAdmin: number }>();
      if (target?.isAdmin) throw new PlatformError('平台管理员角色不能修改');
      await db
        .prepare(
          "UPDATE treasure_platform_members SET role=? WHERE userId=? AND companyId=?",
        )
        .bind(role, id, companyId)
        .run();
      return reply({ ok: true });
    }
    if (action === 'password.reset') {
      const id = str(b, 'id'),
        password = str(b, 'password', 128);
      validatePassword(password);
      const target = await db
        .prepare(
          "SELECT u.isAdmin FROM treasure_platform_users u JOIN treasure_platform_members m ON m.userId=u.id WHERE u.id=? AND m.companyId=?",
        )
        .bind(id, companyId)
        .first<{ isAdmin: number }>();
      if (!target || (!user.isAdmin && target.isAdmin))
        throw new PlatformError('无权重置该账号', 403);
      const salt = crypto.randomUUID();
      await db.batch([
        db
          .prepare("UPDATE treasure_platform_users SET salt=?,passwordHash=? WHERE id=?")
          .bind(salt, await passwordHash(password, salt), id),
        db.prepare("DELETE FROM treasure_platform_sessions WHERE userId=?").bind(id),
      ]);
      return reply({ ok: true });
    }
    throw new PlatformError('操作无效');
  } catch (e) {
    return failure(e);
  }
}
