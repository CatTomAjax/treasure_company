import { streamText } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { createDeepSeek } from '@ai-sdk/deepseek';
import type { ModelSettings } from './model-settings';
import { PlatformError } from './platform-auth';
export async function streamConfiguredModel(
  s: ModelSettings,
  system: string,
  prompt: string,
  maxTokens: number,
  delta: (text: string) => Promise<void>,
  signal: AbortSignal,
) {
  if (!s.key || !s.model)
    throw new PlatformError(
      '请先在模型配置中保存密钥、选择模型并完成连通测试',
      503,
    );
  const model =
    s.provider === 'openai'
      ? createOpenAI({
          apiKey: s.key,
          baseURL: 'https://api.openai.com/v1',
          fetch: (input, init) => globalThis.fetch(input, init),
        }).responses(s.model)
      : createDeepSeek({
          apiKey: s.key,
          baseURL: 'https://api.deepseek.com',
          fetch: (input, init) => globalThis.fetch(input, init),
        })(s.model);
  const started = Date.now();
  let content = '';
  try {
    const result = streamText({
      model,
      system,
      prompt,
      maxOutputTokens: maxTokens,
      maxRetries: 1,
      onError: () => {},
      abortSignal: AbortSignal.any([signal, AbortSignal.timeout(100000)]),
      ...(s.provider === 'deepseek' ? { temperature: 0.2 } : {}),
      providerOptions:
        s.provider === 'openai'
          ? { openai: { store: false, reasoningEffort: 'low' } }
          : { deepseek: { thinking: { type: 'disabled' } } },
    });
    for await (const part of result.fullStream) {
      if (part.type === 'error') throw part.error;
      if (part.type === 'text-delta') {
        content += part.text;
        if (content.length > 60000)
          throw new PlatformError('模型输出超出保存上限');
        await delta(part.text);
      }
    }
    const finish = await result.finishReason,
      usage = await result.usage;
    if (!content.trim() || !['stop', 'length'].includes(finish))
      throw new PlatformError(
        '模型输出为空或未完整结束，请重新测试或重试任务',
        502,
      );
    if (finish === 'length') {
      const note = '\n【输出达到预算上限，请人工检查是否缺少内容】';
      content += note;
      await delta(note);
    }
    return {
      content,
      provider: `${s.provider === 'openai' ? 'OpenAI' : 'DeepSeek'} / ${s.model}`,
      inputTokens: usage.inputTokens || 0,
      outputTokens: usage.outputTokens || 0,
      latencyMs: Date.now() - started,
    };
  } catch (e) {
    console.error(
      'Model stream failed:',
      e instanceof Error ? e.message : 'unknown error',
    );
    if (e instanceof PlatformError) throw e;
    if (signal.aborted) throw e;
    const code = (e as { statusCode?: number })?.statusCode;
    if (code === 401 || code === 403)
      throw new PlatformError(
        `模型鉴权失败（HTTP ${code}），请核对密钥和账户权限`,
        502,
      );
    if (code === 400 || code === 404)
      throw new PlatformError(
        `模型配置无效（HTTP ${code}），请核对模型ID与接口支持`,
        502,
      );
    throw new PlatformError(
      `模型连接暂时失败${code ? `（HTTP ${code}）` : ''}，后台可稍后重试`,
      502,
    );
  }
}
