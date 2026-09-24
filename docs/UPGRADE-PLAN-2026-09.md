# 纸鸢求职助手 · 全面升级主控计划（2026-09）

本计划由 2026-09-24 架构评审（两份调研报告 + 七轮决策对话）产出，是 M1-M6 升级的唯一主控文档。每个里程碑开工前建 openspec 变更单，合并时归档被取代的 spec/ADR/测试。

## 输入

- 架构评审报告（6 候选 + 13 框架调研）：`%TEMP%/architecture-review-2026-09-24-zhiyuan.html`（临时产物，可能被系统清理；关键结论已沉淀于本计划与 ADR-0026~0028）
- 多 Agent / A2A 专项报告：`%TEMP%/multi-agent-a2a-review-2026-09-24-zhiyuan.html`（同上）
- 生产问题清单（13 条冻结 PE2E）：`docs/agent-production-e2e-issues-2026-08-30.md`
- 代码事实探查（三份）：legacy 路径可达性 / child run 现状 / 记忆子系统现状（2026-09-24，本仓库 dev 分支 @ 44049e1）

## 实施状态（2026-09-24）

- M1 ✅ 提交 d32e18c；M2 ✅ d3686c0；M3 ✅ bffc53b；M4 ✅ 4fc546d；M5 ✅ 7286cb8；M6a ✅（本提交，交接/委派安全卡视图）
- M6b（shadcn/assistant-ui 前端重建）：待视觉稿后独立发布
- M5 Mastra 会话层（working/observational memory）：独立发布（新增依赖 + thread 迁移）
- M4 已知简化：委派以内联子 loop + 事件归因实现，child run 行待 store 支持按 id 认领后启用
- 生产发布动作：`AGENT_RUNTIME_MODE=worker_all`；发布后观察 `execution_owner` 7 天

## 五条总原则

1. **里程碑串行**：每个里程碑独立合并、可发布、可回滚；master 任何时刻可发布。
2. **零 LLM SDK 依赖至 M4**；M5 起 UI/记忆库不受此约束。
3. **每个里程碑走 openspec 流程**，合并时同步归档被取代资产。
4. **升级期间只接 P0 需求**，落在对应里程碑分支内实现。
5. **Schema 只增不破坏**，每里程碑带回滚 flag。

## 里程碑总览

| 里程碑 | 主题 | 解冻的 PE2E | 关键产出 |
| --- | --- | --- | --- |
| M1 | 统一执行内核 + ModelGateway | UI-001 + 短链路全量 | worker 成为唯一执行者；三份模型调用链收编 |
| M2 | IntentEnvelope 路由 | ROUTE-001~004 | 结构化意图分栏；正则栈降为 ≤5 条快路径 |
| M3 | Task Program + loop 协议化 | EXEC-001~004、FLOW-001、PERF-001、GATE-001~002 | 声明式阶段表；工具自述后果；只读并行 |
| M4 | 多 Agent 原语（A2A 契约对齐） | —（承接长链路验收） | 主责交接 + 研究委派 + child run |
| M5 | 记忆重构（分层：Mastra 会话层 + 自研事实账本） | — | 记忆四痛点全治 |
| M6 | UI（a 投影收口 → b 新 UI） | 全量回归 | Conversation Item 投影；shadcn 模式 + assistant-ui |

## M1 · 统一执行内核 + ModelGateway 收编

**合并前事实基线**：`client-runner.ts` 生产零调用（仅测试引用）；真实 legacy 路径 = `agentLoopRemote` → `/api/agent/run` directMode → `agentLoopServer`；`AGENT_RUNTIME_MODE` 代码默认 `legacy`。路径分叉有三个真实机制：① 正则解析不出 taskType 时整块跳过 durable 创建、直接落 legacy（page.tsx `if (taskType)`）；② `worker_readonly` 模式下非只读任务落 legacy；③ durable 创建异常时降级 legacy。注意：cohort 分桶按 userId 哈希、同一用户恒定同桶，**不是**分叉来源；session 112/119 的同类异果更可能来自自由 loop 的模型非确定性叠加两条路径的能力不对称（legacy 有 7 种 forced tool call、worker 没有）。

**动作**：
1. 生产 runtime mode 在发布前由 preflight 验证为 `worker_all`：M1 发布即 cutover，部署后用 `execution_owner` 列监控 7 天异常。`0.10.8` 不保留 directMode 或 legacy escape hatch。
2. 删除：`client-runner.ts`、`remote-runner.ts`、`/api/agent/run` directMode 分支、page.tsx 过时注释与 legacy 降级分支；`AGENT_RUNTIME_MODE` 收敛为仅 `worker_all`（保留读取兼容，写入警告）。
3. 补齐 worker 五缺口：interviewState/interviewRebindAction 传递；服务端重建提示词上下文（interviewContext/rebindContext/guidedDirective）；contract 重建带上客户端 journey artifacts 与 resume baseVersion/baseHash；观察者补 persist_done / search_start / search_result / offer 状态推导；imageIntake 路由结果进入服务端 Run Admission。
4. ModelGateway：`server-runner.callLLM`、`/api/agent/think`、`classify-intent-llm` 三份 MODEL_CHAIN/流解析/tool_call 重组收编为单一模块。

**门禁**：PE2E 11 类短链路全过；UI-001（Gate 终态持久化）随统一部署验收；行为等价（删 legacy 用户无感知）。

## M2 · IntentEnvelope 路由

**动作**：一次结构化输出 LLM 调用产出 `{primaryTask, constraints, referencedMaterials, writePolicy, approvalPolicy}`（zod 校验）；正则降级为 ≤5 条零歧义快路径（"换一批"类）；**低置信/超时一律追问一个精确问题，永不正则猜测**；删除 task-routing/write-intent/classify-hard-rule 正则栈与硬编码化石（城市列表、"AI 产品经理"关键词、垃圾内容正则）。

**门禁**：ROUTE-001~004 解冻全绿（fixture 已在 `src/__tests__/fixtures/agent-production-e2e-backlog.ts`）。

## M3 · Task Program + loop 协议化

**动作**：
1. 声明式阶段表（preflight → clarify/gate → execute → verify → respond）+ 通用解释器；ADR-0019 双深度接口（确定性/对话型）；首批 `resume_edit`、`jd_evaluation`、`job_search`。
2. ToolDefinition 自述后果策略（followup 提示/响应风格/终态/waitUser），loop 去除 10+ 工具名特判与三份重复 followup 指令。
3. 7 种 forcedToolCall 上移为 Program 阶段动作（pendingReferenceResumeSave、proposal apply/discard/rollback、图片简历导入、resume save plan、job_search 扫描、简历草稿强制）。
4. 恢复只读工具并行执行（action 类永远串行）。

**参考实现**：pi-agent-core 极简 loop、LangGraph interrupt/Command(resume) 语义、Mastra suspend/resume 快照。
**门禁**：EXEC-001~004 + FLOW-001 + PERF-001（阶段过程轨道上线）+ GATE-001~002（Program 的 gate 阶段把「批准→执行→读回」变成状态机强制推进，替代自由 loop 的恢复语义）。

## M4 · 多 Agent 原语（A2A 契约对齐）

**动作**：
1. handoff（主责交接）：沿合法任务转换图（`task-journey.ts`）的边，交接元数据 `{reason, artifactIds}` 结构化，onHandoff 钩子先查权限再放行；图外交接需用户确认。
2. 委派（研究委派）：一期只读研究型子 agent；child run `session_id` 置 NULL、`parent_run_id` 归因（列已存在，深度≤2/同父≤4/取消级联已实现）；`/api/agent/runs` POST 补 `parentRunId` 入参；engine 增加创建 child run 的代码路径；`claimNextRun` 增加父子优先级。
3. outputSchema：委派方声明输出 schema，子 run respond 阶段必须满足。
4. **A2A 契约对齐**（不跑网络协议）：内部消息用 AgentCard 式能力声明（description/inputSchema/outputSchema）、Task 生命周期状态机、Message/Part 结构建模；未来拆服务/接第三方时包一层 `@a2a-js/sdk` 传输适配器即为合规端点。
5. 治理：Run Gate 请求显示完整委派链（tool, params, acting_agent, parent_run）；子 agent 白名单 = 父 ∩ 子。

**门禁**：组合求职旅程长链路（Offer→HR 问询、JD→简历→面试）+ 多 agent 协作用例（图内交接、只读委派与归因树、Gate 卡显示委派链）。

## M5 · 记忆重构（分层）

**事实基线**：4 套并行记忆存储互不同步；写入无条件 INSERT 无冲突消解；纯向量检索无 ANN 索引无混合检索；`career_positioning` 掉入 DEFAULT_DENY；admin 不能编辑记忆文本。

**架构（ADR-0028）**：
- **会话层 = Mastra Memory 直接引入**（`@mastra/core` + `@mastra/pg`）：resource=用户、thread=Conversation；working memory blocks + 语义召回 + observational memory（观察/反思双档，pi 派成品实现）。
- **长期层 = 自研 Postgres 事实账本**：bi-temporal 三表（episodes append-only / entities 演化摘要 / facts 带 valid_at·invalid_at·source_episode_id），矛盾时作废而非覆盖；结构化求职画像（目标岗位/城市偏好/底线/黑名单等 topic/sub_topic 字段集，纯 SQL 不走向量）；记忆分区（MemCube 式命名空间 + 显式读写列表，取代任务型 memory-policy）；admin 增加编辑记忆文本与生命周期视图。
- **写入管线**：确定性完成事件即时写（JD 评估完成、简历保存成功等带证据事实）+ 对话信号后台批量 flush（闲置/token 阈值）；提取升级为 Mem0 两段式（抽取候选 → 与相似旧事实比对 → ADD/UPDATE/DELETE/NOOP + 理由落库）。
- **检索**：HNSW 索引 + 混合检索（向量 + BM25 + 实体链接）+ 现有 5 因子 rerank。
- 两层连接：会话 observations → 候选事实 → 写入决策 → 账本。
- 开工先跑对照组基准（Mem0 TS SDK），用现有 eval harness 出基线数值。
- 优先级：画像/账本/检索为核心（P0），观察/反思随 Mastra 引入（P1，不阻塞合并）。

**门禁**：记忆 eval harness 首次记录基线与提升数值；矛盾消解用例（时序变更问题）；检索 hit@k 对比基线。

## M6 · UI（a 投影收口 → b 新 UI）

**M6a**：服务端 Conversation Item 投影，事件方言唯一（参考 AG-UI 事件类型学）；UI 只发命令（提交 Turn/响应 Gate）+ 消费投影。
**M6b**：shadcn/ui 模式（Radix+Tailwind，代码自有）用于用户侧产品页，antd 留 admin；assistant-ui（ExternalStoreRuntime）承载聊天界面，领域卡片（岗位发现结果卡/报告卡）作为自定义组件；视觉翻新、信息架构不动；设计稿 M1 起即可并行启动。M6a 前验证 assistant-ui 与 React 19/Next 16 兼容性。

**门禁**：13 条 PE2E 全量回归 + 刷新/断线恢复 + 全部长链路。

## 非目标

- 不引入 Trigger.dev/Inngest/LangGraph 运行时；不整体引入 Mastra agent 框架（仅用其 Memory）。
- 无离线能力承诺（Dexie 仅作会话缓存）。
- 交互/信息架构本次不动。
- A2A 网络协议推迟到第三方 agent 接入需求出现（内部先契约对齐）。

## 决策记录（2026-09-24 七轮对话）

| # | 决策 | 结论 |
| --- | --- | --- |
| 1 | 升级形态 | 里程碑串行，各自可发布可回滚 |
| 2 | 零依赖原则 | 至 M4 自研；M5 起 UI/记忆库放开 |
| 3 | 多 agent 权限边界 | 交接沿转换图；委派一期只读；Run Gate 语义不变 |
| 4 | 升级期功能 | 只接 P0，落里程碑分支 |
| 5 | 验收 | PE2E 按集群分里程碑门禁 |
| 6 | 生产 runtime mode | M1 第一步程序化验证（worker_all + execution_owner 核查） |
| 7 | worker UI 事件缺口 | M1 补齐（行为等价的一部分） |
| 8 | 并行工具执行 | M3 恢复，仅只读工具 |
| 9 | child run 归属 | session_id 置 NULL，parent_run_id 归因 |
| 10 | 新产品能力 | M6 之后基于新架构交付 |
| 11 | IntentEnvelope 兜底 | 白名单 ≤5；低置信/超时一律追问，永不猜测 |
| 12 | Task Program 形态 | 声明式数据对象 + 通用解释器 |
| 13 | 交接上下文 | 过滤式注入（元数据 + artifact 摘要 + 最近 N 轮，剥工具日志） |
| 14 | 前端架构 | shadcn 模式（用户侧）+ antd（admin）+ assistant-ui（聊天） |
| 15 | 委派摘要 | 委派方声明 outputSchema |
| 16 | A2A | 契约对齐（AgentCard/Task/Message 词汇），不跑网络协议 |
| 17 | 记忆痛点 | 矛盾过时 + 检索相关 + 写入校准（a+b+d） |
| 18 | 记忆里程碑位置 | M4 之后、UI 之前（M5） |
| 19 | 记忆路线 | 分层：Mastra 会话层直接引入 + 自研长期事实账本（B'） |
| 20 | 记忆写入 | 双时机（确定性事件即时 + 对话信号后台 flush）+ 两段式决策 |
| 21 | 生产 cutover 验证 | 用户放弃预检，选择 M1 发布即 cutover；删路径与 worker_all 切换同批上线，escape-hatch 回滚 flag + 部署后 execution_owner 监控兜底 |

## 风险与依赖

- 依赖链：M2←M1 网关；M3←M1；M4←M1+M3；M5←M4（多 agent 消费记忆定型）；M6b←M6a。
- 最大风险：M1 行为等价（五缺口），以观察期 + execution_owner 核查兜底。
- Mastra Memory 的 resource/thread 抽象与 Conversation/Agent Run 的映射是 M5 第一个验证点，不匹配则回退全自研（A 路线保留为预案）。

## ADR

`ADR-0023`–`ADR-0025` retain the `0.10.7` behavior decisions. The `dev` decisions for M1, M4, and M5 are renumbered as `ADR-0026`, `ADR-0027`, and `ADR-0028` respectively; all milestone references in this plan use the new numbers.

- ADR-0026：durable worker 为唯一执行者（legacy 路径删除）
- ADR-0027：治理式交接 + 只读委派的多 agent 协作
- ADR-0028：分层记忆（Mastra 会话层 + Postgres 事实账本）
