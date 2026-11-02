/** Server-owned durable queue consumer. It never uses a browser session or prints credentials. */
export function startAgentWorker(
  runtime,
  { token, pollMs = 750, maxActive = 4, onError = () => {} },
) {
  if (!token) throw new Error('后台消费者凭据缺失');
  const owner = crypto.randomUUID(),
    active = new Map();
  let stopped = false,
    busy = false,
    lastError = '';
  const dbPromise = Promise.resolve(runtime.database),
    now = () => new Date().toISOString();
  async function tick() {
    if (stopped || busy) return;
    busy = true;
    try {
      const db = await dbPromise,
        at = now();
      const lease = await db
        .prepare(
          "INSERT INTO treasure_agent_workers(id,owner,heartbeatAt,leaseUntil) VALUES('default',?,?,?) ON DUPLICATE KEY UPDATE heartbeatAt=IF(owner=VALUES(owner) OR leaseUntil<VALUES(heartbeatAt),VALUES(heartbeatAt),heartbeatAt),owner=IF(owner=VALUES(owner) OR leaseUntil<VALUES(heartbeatAt),VALUES(owner),owner),leaseUntil=IF(owner=VALUES(owner),VALUES(leaseUntil),leaseUntil)",
        )
        .bind(owner, at, new Date(Date.now() + 10000).toISOString())
        .run();
      if (!lease.meta.changes) return;
      // Only expired execution leases can be recovered. Human pause/cancel always wins.
      const orphanCutoff = new Date(Date.now() - 30000).toISOString();
      const stale = (
        await db
          .prepare(
            "SELECT j.id,j.companyId,j.runId,j.generation,j.attempts FROM treasure_agent_jobs j JOIN treasure_agent_runs r ON r.companyId=j.companyId AND r.id=j.runId WHERE j.status='running' AND j.generation=r.generation AND ((r.status IN ('running','checking') AND r.leaseUntil<?) OR (r.status IN ('queued','failed') AND j.updatedAt<?))",
          )
          .bind(at, orphanCutoff)
          .all()
      ).results;
      for (const job of stale) {
        const marker = crypto.randomUUID();
        await db.batch([
          db
            .prepare(
              "UPDATE treasure_agent_runs SET status=?,leaseToken='',leaseUntil='',controlToken=?,version=version+1,updatedAt=? WHERE id=? AND companyId=? AND generation=? AND ((status IN ('running','checking') AND leaseUntil<?) OR (status IN ('queued','failed') AND EXISTS(SELECT 1 FROM treasure_agent_jobs j WHERE j.id=? AND j.status='running' AND j.updatedAt<?)))",
            )
            .bind(
              job.attempts < 3 ? 'queued' : 'failed',
              marker,
              at,
              job.runId,
              job.companyId,
              job.generation,
              at,
              job.id,
              orphanCutoff,
            ),
          db
            .prepare(
              "UPDATE treasure_agent_jobs SET status=?,owner='',token='',availableAt=?,updatedAt=?,lastError='服务中断后租约过期，等待恢复' WHERE id=? AND status='running' AND EXISTS(SELECT 1 FROM treasure_agent_runs WHERE id=? AND controlToken=?)",
            )
            .bind(
              job.attempts < 3 ? 'retry_wait' : 'failed',
              at,
              at,
              job.id,
              job.runId,
              marker,
            ),
          db
            .prepare(
              "INSERT INTO treasure_agent_events(companyId,runId,generation,type,actor,content,createdAt) SELECT ?,?,?,'recovery','后台调度器','执行租约已过期，后台从数据库检查点恢复，已完成岗位不会重做。',? WHERE EXISTS(SELECT 1 FROM treasure_agent_runs WHERE id=? AND controlToken=?)",
            )
            .bind(
              job.companyId,
              job.runId,
              job.generation,
              at,
              job.runId,
              marker,
            ),
        ]);
      }
      // Reconcile terminal runs, including a server stopping just after a final checkpoint.
      await db
        .prepare(
          "UPDATE treasure_agent_jobs SET status=CASE WHEN generation<>(SELECT generation FROM treasure_agent_runs WHERE id=runId) THEN 'cancelled' WHEN (SELECT status FROM treasure_agent_runs WHERE id=runId) IN ('approved','awaiting_review') THEN 'done' WHEN (SELECT status FROM treasure_agent_runs WHERE id=runId)='paused' THEN 'paused' ELSE 'cancelled' END,token='',updatedAt=? WHERE status IN ('queued','retry_wait','running') AND EXISTS(SELECT 1 FROM treasure_agent_runs r WHERE r.id=treasure_agent_jobs.runId AND (r.generation<>treasure_agent_jobs.generation OR r.status IN ('approved','awaiting_review','paused','cancelled')))",
        )
        .bind(at)
        .run();
      const jobs = (
        await db
          .prepare(
            "SELECT j.id,j.companyId FROM treasure_agent_jobs j JOIN treasure_agent_runs r ON r.id=j.runId AND r.companyId=j.companyId WHERE j.status IN ('queued','retry_wait') AND j.availableAt<=? AND j.generation=r.generation AND r.status IN ('queued','failed') ORDER BY j.availableAt,j.createdAt LIMIT 40",
          )
          .bind(at)
          .all()
      ).results;
      const tenants = new Set();
      const ordered = [
        ...jobs.filter((j) => {
          if (tenants.has(j.companyId)) return false;
          tenants.add(j.companyId);
          return true;
        }),
        ...jobs,
      ];
      for (const job of ordered) {
        if (active.size >= maxActive) break;
        if (active.has(job.id)) continue;
        const controller = new AbortController();
        active.set(job.id, controller);
        void runtime
          .dispatchFetch(
            'http://agent-worker.internal/api/platform/agents/worker',
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'x-agent-worker-token': token,
              },
              body: JSON.stringify({ jobId: job.id, owner }),
              signal: controller.signal,
            },
          )
          .then(async (response) => {
            await response.text();
            if (!response.ok) throw new Error('后台消费者返回异常');
          })
          .catch(() => {
            if (!stopped)
              onError('后台消费者连接中断，任务保留在数据库等待租约恢复。');
          })
          .finally(() => active.delete(job.id));
      }
      lastError = '';
    } catch (e) {
      const message = e?.message || '后台队列暂时不可用';
      if (message !== lastError) {
        lastError = message;
        onError('后台队列检查失败，请检查数据库迁移。');
      }
    } finally {
      busy = false;
    }
  }
  const timer = setInterval(() => void tick(), pollMs);
  void tick();
  return {
    owner,
    activeCount: () => active.size,
    tick,
    async stop() {
      stopped = true;
      clearInterval(timer);
      active.forEach((c) => c.abort());
      await Promise.allSettled([
        dbPromise.then((db) =>
          db
            .prepare(
              "UPDATE treasure_agent_workers SET leaseUntil=? WHERE id='default' AND owner=?",
            )
            .bind(now(), owner)
            .run(),
        ),
      ]);
    },
  };
}
