import { Annotation, StateGraph, START, END } from '@langchain/langgraph/web';
import { database } from './store';
import { PlatformError } from './platform-auth';
import { agentModel } from './agent-model';
import { tasksFor } from './agent-store';
import { allowedCitations, checkCitations, normalizeCitations, permittedRecords } from './agent-checks';
import { capabilities } from './agent-catalog';
import type {
  AgentEvent,
  AgentRun,
  AgentSpec,
  KnowledgeSource,
} from './agent-catalog';
export class AgentInterrupted extends Error {}
const stamp = () => new Date().toISOString();
export async function claimRun(r: AgentRun) {
  if (
    r.authorization?.destination !== (r.snapshot.model?.destination||'https://api.deepseek.com') ||
    r.authorization.generation !== r.generation
  )
    throw new PlatformError('请先明确授权本执行版本的数据范围', 403);
  const token = crypto.randomUUID(),
    at = stamp();
  const result = await database()
    .prepare(
      "UPDATE treasure_agent_runs SET status='running',leaseToken=?,leaseUntil=?,version=version+1,updatedAt=? WHERE id=? AND companyId=? AND version=? AND (status IN ('queued','paused','failed') OR (status IN ('running','checking') AND leaseUntil<?))",
    )
    .bind(
      token,
      new Date(Date.now() + 150000).toISOString(),
      at,
      r.id,
      r.companyId,
      r.version,
      at,
    )
    .run();
  if (!result.meta.changes)
    throw new PlatformError('任务已在执行、已完成或版本已变化，请刷新', 409);
  return { ...r, status: 'running', version: r.version + 1, leaseToken: token };
}
export async function executeRun(
  run: AgentRun,
  send: (event: AgentEvent) => void,
  signal: AbortSignal,
  background = false,
) {
  const db = database(),
    token = run.leaseToken!,
    aborter = new AbortController();
  const aliveSql =
    "EXISTS (SELECT 1 FROM treasure_agent_runs WHERE id=? AND companyId=? AND generation=? AND leaseToken=? AND status IN ('running','checking'))";
  const args = () => [run.id, run.companyId, run.generation, token];
  const alive = async () =>
    !!(await db
      .prepare(`SELECT 1 AS ok WHERE ${aliveSql}`)
      .bind(...args())
      .first());
  const check = async () => {
    if (signal.aborted || aborter.signal.aborted || !(await alive()))
      throw new AgentInterrupted();
  };
  const emit = async (
    type: string,
    actor: string,
    content: string,
    taskId = '',
  ) => {
    const result = await db
      .prepare(
        `INSERT INTO treasure_agent_events(companyId,runId,taskId,generation,type,actor,content,createdAt) SELECT ?,?,?,?,?,?,?,? WHERE ${aliveSql}`,
      )
      .bind(
        run.companyId,
        run.id,
        taskId,
        run.generation,
        type,
        actor,
        content,
        stamp(),
        ...args(),
      )
      .returning('seq').all<AgentEvent>();
    if (!result.results.length) throw new AgentInterrupted();
    send(result.results[0]);
  };
  const stop = () => aborter.abort();
  signal.addEventListener('abort', stop, { once: true });
  let heartbeatBusy = false;
  const heartbeat = setInterval(() => {
    if (heartbeatBusy) return;
    heartbeatBusy = true;
    void (async () => {
      const result = await db
        .prepare(
          "UPDATE treasure_agent_runs SET leaseUntil=? WHERE id=? AND leaseToken=? AND status IN ('running','checking')",
        )
        .bind(new Date(Date.now() + 150000).toISOString(), run.id, token)
        .run();
      if (!result.meta.changes) aborter.abort();
    })()
      .catch(() => aborter.abort())
      .finally(() => {
        heartbeatBusy = false;
      });
  }, 1500);
  const slots = new Set<string>();
  async function slot(taskId: string) {
    const owner = crypto.randomUUID(),
      deadline = Date.now() + 60000;
    while (Date.now() < deadline) {
      await check();
      for (let id = 0; id < 8; id++) {
        const at = stamp();
        const result = await db
          .prepare(
            "INSERT INTO treasure_agent_slots(id,companyId,runId,token,expiresAt) SELECT ?,?,?,?,? WHERE (SELECT COUNT(*) FROM treasure_agent_slots WHERE companyId=? AND expiresAt>?)<4 ON DUPLICATE KEY UPDATE companyId=IF(expiresAt<?,VALUES(companyId),companyId),runId=IF(expiresAt<?,VALUES(runId),runId),token=IF(expiresAt<?,VALUES(token),token),expiresAt=IF(expiresAt<?,VALUES(expiresAt),expiresAt)",
          )
          .bind(
            id,
            run.companyId,
            run.id,
            owner,
            new Date(Date.now() + 125000).toISOString(),
            run.companyId,
            at,
            at,
            at,
            at,
            at,
          )
          .run();
        if (result.meta.changes) {
          slots.add(owner);
          return owner;
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
    await emit(
      'queue',
      '调度器',
      '并发名额繁忙，已完成岗位会保留；可稍后恢复。',
      taskId,
    );
    throw new PlatformError('等待并发名额超时，请恢复执行', 503);
  }
  const selectSources = (spec: AgentSpec): KnowledgeSource[] => {
    if (!spec.capabilities.includes('knowledge')) return [];
    const terms = [
      ...new Set(
        (run.goal + ' ' + run.input + ' ' + spec.instructions).match(
          /[\u4e00-\u9fff]{2}|[a-z0-9]{3,}/gi,
        ) || [],
      ),
    ];
    return run.snapshot.sources
      .filter(
        (s) => !spec.knowledgeIds?.length || spec.knowledgeIds.includes(s.id),
      )
      .map((s) => ({
        s,
        score: terms.reduce(
          (n, t) =>
            n + (s.title.includes(t) ? 4 : 0) + (s.content.includes(t) ? 1 : 0),
          0,
        ),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 6)
      .map((x) => ({ ...x.s, content: x.s.content.slice(0, 5000) }));
  };
  const tasks = await tasksFor(run);
  async function branch(index: number) {
    const task = tasks[index];
    if (!task) return 'skipped';
    let owner = '';
    try {
      await check();
      if (task.status === 'completed' && task.generation === run.generation) {
        await emit(
          'reuse',
          task.spec.name,
          '复用本执行版本已完成的岗位成果。',
          task.id,
        );
        return 'completed';
      }
      if (task.attempt >= 3)
        throw new PlatformError(
          '当前岗位已执行3次，请人工修订决策以生成新的执行版本',
        );
      await emit('queued', task.spec.name, '等待并发名额。', task.id);
      owner = await slot(task.id);
      await check();
      const sources = selectSources(task.spec);
      await db
        .prepare(
          `UPDATE treasure_agent_tasks SET status='running',content='',sources=?,error='',attempt=attempt+1,startedAt=?,finishedAt='' WHERE id=? AND ${aliveSql}`,
        )
        .bind(JSON.stringify(sources), stamp(), task.id, ...args())
        .run();
      await emit(
        'started',
        task.spec.name,
        `开始执行；能力：${task.spec.capabilities.map((id) => capabilities.find((c) => c.id === id)?.name || id).join('、')}；引用${sources.length}条知识快照。`,
        task.id,
      );
      let pending = '',
        content = '',
        last = 0;
      const flush = async (force = false) => {
        if (
          !pending ||
          (!force && pending.length < 180 && Date.now() - last < 250)
        )
          return;
        await check();
        const text = pending;
        pending = '';
        last = Date.now();
        const result = await db.batch([
          db
            .prepare(
              `UPDATE treasure_agent_tasks SET content=? WHERE id=? AND ${aliveSql}`,
            )
            .bind(content, task.id, ...args()),
          db
            .prepare(
              `INSERT INTO treasure_agent_events(companyId,runId,taskId,generation,type,actor,content,createdAt) SELECT ?,?,?,?,'delta',?,?,? WHERE ${aliveSql}`,
            )
            .bind(
              run.companyId,
              run.id,
              task.id,
              run.generation,
              task.spec.name,
              text,
              stamp(),
              ...args(),
            ).returning('seq'),
        ]);
        if (!result[0].meta.changes) throw new AgentInterrupted();
        for (const event of result[1].results)
          send(event as unknown as AgentEvent);
      };
      const output = await agentModel(
        run,
        task.spec,
        sources,
        null,
        async (text) => {
          content += text;
          pending += text;
          await flush();
        },
        aborter.signal,
      );
      await flush(true);
      await check();
      output.content = normalizeCitations(output.content,allowedCitations(run,task.spec,sources));
      if (checkCitations(output.content, allowedCitations(run, task.spec, sources)).invalid.length)
        throw new PlatformError(
          '岗位成果引用了未授权或版本不符的知识，已阻止进入汇总；请修订或重试。',
        );
      const result = await db
        .prepare(
          `UPDATE treasure_agent_tasks SET status='completed',content=?,provider=?,inputTokens=inputTokens+?,outputTokens=outputTokens+?,error='',finishedAt=? WHERE id=? AND ${aliveSql}`,
        )
        .bind(
          output.content,
          output.provider,
          output.inputTokens,
          output.outputTokens,
          stamp(),
          task.id,
          ...args(),
        )
        .run();
      if (!result.meta.changes) throw new AgentInterrupted();
      await emit(
        'completed',
        task.spec.name,
        '岗位成果已保存，等待其他分支与统一核对。',
        task.id,
      );
      return 'completed';
    } catch (e) {
      if (e instanceof AgentInterrupted || !(await alive()))
        return 'interrupted';
      const message =
        e instanceof PlatformError
          ? e.message
          : '模型输出或连接异常，请恢复执行；过程记录已保存。';
      await db
        .prepare(
          `UPDATE treasure_agent_tasks SET status='failed',error=?,finishedAt=? WHERE id=? AND ${aliveSql}`,
        )
        .bind(message, stamp(), task.id, ...args())
        .run();
      await emit('failed', task.spec.name, message, task.id);
      return 'failed';
    } finally {
      if (owner) {
        await db
          .prepare("DELETE FROM treasure_agent_slots WHERE token=?")
          .bind(owner)
          .run();
        slots.delete(owner);
      }
    }
  }
  async function review() {
    await check();
    const completed = await tasksFor(run);
    if (
      completed.some(
        (t) => t.status !== 'completed' || t.generation !== run.generation,
      )
    ) {
      await emit(
        'failed',
        '调度器',
        '存在未完成岗位，汇总已阻止。恢复时仅重试失败或中断岗位。',
      );
      await db
        .prepare(
          "UPDATE treasure_agent_runs SET status='failed',version=version+1,leaseToken='',leaseUntil='',updatedAt=? WHERE id=? AND leaseToken=?",
        )
        .bind(stamp(), run.id, token)
        .run();
      return;
    }
    await db
      .prepare(
        "UPDATE treasure_agent_runs SET status='checking' WHERE id=? AND leaseToken=?",
      )
      .bind(run.id, token)
      .run();
    await emit(
      'checking',
      '汇总核对员',
      '全部岗位完成，开始核对事实、数字、引用、分歧和缺失。',
    );
    let pending = '',
      content = '',
      last = 0;
    const flush = async (force = false) => {
      if (
        !pending ||
        (!force && pending.length < 200 && Date.now() - last < 250)
      )
        return;
      await check();
      const text = pending;
      pending = '';
      last = Date.now();
      await db
        .prepare("UPDATE treasure_agent_runs SET summary=? WHERE id=? AND id=? AND companyId=? AND generation=? AND leaseToken=? AND status IN ('running','checking')")
        .bind(content, run.id, ...args())
        .run();
      await emit('delta', '汇总核对员', text);
    };
    const spec: AgentSpec = {
      id: 'review',
      name: '汇总核对员',
      capabilities: [
        'review',
        ...(run.policy.capabilities.includes('knowledge')
          ? ['knowledge' as const]
          : []),
      ],
      instructions:
        '将全部独立岗位成果统一汇总。每项保留负责岗位，检查不一致金额日期、来源ID版本、范围冲突、材料缺口和预算截断。不要把缺失变成已完成，不可消除分歧。',
      criteria:
        '统一成果、交叉核对、待确认事项；区分有来源的结论与需要人工决定的事项。',
    };
    const cited = new Map(
      completed.flatMap((t) => t.sources).map((s) => [s.id, s]),
    );
    const reviewRecords = [...new Map(completed.flatMap(t =>
      permittedRecords(run, t.spec)).map(record => [record.id, record])).values()];
    let owner = '';
    try {
      owner = await slot('');
      const output = await agentModel(
        run,
        spec,
        [...cited.values()],
        completed.map((t) => ({
          role: t.spec.name,
          capabilities: t.spec.capabilities,
          content: t.content,
          sources: t.sources.map((s) => ({ id: s.id, version: s.version })),
          records: permittedRecords(run,t.spec),
        })),
        async (text) => {
          content += text;
          pending += text;
          await flush();
        },
        aborter.signal,
      );
      await flush(true);
      await check();
      output.content = normalizeCitations(output.content,[...cited.values(),...reviewRecords]);
      const checks = JSON.stringify({
        completed: completed.length,
        expected: tasks.length,
        sources: [...cited.values()].map((s) => ({
          id: s.id,
          version: s.version,
        })),
        warnings: [
          ...(run.sceneId === 'knowledge' &&
          run.snapshot.sources.some((s) => !cited.has(s.id))
            ? ['部分批量资料未被任何岗位引用，须核对岗位的独立知识限制']
            : []),
          ...(checkCitations(output.content, [...cited.values(), ...reviewRecords]).invalid.length
            ? ['汇总成果存在未匹配的来源或版本，人工确认前须修订引用']
            : []),
          ...(!cited.size ? ['尚无已确认知识依据，须人工补充或核实'] : []),
          ...completed
            .filter((t) => checkCitations(t.content, allowedCitations(run,t.spec,t.sources)).missing)
            .map((t) => `${t.spec.name}未标注知识引用，须人工核对`),
          ...(completed.some((t) => t.content.includes('输出达到预算上限'))
            ? ['存在岗位输出达到预算上限']
            : []),
        ],
        reviewProvider: output.provider,
        inputTokens: output.inputTokens,
        outputTokens: output.outputTokens,
      });
      await emit(
        'awaiting_review',
        '汇总核对员',
        '统一成果与交叉核对已保存，等待管理员或经理人工确认。',
      );
      await db
        .prepare(
          "UPDATE treasure_agent_runs SET status='awaiting_review',summary=?,checks=?,version=version+1,leaseToken='',leaseUntil='',updatedAt=? WHERE id=? AND leaseToken=? AND generation=?",
        )
        .bind(output.content, checks, stamp(), run.id, token, run.generation)
        .run();
    } finally {
      if (owner) {
        await db
          .prepare("DELETE FROM treasure_agent_slots WHERE token=?")
          .bind(owner)
          .run();
        slots.delete(owner);
      }
    }
  }
  try {
    await emit(
      'running',
      '调度器',
      `并行任务已启动；本任务同时最多${run.policy.concurrency}个岗位，企业共享4个、平台共享8个执行名额。`,
    );
    const State = Annotation.Root({
      results: Annotation<Record<string, string>>({
        reducer: (a, b) => ({ ...a, ...b }),
        default: () => ({}),
      }),
    });
    const graph = new StateGraph(State)
      .addNode('a', async () => ({ results: { a: await branch(0) } }))
      .addNode('b', async () => ({ results: { b: await branch(1) } }))
      .addNode('c', async () => ({ results: { c: await branch(2) } }))
      .addNode('d', async () => ({ results: { d: await branch(3) } }))
      .addNode('review', async () => {
        await review();
        return { results: { review: 'done' } };
      })
      .addEdge(START, 'a')
      .addEdge(START, 'b')
      .addEdge(START, 'c')
      .addEdge(START, 'd')
      .addEdge(['a', 'b', 'c', 'd'], 'review')
      .addEdge('review', END)
      .compile();
    await graph.invoke(
      { results: {} },
      { maxConcurrency: run.policy.concurrency },
    );
  } catch (e) {
    if (await alive()) {
      if (signal.aborted || e instanceof AgentInterrupted) {
        await emit(
          background ? 'failed' : 'paused',
          '调度器',
          background
            ? '后台执行连接中断，将由队列从已保存岗位恢复。'
            : '执行连接已断开，任务已暂停；重新打开后可恢复，已完成岗位会复用。',
        );
        await db
          .prepare(
            "UPDATE treasure_agent_runs SET status=?,version=version+1,leaseToken='',leaseUntil='',updatedAt=? WHERE id=? AND leaseToken=?",
          )
          .bind(background ? 'failed' : 'paused', stamp(), run.id, token)
          .run();
      } else {
        await emit(
          'failed',
          '调度器',
          e instanceof PlatformError
            ? e.message
            : '汇总或编排失败，任务记录已保存，请恢复执行。',
        );
        await db
          .prepare(
            "UPDATE treasure_agent_runs SET status='failed',version=version+1,leaseToken='',leaseUntil='',updatedAt=? WHERE id=? AND leaseToken=?",
          )
          .bind(stamp(), run.id, token)
          .run();
      }
    }
  } finally {
    clearInterval(heartbeat);
    aborter.abort();
    signal.removeEventListener('abort', stop);
    for (const owner of slots)
      await db
        .prepare("DELETE FROM treasure_agent_slots WHERE token=?")
        .bind(owner)
        .run();
  }
}
