# Durable Agent Run 与自恢复运行时

## 0. 实现状态（2026-08-24）

本变更已完成代码实现并进入发布前验证阶段：

- PostgreSQL Durable Run、Event、Checkpoint、Input、Gate、Tool Attempt、Background Job 与 Outbox 数据模型已落地；
- PM2 独立 Worker 已具备 claim、lease、heartbeat、fencing、graceful drain、deadline 与有界并发；
- 失败后会保留最新语义 checkpoint，把结构化 Observation 和 Recovery Action 注入下一模型周期，避免重启后丢输入或盲目重复；
- Recovery Supervisor 已覆盖传输/Provider 重试、参数修正、安全重规划、Context compaction、未知副作用对账、等待用户与预算耗尽后的诚实失败；
- 治理只拒绝精确 Tool Attempt；Review、Eval、Admin 投影、Evidence 与告警通过 outbox 旁路消费；
- 所有静态 Agent 工具已可在 `worker_all` 通过显式 Execution Principal 执行，MCP、模型、OCR 与外部服务传播 AbortSignal 和 deadline；
- 简历摄取、优化、JD/Offer、面试、画像、导出、搜索和健康检查的 HTTP Route 与 Worker 共用 server application service；
- 面试会话每轮持久化并读回，重复 Turn 可恢复上次结果，模型评分不可用时保留回答并继续会话；
- 阿里云 ECS 发布继续使用 Nginx + PM2 + PostgreSQL，Web 与 Worker 共用 release，但工件写入 `$APP_ROOT/shared/agent-artifacts`，不写 immutable release。

尚未在本地连接真实数据库执行的项目只有隔离 PostgreSQL 故障注入和生产浏览器 E2E；它们必须使用专用测试库/预发布环境，禁止对 `.env.local` 的真实生产数据执行写入测试。`legacy` 路径在全量切流和观察期结束前保留，完成 100% cohort 验证后再删除。

## 1. 目标

纸鸢需要把 Agent Run 从浏览器页面附带记录的执行过程，深化为由服务端 Runtime 拥有的持久执行实体。浏览器关闭、SSE 断开、Next.js 重启或 Agent Worker 崩溃后，同一个 Run 应从最后一个安全 checkpoint 继续；治理、监控、Review 与 Eval 的异常不能阻断正常执行。

本设计同时实现四个 deep module：

1. Durable Agent Run
2. Governed Tool Attempt
3. Recovery Supervisor
4. Run Evidence Observer

它保留现有 Agent registry/router、Run Contract、工具治理 metadata、工具 registry、读回验证、Run Review/Eval、Session、UI 卡片、岗位扫描 Worker、PostgreSQL 与阿里云 PM2 发布链路。改造重点是 execution ownership、持久状态、恢复语义和 module locality，不重写已有业务 Agent。

## 2. 实施前根因

- 浏览器页面直接运行 `agentLoopClient`，连接和页面生命周期拥有执行。
- `agent_runs` 与 `agent_run_steps` 主要是旁路记录，无法重建 in-flight execution。
- “Resume”只读取 ledger，没有继续执行。
- client/server 两套 Loop 各自维护错误分类、重试与终止规则。
- 治理拒绝当前动作后会进入不可恢复和 text-only 路径，等价于终止工具能力。
- `repair-policy` 没有生产调用方，`repair-planner` 只服务终态 Review。
- 串行工具、流式读取和 observer 没有统一 deadline。
- 大量工具依赖相对 `/api`、localStorage、IndexedDB 或 DOM，不能直接在独立 Worker 中执行。

## 3. 核心模型

Agent Conversation 同时包含 Conversation Turns 和 Agent Runs。一个 Turn 可以发起 Run，也可以为等待中的 Run 提供信息、纠正或批准。

```text
Agent Conversation
├── Conversation Turn
├── Conversation Turn
└── Agent Run
    ├── Run Contract
    ├── Plan Item
    ├── Run Gate
    ├── Tool Attempt
    ├── Recovery Attempt
    └── Run Evidence
```

一个 Conversation 最多存在一个非终态 Run。不同 Conversation 可以并行执行。简单 Agent 路由仍在同一 Run 内切换 `agent_id`；只有需要独立等待、并发、取消或恢复的委派才创建 child Run。

## 4. 架构

```text
Browser / Agent Chat / Admin
          |
          | commands + cursor-based events
          v
Next.js API adapters
          |
          v
PostgreSQL durable state
  | run snapshot / events / checkpoints / inputs / gates
  | tool attempts / background jobs / outbox
          ^
          |
PM2 Agent Worker
  ├── Durable Agent Run
  ├── Governed Tool Attempt
  ├── Recovery Supervisor
  └── Run Context builder

Outbox consumers
  ├── UI/Admin projection
  ├── Run Evidence projection
  ├── Review / Eval
  └── alerts / retention
```

Next.js API 不执行 Agent Loop。API 只创建 Run、提交 Turn 输入或 Gate 响应、请求取消、读取 snapshot 和订阅 event。SSE 是 observer；连接断开不取消 Run。

## 5. Module 边界

### 5.1 Durable Agent Run

拥有：

- 合法状态迁移；
- Run ownership、claim、lease、heartbeat 与 fencing token；
- checkpoint、Run Context、Plan 游标与恢复预算；
- durable input queue、Run Gate 和 cancel intent；
- parent/child Run 关系；
- Contract 完成与终态判断。

不拥有：

- 具体工具业务逻辑；
- Review/Eval；
- UI 投影；
- 模型或工具内部重试实现。

### 5.2 Governed Tool Attempt

拥有完整工具尝试顺序：

```text
resolve tool capability
-> validate agent allowlist
-> validate Run Contract / Gate
-> persist attempt intent + idempotency key
-> execute with deadline and cancellation
-> read back / reconcile
-> persist structured result
```

每个工具必须声明：风险、deadline class、可取消性、幂等策略、对账策略、读回要求和是否后台化。缺失 metadata 的工具不向模型暴露；其他工具和 Run 仍可继续。

### 5.3 Recovery Supervisor

只根据 durable Observation 与 policy version 选择恢复动作，不直接执行工具。恢复层级为：

1. transport reconnect；
2. 同请求有界 Retry；
3. 参数修正；
4. 等价 provider/transport adapter；
5. 安全替代工具；
6. Context compaction；
7. 对账或回滚；
8. 请求用户信息或批准；
9. 失败并保留部分结果。

真实治理拒绝只拒绝当前 Tool Attempt。治理基础设施异常可以让只读动作降级；高风险写入进入安全等待。checkpoint、事务、幂等和读回始终 fail-closed。

### 5.4 Run Evidence Observer

Runtime 在状态事务中只写最小 outbox。Observer 异步生成 `agent_run_steps`、Admin 投影、Review、Eval 和告警。消费者使用有界批次、指数退避和 dead-letter；backlog 会告警但不改变 Run 结果。

## 6. 状态机

非终态：

- `queued`
- `running`
- `waiting_user`
- `recovering`
- `verifying`
- `cancel_requested`

终态：

- `succeeded`
- `failed`
- `cancelled`

`recovered` 是恢复 metadata，不是终态。`rolled_back` 是失败处理结果。`needs_engineering` 只属于 Review 分类。

```text
queued -> running
running -> verifying -> succeeded
running -> waiting_user -> queued
running -> recovering -> queued/running
running -> cancel_requested -> cancelled
running/recovering/verifying -> failed
```

终态不可变。用户重试终态 Run 时创建带 `parent_run_id` 的新 Run，不复活旧 Run，也不重置旧预算。

## 7. PostgreSQL 持久模型

保留并深化 `agent_runs` 作为当前 snapshot，新增：

- `agent_run_events`
- `agent_run_checkpoints`
- `agent_tool_attempts`
- `agent_run_gates`
- `agent_run_inputs`
- `agent_run_outbox`
- `agent_background_jobs`

`agent_run_steps` 迁移为兼容 Evidence 投影。

每个 Run 具有单调 event sequence、snapshot version 与 fencing token。状态迁移、Run Event、snapshot 和 outbox 在同一个短事务提交。模型和工具 I/O 不放在数据库事务内。Tool Attempt 先提交 intent，执行结束后以新事务提交结果与读回。

历史 Run 标记为 `legacy`，继续可查但不承诺续跑。发布时仍在执行的 legacy Run 自然完成或取消，不强行迁移 in-flight state。

## 8. Claim、Lease 与调度

- 初始生产只运行一个 Agent Worker，但协议支持多 Worker。
- PostgreSQL 原子 claim；`LISTEN/NOTIFY` 唤醒，定时轮询兜底。
- heartbeat 10 秒，lease 30 秒。
- lease 过期后其他 Worker 可接管。
- 所有执行状态写入校验 fencing token，旧 Worker 不能覆盖新 owner。
- 初始最多 2 个 active Run，每个用户最多占用 1 个 active slot。
- 模型、浏览器/OCR 和写工具使用独立 semaphore。
- 后台作业等待不长期占用 Agent Run slot。

Provider/OCR/工具出现系统性故障时使用共享 circuit breaker。半开状态只允许少量探针，避免所有 Run 同时打满 Retry。

## 9. Checkpoint 与运行续跑

Checkpoint 位于语义边界：

- 模型请求前；
- 有副作用 Tool Attempt 分发前；
- 工具结果完成读回后；
- Plan Item 完成后；
- 进入 `waiting_user` 或终态前。

Checkpoint 保存可重建 Context 引用、Run Contract、Plan 游标、已完成 Attempt、恢复预算、待处理 Gate、policy versions 与事实版本。它不逐 token 保存，也不保存 AbortController 等进程对象。

模型流中断时，部分文本保存在短期 `model_interrupted` checkpoint payload；`interrupted` Evidence 只保存长度与 checkpoint 引用，不把部分文本作为完整 Assistant Message 进入恢复 Context。恢复从最后完整 checkpoint 重新请求。模型完整结束后，`after_model` checkpoint 保存完整输出与完成决议；接管 Worker 只补齐 Evidence 和 Conversation 投影，不重复请求模型。

高风险 Tool Attempt 超时或 Worker 崩溃后先自动对账：

- 能证明成功：提交已验证结果；
- 能证明未执行：允许在预算内重试；
- 用户能够安全决定：进入 `waiting_user`；
- 仍无法确认：`failed/manual_reconciliation_required`，不盲目重放。

## 10. Run Context 与 Compaction

Runtime 从 Conversation Turn、Run Contract、Plan、Gate、已完成 Tool Attempt 和事实源引用确定性构建 Run Context。浏览器 messages 不是事实源。

简历、JD、Offer 等使用稳定 ID、版本与哈希。只读时发现新版可以刷新；写入前基础版本变化必须中止 Attempt 并重新规划或请求确认。

模型窗口约 70% 时预压缩，85% 前强制压缩。压缩必须保留：

- Run Contract 与用户约束；
- Gate；
- Plan 进度；
- 未解决失败；
- Tool Attempt 事实；
- 稳定文档引用；
- 被压缩事件范围。

压缩失败时使用上一个有效 snapshot 或经 Gate 切换更大窗口模型，不静默截断关键约束。

## 11. Error Observation 与预算

模型、工具、治理、数据库和 observer 统一产生结构化 Observation：

- category
- stage
- retryability
- effect state
- fingerprint
- user-safe summary
- internal diagnostic reference
- available recovery capabilities

未知工具、参数 JSON 错误、缺少字段和不完整 Tool Call 只让当前模型周期失败，验证错误回灌模型修正。无进展以 Run snapshot、Plan 游标、事实版本、Gate 与 Attempt fingerprint 的组合变化判断，不比较回复文本。

默认预算：

- 瞬态模型请求：最多 3 次 Retry；
- 相同 Tool+Args：最多 2 次自动 Attempt；
- 相同错误指纹：最多 3 次 Recovery Attempt；
- 连续无进展：3 个模型周期；
- 单 Run 模型周期：24 次；
- active wall time：30 分钟；
- `waiting_user`：7 天；
- token 与估算成本：软硬预算均持久化。

预算在 Worker 重启后不重置。耗尽某条策略的预算只禁止重复该策略，仍允许尚未尝试的安全策略。

## 12. Deadline 与 Stall Guard

所有外部等待都必须有 deadline，包括模型连接、首事件、stream idle、Tool Attempt、治理 adapter、读回、checkpoint 和 observer 投递。

默认基线：

- 模型连接/首事件：30 秒；
- 模型 stream idle：45 秒；
- 单次模型 Attempt：180 秒；
- 前台只读工具：30 秒；
- 前台验证写入：60 秒；
- checkpoint/lease 数据库操作：5 秒。

合法长任务转为 durable background job。Tool Attempt 返回稳定 job handle，Run 等待 completion event 或之后续跑。Stall 检测同时使用 lease heartbeat、stream idle、tool progress、相同错误、相同 Tool+Args 和状态无变化。

## 13. 工具服务端化

现有大量工具通过相对 `/api` 调用业务 route，部分还依赖 localStorage、IndexedDB 或 DOM。迁移规则是：

1. 将 route 业务逻辑抽成显式 `Execution Principal` 驱动的 server application service；
2. HTTP route 与 Worker 调用同一 service；
3. Worker 不伪造 Cookie，也不通过内部 HTTP 调用自己；
4. localStorage/IndexedDB 只保留 UI 缓存或迁移用途；
5. 导出改为创建 durable file artifact，UI 只下载；
6. 未服务端化的工具只在 legacy Run 中可用。

迁移批次：

1. 服务端只读查询；
2. 已有事务和读回的 CRUD；
3. JD/Offer/简历/面试模型服务；
4. OCR、导出、MCP 与扫描后台作业；
5. 删除浏览器 execution fallback。

Tool Registry 变为不可变定义表。每次 Attempt 从 Run/Agent Context 获取独立 allowlist，删除全局 `activeAgentTools`。

## 14. API 与 UI

API 只表达 durable command/query：

- 创建 Run；
- 提交 Turn 输入或 Gate 响应；
- 请求取消；
- 读取 Run snapshot；
- 从 cursor 订阅 Run Event。

写 command 必须带客户端 request ID，重复提交返回同一结果。页面与 Admin 不得直接 PATCH 任意状态或追加执行 Step。

SSE 断开不取消 Run。重连携带最后 cursor 补齐事件，失败时轮询 snapshot。UI 显示正在重连、换路径、验证、等待批准、取消处理中和需要人工对账；内部 stack、敏感参数与完整 Evidence 只在 Admin 脱敏展示。

新 Event 使用版本化 envelope，通过 projection adapter 继续支持现有 `uiPayload` 卡片和 Markdown 组件。

## 15. Gate、取消与 Steering

用户批准是有范围的 durable Run Gate，只适用于精确工具、规范化参数和风险。参数或风险改变时必须重新批准。Admin 不得替用户批准业务写入。

运行中普通补充输入写入 durable input queue，在下一个安全点进入 Context。只有明确纠正方向或停止时才中断模型 Attempt；正在提交的高风险副作用先完成或进入对账。

取消先写 `cancel_requested`。Worker 在安全点停止模型或可取消工具、对账进行中的副作用，再写 `cancelled`。UI 在真正停止前显示“取消处理中”。

## 16. 成功语义

只有同时满足下列条件才能 `succeeded`：

- Run Contract 必要条件完成；
- 相关 Tool Attempt 通过读回或 verifier；
- 没有未解决副作用；
- 最终事实版本仍有效。

生成回答、达到轮数或输出部分结果都不等于成功。部分结果会保存并展示，但 Run 仍可是 `failed` 或 `waiting_user`。

## 17. Child Run

需要独立等待、并发、取消或恢复的委派使用 child Run。Child 继承用户、权限与父级总成本上限，拥有独立 lease、checkpoint 与局部恢复预算。默认最大深度 2，每个父 Run 最多 4 个活跃 child。父 Run 取消时向所有未终态 child 发 durable cancel intent。

## 18. 数据安全与保留

- 非终态 Run 保留续跑所需状态；
- 终态 checkpoint 与不可重建 payload 默认 30 天；
- 脱敏 Event、Evidence 与 Review 默认 180 天；
- 最小状态、哈希与审计 ID 可长期保留；
- 用户删除账户时级联删除 Run 数据。

Event、Evidence、outbox、Admin 与 PM2 日志禁止保存 API Key、Cookie、Authorization、数据库 URL、SSH 凭据和完整上传文件。checkpoint 优先保存事实源 ID、版本和哈希，不复制完整简历/JD。

## 19. 阿里云部署

复用现有阿里云 ECS 发布：

- Nginx 对外；
- PM2 管理 Web 与独立 Agent Worker；
- immutable release 目录；
- `current` 原子软链接；
- PostgreSQL/Redis 容器保持不变；
- Worker 不开放 HTTP 端口；
- schema 备份、additive migration、canary、原子切换和旧 release 回滚继续复用。

Worker 构建为同 release 中的独立 Node 产物，生产环境不临时解释 TypeScript，也不由 Next.js 请求进程启动。

## 20. 迁移与切流

运行模式：

- `legacy`
- `shadow`
- `worker_readonly`
- `worker_all`

Shadow 只观察 legacy 执行，不调用模型或工具。任意 Run 只能有一个 execution owner。紧急开关暂停新 claim，并让已领取 Run 在 checkpoint 安全停止，不能把同一 Run交给 legacy 重跑。

上线阶段：

1. 新 schema、状态机和 store；
2. legacy 单独执行，Runtime shadow observation；
3. 服务端只读工具与只读 Run；
4. 低风险验证写入；
5. 高风险写入与 Gate；
6. OCR、导出、MCP 和 background jobs；
7. 全量切流；
8. 删除 client/server 重复 Loop 和浏览器 fallback。

生产按 allowlist、5%、25%、100% 稳定用户哈希扩大流量。只读与写入分别控制。

## 21. 测试与验收

必须具备：

- 状态机和 Recovery Supervisor 单元测试；
- 真实 PostgreSQL claim/lease/fencing/checkpoint/outbox 集成测试；
- 确定性模型/工具 adapter 的完整 Run 测试；
- Worker kill/restart 与 lease takeover；
- 浏览器断开、关闭、重连 E2E；
- 现有 Agent Contract、治理与业务 Eval 回归。

发布硬不变量：

- 同一 Run 同时只有一个有效 owner；
- 高风险副作用不因恢复重复提交；
- governance deny 不终止可恢复 Run；
- observer/Review 故障不改变 Run 结果；
- 预算在重启后不重置；
- `succeeded` 有 Contract 与读回证据；
- SSE 断开不取消 Run；
- 多用户执行身份不串数据。

告警基线：

- Worker 崩溃 45 秒内接管；
- outbox lag 超过 60 秒；
- critical dead-letter 非零；
- `running` heartbeat 超过 45 秒；
- PM2 Worker 连续重启触发 circuit breaker 并暂停 claim。

每个切流阶段必须满足：无 ownership/重复副作用/越权事故，故障注入通过，成功率不低于 legacy，P95 无明显恶化，critical dead-letter 为 0，Evidence 能解释所有失败与恢复。

## 22. 文档迁移

实现时同步更新 `docs/ARCHITECTURE.md`、Agent feature/evolution 文档、Evals 与 OpenSpec。所有仍描述浏览器拥有 Loop、连续两次失败直接终止、Resume 只查询 ledger 的文档必须标记 superseded 或改为新 Runtime 语义。
