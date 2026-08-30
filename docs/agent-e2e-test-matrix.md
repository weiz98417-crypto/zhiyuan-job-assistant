# Agent E2E 测试集

`npm run e2e:agent` 是 Agent 功能和所有用户页面的统一永久门禁。它自动收集仓库中全部 Vitest 测试，覆盖 Agent、持久 Run、工具治理、恢复、认证、简历、JD、Offer、面试、岗位发现、投递、导出、画像、设置和管理后台，避免只运行某一个 happy path。

## 覆盖矩阵

每个 Agent 任务类型都必须覆盖这些闭环：

- 短输入、超过 20k 字符的长输入、同一 Run 连续三轮
- 暂停、恢复、取消、刷新后重新加载同一个 Run
- 等待用户补充、Run Gate 批准、Run Gate 拒绝
- 临时失败自动恢复、永久失败如实收口、模型/工具超时、服务恢复
- SSE 断开后按 cursor 轮询补齐事件
- 简历读取 → 草稿 → 修改提案 → 批准 → 应用 → 读回 → 刷新
- JD 选择器与下方选中 JD 卡片保持一致（包括 PostgreSQL 字符串 ID）

生产实测发现的高价值问题固定沉淀在 `src/__tests__/agent-production-chain-regressions.eval.test.ts`，覆盖：

- Offer 评估后的解释、谈判和 HR 问询保持在同一 Conversation，并产生可审计 Run
- 否定写入意图不会修改简历、保存画像或沉淀优秀简历
- 账号切换不会从浏览器缓存泄露上一账号简历，面试始终读取服务端简历
- 永久失败保留用户 Turn 和安全失败消息；取消状态不可被恢复逻辑覆盖
- Gate 批准只执行冻结请求一次，历史 Gate 卡片同步最终状态
- 画像引导和模拟面试在每个用户 Turn 边界停下，面试轮数只计算真实回答
- DSML 工具调用可解析但不会泄露到助手正文，Contract 未满足时不得宣告成功
- 管理后台完整展示暂停 Run，刷新后 URL 仍指向原 Conversation

任务清单固定在 `src/lib/agent/agent-e2e-matrix.ts`。新增功能必须先加入任务或流程矩阵，再加入对应测试；修复线上问题必须新增 `*.regression-*.test.ts` 或加入现有闭环测试。所有页面功能测试也必须被 `npm run e2e:agent` 自动收集，不允许通过文件名前缀把测试排除在永久门禁之外。

## 线上验收

本地门禁和生产构建通过后只发布一次，再在服务器 release 目录运行同一套 `npm run e2e:agent`，最后用隔离账号复跑全部 11 类任务的短链路与跨任务长链路。服务器故障注入必须显式设置 `AGENT_RUNTIME_E2E_ALLOW_FAULTS=1` 和预期数据库名，脚本拒绝对未知数据库执行。
