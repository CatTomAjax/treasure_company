import { env } from '@/lib/server-env';
import { database } from './store';
import { PlatformError } from './platform-auth';
import { readSecret, textModelSettings } from './integration-secrets';
export const modelProviders = {
  deepseek: {
    name: 'DeepSeek',
    destination: 'https://api.deepseek.com',
    modelsURL: 'https://api.deepseek.com/models',
  },
  openai: {
    name: 'OpenAI / Codex',
    destination: 'https://api.openai.com',
    modelsURL: 'https://api.openai.com/v1/models',
  },
} as const;
export type ModelTarget = {
  provider: 'deepseek' | 'openai';
  destination: string;
  model: string;
  connectionId: string;
  connectionVersion: string;
};
export type ModelSettings = ModelTarget & { key: string };
export async function connectionSettings(
  companyId: string,
  id: string,
  model?: string,
): Promise<ModelSettings> {
  const c = await database()
    .prepare(
      "SELECT id,provider,config,version FROM treasure_integration_connections WHERE companyId=? AND id=? AND provider IN ('deepseek','openai')",
    )
    .bind(companyId, id)
    .first<{
      id: string;
      provider: 'deepseek' | 'openai';
      config: string;
      version: string;
    }>();
  if (!c) throw new PlatformError('模型连接不存在', 404);
  const server = env as unknown as {
    DEEPSEEK_API_KEY?: string;
    OPENAI_API_KEY?: string;
    LOCAL_AI_DISABLED?: string;
  };
  const key =
    server.LOCAL_AI_DISABLED === '1'
      ? ''
      : (await readSecret(companyId, id, 'apiKey')) ||
        (c.provider === 'deepseek'
          ? server.DEEPSEEK_API_KEY
          : server.OPENAI_API_KEY) ||
        '';
  return {
    provider: c.provider,
    destination: modelProviders[c.provider].destination,
    model: model ?? JSON.parse(c.config).model ?? '',
    connectionId: id,
    connectionVersion: c.version,
    key,
  };
}
export function publicModel(s: ModelSettings): ModelTarget {
  return {
    provider: s.provider,
    destination: s.destination,
    model: s.model,
    connectionId: s.connectionId,
    connectionVersion: s.connectionVersion,
  };
}
export async function activeModelSettings(
  companyId: string,
  projectId = '',
): Promise<ModelSettings> {
  const row = await database()
    .prepare(
      "SELECT connectionId,model FROM treasure_model_preferences WHERE companyId=? AND projectId IN (?,'') ORDER BY CASE WHEN projectId=? THEN 0 ELSE 1 END LIMIT 1",
    )
    .bind(companyId, projectId, projectId)
    .first<{ connectionId: string; model: string }>();
  if (row) {
    const s = await connectionSettings(companyId, row.connectionId, row.model);
    const c = await database()
      .prepare(
        "SELECT enabled FROM treasure_integration_connections WHERE companyId=? AND id=?",
      )
      .bind(companyId, row.connectionId)
      .first<{ enabled: number }>();
    return { ...s, key: c?.enabled ? s.key : '' };
  }
  const legacy = await textModelSettings(companyId);
  if (legacy.connectionId)
    return connectionSettings(companyId, legacy.connectionId, legacy.model);
  return {
    provider: 'deepseek',
    destination: modelProviders.deepseek.destination,
    model: legacy.model,
    connectionId: '',
    connectionVersion: '',
    key: legacy.key,
  };
}
export async function settingsForTarget(
  companyId: string,
  target: ModelTarget,
): Promise<ModelSettings> {
  if (
    !Object.hasOwn(modelProviders, target.provider) ||
    modelProviders[target.provider].destination !== target.destination
  )
    throw new PlatformError('模型目的地无效', 403);
  const s = target.connectionId
    ? await connectionSettings(companyId, target.connectionId, target.model)
    : await activeModelSettings(companyId);
  if (
    s.provider !== target.provider ||
    s.connectionId !== target.connectionId ||
    s.connectionVersion !== target.connectionVersion
  )
    throw new PlatformError('模型配置已变化，请重新确认任务发送范围', 409);
  if (target.connectionId) {
    const c = await database()
      .prepare(
        "SELECT enabled FROM treasure_integration_connections WHERE companyId=? AND id=?",
      )
      .bind(companyId, target.connectionId)
      .first<{ enabled: number }>();
    if (!c?.enabled) throw new PlatformError('模型连接已停用', 403);
  }
  return { ...s, model: target.model };
}
