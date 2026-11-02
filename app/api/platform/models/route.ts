import { database } from '@/lib/store';
import {
  body,
  context,
  failure,
  PlatformError,
  reply,
  requireManager,
  str,
} from '@/lib/platform-auth';
import { connection } from '@/lib/integration-service';
import {
  activeModelSettings,
  connectionSettings,
  modelProviders,
  publicModel,
} from '@/lib/model-settings';
import { streamConfiguredModel } from '@/lib/model-stream';
import { projectExists } from '@/lib/agent-store';
export async function GET(request: Request) {
  try {
    const p = new URL(request.url).searchParams,
      companyId = p.get('companyId') || 'park',
      projectId = p.get('projectId') || '',
      { tenant } = await context(request, companyId);
    requireManager(tenant.role);
    await projectExists(companyId, projectId);
    const db = database();
    const ids = (
      await db
        .prepare(
          "SELECT id FROM treasure_integration_connections WHERE companyId=? AND provider IN ('deepseek','openai') ORDER BY updatedAt DESC",
        )
        .bind(companyId)
        .all<{ id: string }>()
    ).results;
    const active = await activeModelSettings(companyId, projectId);
    return reply({
      connections: await Promise.all(
        ids.map((c) => connection(companyId, c.id)),
      ),
      catalogs: (
        await db
          .prepare("SELECT * FROM treasure_model_catalogs WHERE companyId=?")
          .bind(companyId)
          .all()
      ).results.map((r: any) => ({ ...r, models: JSON.parse(r.models) })),
      tests: (
        await db
          .prepare(
            "SELECT * FROM treasure_model_tests WHERE companyId=? ORDER BY createdAt DESC LIMIT 100",
          )
          .bind(companyId)
          .all()
      ).results,
      preferences: (
        await db
          .prepare("SELECT * FROM treasure_model_preferences WHERE companyId=?")
          .bind(companyId)
          .all()
      ).results,
      active: { ...publicModel(active), configured: !!active.key },
      projects: (
        await db
          .prepare(
            "SELECT id,title FROM treasure_business_records WHERE companyId=? AND kind='project' ORDER BY updatedAt DESC",
          )
          .bind(companyId)
          .all()
      ).results,
      role: tenant.role,
      providers: modelProviders,
    });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    const b = await body(request, 10000),
      companyId = str(b, 'companyId'),
      { user, tenant } = await context(request, companyId, true);
    requireManager(tenant.role);
    const action = str(b, 'action'),
      id = str(b, 'connectionId'),
      db = database(),
      c = await connection(companyId, id);
    if (!['deepseek', 'openai'].includes(c.provider))
      throw new PlatformError('请选择文本模型连接');
    if (c.version !== str(b, 'version'))
      throw new PlatformError('模型连接已更新，请刷新', 409);
    const model = str(
        { model: b.model ?? c.config.model ?? '' },
        'model',
        200,
        false,
      ),
      settings = await connectionSettings(companyId, id, model),
      at = new Date().toISOString();
    if (!settings.key)
      throw new PlatformError('尚无可用API密钥，请先保存密钥', 503);
    if (action === 'catalog.refresh' || action === 'test') {
      const started = Date.now(),
        testId = crypto.randomUUID();
      let message = '',
        status = 'success',
        inputTokens = 0,
        outputTokens = 0,
        models: string[] = [];
      try {
        if (action === 'catalog.refresh') {
          const response = await fetch(
            modelProviders[settings.provider].modelsURL,
            {
              headers: { Authorization: `Bearer ${settings.key}` },
              signal: AbortSignal.timeout(20000),
            },
          );
          if (!response.ok) {
            await response.body?.cancel();
            throw new PlatformError(
              `获取模型失败（HTTP ${response.status}），请核对密钥和权限`,
              502,
            );
          }
          const result = (await response.json()) as { data?: { id: string }[] };
          if (!Array.isArray(result.data))
            throw new PlatformError('供应商模型列表格式无效', 502);
          models = [
            ...new Set(
              result.data
                .map((m) => m.id)
                .filter((m) => typeof m === 'string' && m.length <= 200),
            ),
          ].slice(0, 500);
          message = `已从供应商获取 ${models.length} 个可用模型。`;
        } else {
          if (!model) throw new PlatformError('请先选择或填写模型ID');
          const output = await streamConfiguredModel(
            settings,
            '这是模型连通测试，请仅返回 MODEL_CONNECTION_OK，不使用工具，不包含推理过程。',
            '请返回 MODEL_CONNECTION_OK。',
            1024,
            async () => {},
            request.signal,
          );
          message = output.content.slice(0, 300);
          inputTokens = output.inputTokens;
          outputTokens = output.outputTokens;
          if (output.content.trim() !== 'MODEL_CONNECTION_OK')
            throw new PlatformError(
              '供应商已响应，但测试口令未正确返回，请检查所选模型',
              502,
            );
        }
      } catch (e) {
        status = 'error';
        message =
          e instanceof PlatformError
            ? e.message
            : '连接或模型测试失败，请检查网络和供应商配置';
      }
      const ops = [
        db
          .prepare(
            "INSERT INTO treasure_model_tests(id,companyId,connectionId,connectionVersion,model,kind,status,latencyMs,inputTokens,outputTokens,message,createdAt,actor) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)",
          )
          .bind(
            testId,
            companyId,
            id,
            c.version,
            model,
            action === 'test' ? 'completion' : 'catalog',
            status,
            Date.now() - started,
            inputTokens,
            outputTokens,
            message,
            at,
            user.name,
          ),
      ];
      if (status === 'success' && action === 'catalog.refresh')
        ops.push(
          db
            .prepare(
              "INSERT INTO treasure_model_catalogs(connectionId,companyId,models,updatedAt) VALUES(?,?,?,?) ON DUPLICATE KEY UPDATE models=VALUES(models),updatedAt=VALUES(updatedAt)",
            )
            .bind(id, companyId, JSON.stringify(models), at),
        );
      await db.batch(ops);
      return reply({
        status,
        message,
        models,
        testId,
        latencyMs: Date.now() - started,
        inputTokens,
        outputTokens,
      });
    }
    if (action === 'select') {
      const projectId = str(
        { projectId: b.projectId ?? '' },
        'projectId',
        200,
        false,
      );
      await projectExists(companyId, projectId);
      const passed = await db
        .prepare(
          "SELECT status FROM treasure_model_tests WHERE companyId=? AND connectionId=? AND connectionVersion=? AND model=? AND kind='completion' ORDER BY createdAt DESC LIMIT 1",
        )
        .bind(companyId, id, c.version, model)
        .first<{ status: string }>();
      if (passed?.status !== 'success')
        throw new PlatformError('请先对当前配置和模型完成真实连通测试');
      const old = await db
        .prepare(
          "SELECT version FROM treasure_model_preferences WHERE companyId=? AND projectId=?",
        )
        .bind(companyId, projectId)
        .first<{ version: number }>();
      if (b.preferenceVersion !== (old?.version || 0))
        throw new PlatformError('默认模型已变化，请刷新', 409);
      let result;
      try {
        result = await db.batch([
          db
            .prepare(
              "UPDATE treasure_integration_connections SET enabled=1,testStatus='remote_verified',testMessage='所选模型真实推理测试已通过',updatedAt=? WHERE companyId=? AND id=? AND version=?",
            )
            .bind(at, companyId, id, c.version),
          db
            .prepare(
              "INSERT INTO treasure_model_preferences(companyId,projectId,connectionId,model,version,updatedBy,updatedAt) SELECT ?,?,?,?,1,?,? WHERE EXISTS(SELECT 1 FROM treasure_integration_connections WHERE companyId=? AND id=? AND version=?) ON DUPLICATE KEY UPDATE connectionId=VALUES(connectionId),model=VALUES(model),version=CASE WHEN treasure_model_preferences.version=? THEN treasure_model_preferences.version+1 ELSE NULL END,updatedBy=VALUES(updatedBy),updatedAt=VALUES(updatedAt)",
            )
            .bind(
              companyId,
              projectId,
              id,
              model,
              user.name,
              at,
              companyId,
              id,
              c.version,
              old?.version || 0,
            ),
        ]);
      } catch {
        throw new PlatformError('模型选择已变化，请刷新后重试', 409);
      }
      if (!result[0].meta.changes || !result[1].meta.changes)
        throw new PlatformError('模型配置已变化，请刷新', 409);
      return reply({
        active: {
          ...publicModel(await activeModelSettings(companyId, projectId)),
          configured: true,
        },
      });
    }
    throw new PlatformError('模型操作无效');
  } catch (e) {
    return failure(e);
  }
}
