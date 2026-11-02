import { env } from '@/lib/server-env';
import {
  body,
  digest,
  failure,
  PlatformError,
  reply,
  str,
} from '@/lib/platform-auth';
import { consumeJob } from '@/lib/agent-queue';
export async function POST(request: Request) {
  try {
    const expected = (env as unknown as { AGENT_WORKER_TOKEN?: string })
      .AGENT_WORKER_TOKEN;
    const supplied = request.headers.get('x-agent-worker-token') || '';
    if (
      !expected ||
      !supplied ||
      (await digest(supplied)) !== (await digest(expected))
    )
      throw new PlatformError('无权调用后台消费者', 403);
    const b = await body(request, 3000);
    await consumeJob(str(b, 'jobId'), str(b, 'owner'), request.signal);
    return reply({ ok: true });
  } catch (e) {
    return failure(e);
  }
}
