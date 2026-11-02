# 创客中心后端

本仓库为后端权威源码，分支 master。用户指定本机目录 D:/project/treasure_company；配套前端为 D:/project/treasure_company_front。后续后端修改在本仓库进行。使用 Node.js + MySQL 8；业务表使用 treasure_ 前缀。

禁止提交 .env、data/integration-master.key、数据库文件、运行日志与临时验收资料。业务接口沿用登录、企业隔离、同源和版本校验；portraitAnalysis 是系统生成记录，不能开放手工创建。迁移 SQL 一旦应用不能修改已有摘要。

验证 npm run typecheck、npm run build、npm run test:mysql、npm run test:agents、npm run test:portrait:api。集成验收使用隔离测试库，模型调用使用模拟流；不要向真实模型发送测试业务资料。
