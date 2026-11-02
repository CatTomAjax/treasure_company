# 前海创客中心智慧生态平台

当前应用统一使用 **Node.js + MySQL 8**，数据库名为 `treasure_company`。全部 49 张业务表及迁移、导入、事务锁表使用 `treasure_` 前缀；API、Drizzle 结构和后台 Agent 消费者使用相同表名。

## 运行

要求 Node.js 22.18+、MySQL 8.0.23+（已在 8.0.46 验证）。先配置根目录忽略文件 `.env` 中的 `DATABASE_URL`，参考 `.env.example`。不要提交连接密码或集成密钥。

```powershell
npm ci
npm run db:migrate
npm run build
npm start
```

也可双击 `start.cmd`，默认 API 地址 http://localhost:3003。启动会核对构建版本并执行待应用的 MySQL 迁移。MySQL 连接不可用时启动报错，不回退到其他数据库。开发模式先执行 `npm run db:dev`，再执行 `npm run dev`，使用同一 `DATABASE_URL`；开发隔离需要配置独立库。

## 数据与迁移

- 当前结构：`db/schema.ts`；后端连接与事务：`db/mysql.ts`；SQL 迁移：`drizzle/mysql/`。
- `npm run db:generate` 生成后续迁移，`npm run db:migrate` 应用；已应用 SQL 会检查摘要，不能直接改写。
- 每次迁移分语句记录进度，使用数据库命名锁阻止并发执行。DDL 不能事务回滚，结构异常时应根据日志修复后续步骤。
- 首次将旧本地 SQLite 数据迁入空 MySQL 库，执行 `npm run db:import`；可用 `-- --source=绝对路径` 指定源文件。工具先创建一致性备份，再在单个事务中导入，逐表核对数量与内容 SHA-256；目标业务表已有数据则停止。
- 旧 SQLite 迁移仅归档在 `drizzle/legacy-sqlite/`，不再作为运行数据库。原 `data/v3/d1/` 保留供回退参考。
- 加密集成配置仍使用原 `data/integration-master.key`，升级时须保留。备份应同时包含 **MySQL 数据库导出**及此密钥；仅备份 `data` 已不能备份业务数据。

## 一致性

表使用 InnoDB、utf8mb4 与二进制排序规则；金额继续按整数分保存。批量业务操作在同一连接内事务提交，事务锁串行化写入，保留版本冲突、队列抢占、并发名额及财务总额限制。条件唯一键由生成列实现；重复票据、重复水表序列号、预约/租约/抄表重叠及自动历史仍由数据库约束或触发器保护。

## 验证

```powershell
npm run typecheck
npm run build
npm run test:mysql
npm run test:agents
```

MySQL 集成测试自动创建独立 `treasure_company_qa_*` / `treasure_company_agents_*` 库，成功后删除。业务验收覆盖鉴权、企业隔离、业务流转、财税、并发、工单、PPT；Agent 回归模拟外部模型并真实使用 MySQL 与 LangGraph。真实模型测试另需有效凭据，不能用模拟结果代替真实服务验收。

## 部署与历史

当前产物为 Node 服务器，需可访问 MySQL 的 Node 主机；原 Cloudflare Workers / D1 部署方式不适用于此产物。既有 Sites 站点信息仅保留为历史，不代表已更新线上服务。

本次改动与数据迁移记录见 `docs/MySQL8切换记录.md`。功能背景与旧版交付记录保存在 `docs/历史运行记录_切换MySQL前.md` 和其他既有文档中；其中 D1 与便携运行描述为历史状态。

## 前后端分仓

本仓库为业务 API、MySQL 迁移、后台 Agent、模型集成及业务验收测试。配套前端：https://github.com/CatTomAjax/treasure_company_front 。

默认后端 3003、前端 3002；前端配置 API_BASE_URL=http://127.0.0.1:3003，通过同源代理访问 API，无需浏览器跨域暴露数据库或模型密钥。不要把后端 .env 或 data/integration-master.key 放入前端仓库。
