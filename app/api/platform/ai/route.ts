import { produceText as produce } from '@/lib/platform-ai';
import { textModelSettings } from '@/lib/integration-secrets';
import { env } from '@/lib/server-env';
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
import {
  allRecords,
  createRecord,
  getRecord,
  newRecord,
  updateRecord,
} from '@/lib/platform-service';
import type { BusinessRecord } from '@/lib/platform-config';
type Step = {
  id: string;
  step: number;
  status: string;
  version: string;
  content: string;
};
export async function POST(request: Request) {
  let lock: { runId: string; token: string } | undefined;
  try {
    const b = await body(request),
      companyId = str(b, 'companyId'),
      { user, tenant } = await context(request, companyId, true),
      actor = { user, role: tenant.role },
      action = str(b, 'action');
    const r = await getRecord(companyId, str(b, 'id'));
    if (r.version !== str(b, 'version'))
      throw new PlatformError('记录已变化，请刷新', 409);
    const db = database();
    if (action === 'step.approve') {
      requireManager(tenant.role);
      if (r.kind !== 'aiRun') throw new PlatformError('记录类型无效');
      const step = await db
        .prepare(
          "SELECT * FROM treasure_business_ai_steps WHERE id=? AND runId=? AND companyId=?",
        )
        .bind(str(b, 'stepId'), r.id, companyId)
        .first<Step>();
      if (!step || step.status !== '待确认')
        throw new PlatformError('步骤不存在或已确认', 409);
      const total = [r.data.role1, r.data.role2, r.data.role3].filter(
        Boolean,
      ).length;
      const next = {
        ...r,
        status: step.step === total ? '已完成' : '待执行',
        version: crypto.randomUUID(),
        updatedAt: new Date().toISOString(),
      };
      await updateRecord(next, r, actor, '人工确认AI步骤', [
        db
          .prepare(
            "UPDATE treasure_business_ai_steps SET status='已确认',content=?,version=? WHERE id=? AND status='待确认'",
          )
          .bind(str(b, 'content', 50000), crypto.randomUUID(), step.id),
      ]);
      return reply({ record: next });
    }
    if (action === 'run.next') {
      if (r.kind !== 'aiRun' || r.status !== '待执行')
        throw new PlatformError('请先确认当前步骤，或创建新的工作流', 409);
      const token = crypto.randomUUID(),
        now = new Date().toISOString();
      const claim = await db
        .prepare(
          "INSERT INTO treasure_business_ai_locks(runId,token,expiresAt) VALUES(?,?,?) ON DUPLICATE KEY UPDATE token=IF(expiresAt<?,VALUES(token),token),expiresAt=IF(expiresAt<?,VALUES(expiresAt),expiresAt)",
        )
        .bind(r.id, token, new Date(Date.now() + 90000).toISOString(), now, now)
        .run();
      if (!claim.meta.changes)
        throw new PlatformError('该工作流正在执行，请稍后刷新', 409);
      lock = { runId: r.id, token };
      const steps = (
        await db
          .prepare("SELECT * FROM treasure_business_ai_steps WHERE runId=? ORDER BY step")
          .bind(r.id)
          .all<Step>()
      ).results;
      if (steps.some((s) => s.status !== '已确认'))
        throw new PlatformError('上一步尚未人工确认', 409);
      const step = steps.length + 1,
        roleId = [r.data.role1, r.data.role2, r.data.role3].filter(Boolean)[
          step - 1
        ];
      if (!roleId) throw new PlatformError('没有待执行岗位');
      const role = await getRecord(companyId, roleId);
      if (role.status !== '已确认') throw new PlatformError('岗位须先审核确认');
      const output = await produce(
        r.data.goal,
        role,
        await allRecords(companyId),
        steps.at(-1)?.content || '',
        r.data.input,
        r.id,
      );
      const next = {
        ...r,
        status: '待人工确认',
        version: crypto.randomUUID(),
        updatedAt: new Date().toISOString(),
      };
      await updateRecord(next, r, actor, `执行岗位 ${role.title}`, [
        db
          .prepare(
            "INSERT INTO treasure_business_ai_steps(id,companyId,runId,step,roleId,content,sources,provider,inputTokens,outputTokens,status,version,createdAt) VALUES(?,?,?,?,?,?,?,?,?,?,'待确认',?,?)",
          )
          .bind(
            crypto.randomUUID(),
            companyId,
            r.id,
            step,
            roleId,
            output.content,
            JSON.stringify(output.sources),
            output.provider,
            output.inputTokens,
            output.outputTokens,
            crypto.randomUUID(),
            next.updatedAt,
          ),
      ]);
      return reply({ record: next });
    }
    if (action === 'material.generate') {
      if (r.kind !== 'material' || r.status !== '草稿')
        throw new PlatformError('请先退回草稿再生成');
      const role = newRecord(companyId, 'aiRole', '内容编辑', user.name, {
        instructions: '根据真实资料整理标题、正文、章节与待确认项。',
        knowledgeLayer: '全部已确认知识',
        criteria: '可编辑的中文正文；引用来源与版本，缺失数据明确待确认。',
        tokenBudget: '3000',
      });
      const output = await produce(
        r.title,
        role,
        await allRecords(companyId),
        '',
        r.data.brief,
        r.id,
      );
      const next = {
        ...r,
        data: {
          ...r.data,
          content: output.content,
          sources: output.sources
            .map((s) => `${s.title} / ${s.id} / ${s.version}`)
            .join('\n'),
          pending: '需核对客户事实、金额、时间及对外承诺',
        },
        version: crypto.randomUUID(),
        updatedAt: new Date().toISOString(),
      };
      await updateRecord(next, r, actor, `生成内容：${output.provider}`);
      return reply({ record: next, provider: output.provider });
    }
    if (action === 'knowledge.distill') {
      if (r.kind !== 'knowledge' || r.status !== '已确认')
        throw new PlatformError('请先审核确认来源资料');
      const role = newRecord(companyId, 'aiRole', '知识整理', user.name, {
        instructions: '整理原始资料为业务规则、流程、FAQ，严格保留事实与来源。',
        knowledgeLayer: '全部已确认知识',
        criteria: '知识草稿；注明事实、规则与待核实项。',
        tokenBudget: '3000',
      });
      const output = await produce(
        '整理业务知识：' + r.title,
        role,
        [r],
        '',
        r.data.content,
        r.id,
      );
      const k = newRecord(
        companyId,
        'knowledge',
        r.title + ' · 整理',
        user.name,
        {
          layer: r.data.layer === '原始资料' ? '业务知识' : '岗位经验',
          category: r.data.category,
          content: output.content,
          source: `${r.id} / ${r.version}`,
          projectId: r.data.projectId || '',
          correction: '请人工核实整理结果',
        },
      );
      return reply({ record: await createRecord(k, actor) }, 201);
    }
    throw new PlatformError('AI操作无效');
  } catch (e) {
    return failure(e);
  } finally {
    if (lock)
      await database()
        .prepare("DELETE FROM treasure_business_ai_locks WHERE runId=? AND token=?")
        .bind(lock.runId, lock.token)
        .run();
  }
}
