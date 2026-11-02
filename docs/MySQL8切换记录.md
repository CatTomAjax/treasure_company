# MySQL 8 全量切换记录

日期：2026-11-03（北京时间）。作用范围为当前中控台项目与本机运行实例。

## 目标与数据

- MySQL 实际版本：8.0.46；连接：127.0.0.1:3306；数据库：treasure_company。
- 按用户最后指定使用下划线库名；全部表及后端 SQL 统一使用 treasure_ 前缀。
- 49 张业务表，加上结构迁移、数据导入记录、事务锁共 52 张表；所有表前缀已实查通过。
- 迁入原 SQLite 的 49 张业务表、47 条记录。每表记录数量与按原字段计算的 SHA-256 一致；同一事务内导入，发生异常会回滚。
- 备份：data/mysql-backups/2026-11-02T19-37-11-486Z/before-mysql.sqlite。
- 逐表校验：同目录 verification.json；原 data/v3/d1/ 文件保留。
- 原有管理员、会话、知识、工单、PPT 工作空间及模型配置已迁移。保留原 data/integration-master.key，已在内存中验证已存集成密文可正常解密，未输出或外发密钥。

## 实现

当前连接层为 db/mysql.ts（mysql2 连接池），Drizzle 使用 MySQL 方言；SQL 迁移位于 drizzle/mysql/，旧 SQLite 迁移归档至 drizzle/legacy-sqlite/。运行入口仍为 start.cmd / npm start，服务改由 Node 承载，数据库失联直接报错。

业务批处理在同一连接事务内执行；写入持有专用行锁，保持原单写者的队列名额与聚合限制。纯读取批处理采用可重复读快照。已适配条件唯一键、JSON 提取、自增事件回读、条件 upsert、受影响行数量、税额分摊截断与更新时的同表子查询限制。

9 个数据库触发器保留空间预约、租约、抄表重叠、应收/分期总额约束及自动历史。历史备份导入使用专用会话标记，避免重复生成审计记录；外键检查始终启用。

## 启动与备份

连接配置位于忽略的 .env，不在源码或客户端产物中保存凭据。启动前运行 npm ci；npm start 会应用尚未执行的迁移，并按源码指纹检查构建。地址为 http://localhost:3002。

后续业务备份需导出 MySQL 的 treasure_company 库（包括结构、数据和触发器），并另外保管集成主密钥。单独复制 data 文件夹不再构成业务数据库备份。

本次未提交、推送或部署线上站点。旧 Sites / Cloudflare 站点元数据保留为历史，当前 Node + MySQL 产物不能用旧 D1 部署方式发布。

## 最终验收

- 验收构建：15ab444d9f11ca2a，Node 生产构建成功；TypeScript 检查、新增数据库/启动工具定向 lint 通过。
- Drizzle 再生成检查无结构差异；正式库再次迁移执行 0 条。
- 11 组隔离 MySQL 业务与 PPT 测试全部通过，包括权限、企业隔离、财务、税务、并发、内容、工单和 PPT 操作闭环。报告：work/mysql8-migration/qa-treasure_company_qa_03ad2c191aa6/report.json。
- 最终 Agent 回归：699 项检查通过，实际最大并发模型流 4，65 次模拟模型请求；验证了 21 个执行任务、79 个岗位、387 条事件的存储及重启恢复。报告：work/agent-qa-6b2631b1/report.json。外部模型使用本地模拟，不代表本轮进行了真实供应商推理验收。
- 后端源代码扫描：旧数据库表名 SQL 引用 0，活动代码中的 console_ / D1 绑定引用 0。
- 3002 当前为本机开发服务；修复 MySQL 驱动在 Vite SSR 中重复打包后，实际 /api/platform/auth 返回 200、initialized=true。运行版本接口显示 database=mysql8、tablePrefix=treasure_。
- 运行入口采用独立构建快照，避免后续构建覆盖正在运行的 Node 生产服务。开发服务通过 Vite 热更新运行。
- 同目录另有并行的业务界面开发，后续源码指纹会继续变化；以上完整回归对应明确记录的构建，不宣称已发布线上。
