import { database } from '@/lib/store';
import {
  body,
  context,
  failure,
  PlatformError,
  reply,
  str,
} from '@/lib/platform-auth';
import {
  localPptDate,
  seedPptState,
  type PptState,
  type PptItem,
} from '@/lib/ppt-model';
import { afterPptSave, runPptOperation } from '@/lib/ppt-operations';

async function load(companyId: string) {
  const row = await database()
    .prepare("SELECT state,version FROM treasure_ppt_workspaces WHERE companyId=?")
    .bind(companyId)
    .first<{ state: string; version: string }>();
  if (!row) return { state: seedPptState(), version: 'initial' };
  const stored = JSON.parse(row.state) as PptState,
    seed = seedPptState();
  return {
    state: {
      ...stored,
      settings: { ...seed.settings, ...stored.settings },
      collections: { ...seed.collections, ...stored.collections },
    },
    version: row.version,
  };
}
export async function GET(request: Request) {
  try {
    const companyId =
      new URL(request.url).searchParams.get('companyId') || 'park';
    await context(request, companyId);
    return reply({ ...(await load(companyId)), mode: 'demo' });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    const b = await body(request, 1000000),
      companyId = str(b, 'companyId'),
      { user } = await context(request, companyId, true),
      old = await load(companyId);
    if (str(b, 'version') !== old.version)
      throw new PlatformError('页面已被其他成员更新，请刷新后重试', 409);
    const state = old.state,
      action = str(b, 'action');
    let message = '';
    if (action === 'item.save') {
      const collection = str(b, 'collection');
      if (!Object.hasOwn(state.collections, collection))
        throw new PlatformError('数据类型无效');
      const value = b.item;
      if (!value || typeof value !== 'object' || Array.isArray(value))
        throw new PlatformError('记录无效');
      const clean: Record<string, string> = {};
      for (const [k, v] of Object.entries(value)) {
        if (
          !/^[a-zA-Z][a-zA-Z0-9]*$/.test(k) ||
          typeof v !== 'string' ||
          v.length > (k === 'content' ? 280000 : 60000)
        )
          throw new PlatformError('字段无效');
        clean[k] = v;
      }
      if (!clean.title?.trim() || clean.title.length > 200)
        throw new PlatformError('请填写名称（最多200字）');
      if (
        collection === 'scenes' &&
        (!Number.isFinite(Number(clean.seconds)) ||
          Number(clean.seconds) < 0.25 ||
          Number(clean.seconds) > 120)
      )
        throw new PlatformError('镜头时长须为0.25至120秒');
      if (
        collection === 'contents' &&
        clean.status === '已发布' &&
        clean.checks !== '111'
      )
        throw new PlatformError('请完成三项内容复核后发布');
      if (
        clean.amount !== undefined &&
        (!Number.isFinite(Number(clean.amount)) || Number(clean.amount) < 0)
      )
        throw new PlatformError('金额须为有效非负数字');
      for (const field of ['before', 'after', 'price', 'area', 'seats', 'rate'])
        if (
          clean[field] !== undefined &&
          (!Number.isFinite(Number(clean[field])) || Number(clean[field]) < 0)
        )
          throw new PlatformError('用时、单价、面积和工位数须为有效非负数字');
      if (
        clean.ratio !== undefined &&
        !['16:9', '1:1', '9:16', '4:3', '3:4'].includes(clean.ratio)
      )
        throw new PlatformError('请选择有效画面比例');
      const list = state.collections[collection];
      if (list.length >= 500 && !list.some((x) => x.id === clean.id))
        throw new PlatformError('演示空间单类最多500条记录');
      const index = list.findIndex((x) => x.id === clean.id),
        saved = { ...clean, id: clean.id || crypto.randomUUID() } as PptItem;
      afterPptSave(
        state,
        collection,
        saved,
        index >= 0 ? list[index] : undefined,
        user.name,
      );
      if (index < 0) list.push(saved);
      else list[index] = saved;
      message = `保存${saved.title}`;
    } else if (action === 'item.delete') {
      const collection = str(b, 'collection'),
        id = str(b, 'id');
      if (!Object.hasOwn(state.collections, collection))
        throw new PlatformError('数据类型无效');
      state.collections[collection] = state.collections[collection].filter(
        (x) => x.id !== id,
      );
      message = '删除演示记录';
    } else if (action === 'scenes.reorder') {
      const ids = b.ids;
      if (
        !Array.isArray(ids) ||
        ids.length !== state.collections.scenes.length ||
        new Set(ids).size !== ids.length ||
        ids.some((id) => !state.collections.scenes.some((s) => s.id === id))
      )
        throw new PlatformError('镜头顺序无效');
      state.collections.scenes = ids.map((id) =>
        state.collections.scenes.find((s) => s.id === id)!,
      );
      message = '镜头顺序已保存';
    } else if (action === 'settings.save') {
      const value = b.settings;
      if (!value || typeof value !== 'object' || Array.isArray(value))
        throw new PlatformError('配置无效');
      for (const [k, v] of Object.entries(value)) {
        if (
          !Object.hasOwn(state.settings, k) ||
          typeof v !== 'string' ||
          v.length > 3000
        )
          throw new PlatformError('配置字段无效');
        if (
          ['videoRatio', 'brandRatio'].includes(k) &&
          !['16:9', '1:1', '9:16', '4:3', '3:4'].includes(v)
        )
          throw new PlatformError('画面比例无效');
        if (
          k === 'videoSpeed' &&
          (!Number.isFinite(Number(v)) || Number(v) < 0.25 || Number(v) > 4)
        )
          throw new PlatformError('播放速度须为0.25至4倍');
        if (k === 'brandColor' && !/^#[0-9a-f]{6}$/i.test(v))
          throw new PlatformError('品牌色无效');
        if (k === 'cashOpeningBalance' && !Number.isFinite(Number(v)))
          throw new PlatformError('期初资金须为有效数字');
        state.settings[k] = v;
      }
      message = '保存工作台配置';
    } else if (action === 'workflow.advance') {
      const run =
        state.collections.runs.find((r) => r.id === state.settings.activeRun) ||
        state.collections.runs[0];
      if (!run) throw new PlatformError('请先创建协同任务');
      let stage = Number(run.stage || state.settings.workflowStage);
      if (stage >= 4) throw new PlatformError('流程已归档');
      if (stage === 2 && b.approved !== true)
        throw new PlatformError('请先人工审核成果');
      stage++;
      state.settings.workflowStage = String(stage);
      run.stage = String(stage);
      run.status = stage >= 4 ? '已归档' : stage === 3 ? '待归档' : '执行中';
      if (
        stage === 2 &&
        !state.collections.documents.some((d) => d.runId === run.id)
      ) {
        state.collections.documents.unshift({
          id: crypto.randomUUID(),
          title: run.title + ' · 方案初稿',
          type: 'Word',
          content:
            run.content +
            '\n\n执行计划：需求确认、方案执行、人工审核、成果归档。',
          status: '待审核',
          runId: run.id,
          owner: user.name,
          date: localPptDate(),
          outline: '任务目标\n方案内容\n执行计划\n审核事项',
          pages: '4',
        });
        state.collections.contents.unshift({
          id: crypto.randomUUID(),
          title: run.title + ' · 推广文案',
          content: run.content,
          status: '待审核',
          runId: run.id,
          type: '品牌内容',
          channel: '站内',
          owner: user.name,
          date: localPptDate(),
          checks: '000',
        });
        state.collections.designs.unshift({
          id: crypto.randomUUID(),
          title: run.title + ' · 宣传海报',
          headline: run.title,
          subtitle: '业务方案 · 待人工审核',
          image: 'material-wave.jpg',
          custom: '1',
          ratio: '16:9',
          runId: run.id,
          status: '待审核',
          owner: user.name,
        });
        if (!run.project) {
          const id = crypto.randomUUID();
          state.collections.projects.unshift({
            id,
            title: run.title,
            content: run.content,
            owner: user.name,
            progress: '0',
            status: '待开始',
            date: localPptDate(),
            runId: run.id,
          });
          run.project = id;
          for (const title of ['需求复核', '方案执行', '成果验收'])
            state.collections.tasks.push({
              id: crypto.randomUUID(),
              title,
              project: id,
              content: run.content,
              owner: user.name,
              progress: '0',
              status: '待开始',
              priority: '中',
              date: localPptDate(),
              checks: '核对范围,形成成果,人工审核',
            });
        }
        state.settings.activeProject = run.project;
      }
      if (stage === 4)
        state.collections.knowledge.push({
          id: crypto.randomUUID(),
          title: run.title + '交付复盘',
          status: '已发布',
          content:
            run.content +
            '\n\n已确认交付方案与项目执行方法，由负责人审核后归档。',
          sources: 'src-1,src-3',
          category: '岗位经验',
          roles: '项目经理',
        });
      message =
        stage === 3
          ? '人工审核已通过，成果等待归档'
          : stage === 4
            ? '成果已归档，经验已回流知识库'
            : 'AI岗位已完成当前阶段（本地规则模式）';
    } else if (action === 'knowledge.ask') {
      const question = str(b, 'question', 2000),
        words = [
          ...new Set(question.match(/[\u4e00-\u9fff]{2}|[a-z0-9]{3,}/gi) || []),
        ],
        articles = state.collections.knowledge.filter(
          (x) => x.status === '已发布',
        );
      const ranked = articles
        .map((x) => ({
          x,
          score:
            words.reduce(
              (n, w) =>
                n + (x.title.includes(w) ? 5 : x.content.includes(w) ? 1 : 0),
              0,
            ) +
            (question.includes('空间') && x.title.includes('开通') ? 10 : 0),
        }))
        .filter((x) => x.score > 0)
        .sort((a, b) => b.score - a.score);
      const article = ranked[0]?.x;
      return reply({
        ...old,
        answer: article
          ? `根据企业知识库「${article.title}」：\n${article.content}`
          : '知识库暂无匹配资料，请补充资料后重试。',
        sources: article?.sources?.split(',') || [],
        provider: 'local',
      });
    } else if (action === 'content.generate') {
      const title = str(b, 'title', 200);
      const brief = typeof b.brief === 'string' ? b.brief.slice(0, 10000) : '';
      state.collections.contents.unshift({
        id: crypto.randomUUID(),
        title,
        status: '草稿',
        type:
          typeof b.type === 'string'
            ? String(b.type).slice(0, 100)
            : '招商文案',
        channel: '微信公众号',
        owner: user.name,
        date: localPptDate(),
        content: `${title}\n\n${brief ? `创作要求\n${brief}\n\n` : ''}在前海创客中心，为下一次创新找到生长的空间。\n\n围绕企业知识、项目协同与合作服务，让团队专注打造产品、连接伙伴、创造价值。\n\n欢迎联系园区运营团队，了解空间与企业服务方案。\n\n【本地规则草稿：请在发布前核实房源、价格及服务承诺。】`,
        checks: '000',
      });
      message = '已按本地规则生成内容草稿';
    } else if (action === 'policy.advance') {
      const policy =
        state.collections.policies.find((p) => p.id === b.id) ||
        state.collections.policies[0];
      const stage = Number(policy.stage || '0');
      if (stage >= 3) throw new PlatformError('该发文流程已完成');
      state.settings.policyStage = String(stage + 1);
      policy.stage = String(stage + 1);
      policy.status = ['草稿', '待审核', '已推送', '已跟进'][stage + 1];
      if (stage === 1) {
        state.collections.contents.push({
          id: crypto.randomUUID(),
          title: '政策定向推送通知',
          status: '已发布',
          type: '政策通知',
          channel: '站内通知',
          owner: user.name,
          date: localPptDate(),
          content: policy.headline,
          checks: '111',
        });
      }
      message = [
        '发文已提交人工审核',
        '审核通过，已生成站内定向通知',
        '回执跟进已记录',
      ][stage];
    } else message = runPptOperation(state, action, b, user.name);
    state.events.push({
      id: crypto.randomUUID(),
      title: message,
      content: `${user.name} · PPT演示空间`,
      time: new Date().toLocaleTimeString('zh-CN', {
        timeZone: 'Asia/Shanghai',
        hour: '2-digit',
        minute: '2-digit',
      }),
      date: localPptDate(),
      type: action.includes('workflow') ? 'review' : 'file',
    });
    state.events = state.events.slice(-100);
    const version = crypto.randomUUID(),
      encoded = JSON.stringify(state);
    const result =
      old.version === 'initial'
        ? await database()
            .prepare(
              "INSERT INTO treasure_ppt_workspaces(companyId,state,version,updatedAt) VALUES(?,?,?,?) ON DUPLICATE KEY UPDATE companyId=companyId",
            )
            .bind(companyId, encoded, version, new Date().toISOString())
            .run()
        : await database()
            .prepare(
              "UPDATE treasure_ppt_workspaces SET state=?,version=?,updatedAt=? WHERE companyId=? AND version=?",
            )
            .bind(
              encoded,
              version,
              new Date().toISOString(),
              companyId,
              old.version,
            )
            .run();
    if (!result.meta.changes)
      throw new PlatformError('页面已更新，请刷新后重试', 409);
    return reply({ state, version, message, mode: 'demo' });
  } catch (e) {
    return failure(e);
  }
}
