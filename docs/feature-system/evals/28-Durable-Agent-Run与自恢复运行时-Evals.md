# Durable Agent Run 与自恢复运行时 Evals

## 评测对象

PostgreSQL Durable Run、PM2 Worker、Governed Tool Attempt、Recovery Supervisor、Run Evidence Observer、浏览器 command/query adapter，以及 Worker 与 HTTP Route 共用的 server application services。

## 项目事实

### 关键实现面

- `src/lib/agent/runtime/durable-agent-run.ts`
- `src/lib/agent/runtime/postgres-agent-run-store.ts`
- `src/lib/agent/runtime/agent-worker.ts`
- `src/lib/agent/runtime/durable-orchestrator-engine.ts`
- `src/lib/agent/runtime/governed-tool-attempt.ts`
- `src/lib/agent/runtime/recovery-supervisor.ts`
- `src/lib/agent/runtime/run-evidence-observer.ts`
- `src/worker/agent-worker.ts`

### 已落地或部分落地的 eval 资产

- 状态机、claim/lease/fencing、checkpoint、Gate、取消、child Run 和幂等单元测试。
- Worker 重启、deadline、有界恢复、Context compaction、cursor 重连和 observer dead-letter 故障注入。
- `npm run eval:agent-runtime` 的 20 条业务回归。
- PM2、共享工件目录、发布、预检和回滚的静态部署契约测试。

### 从现有测试读到的行为

- SSE 断开后浏览器改用 cursor polling，不发送 cancel。
- Orchestrator 失败后新的 Worker 仍读取原 durable input，并收到结构化 Recovery 指令。
- governance deny 只拒绝当前 Attempt；未知副作用先对账。
- Review/Eval/投影消费失败进入重试或 dead-letter，不修改 Run 终态。
- 所有 `worker_all` 静态工具通过 Execution Principal 运行，不伪造浏览器 Cookie。

### 待补 eval 缺口

- 使用专用一次性 PostgreSQL 验证真实并发 claim、lease takeover、fencing、checkpoint 和 outbox 事务。
- 在预发布环境验证浏览器关闭、Worker kill、PM2 reload、rollback 与旧工件下载。
- 完成 100% Worker cohort 观察期后，验证删除 legacy client execution fallback。

## 实施与治理任务清单

1. 专用测试库故障注入必须使用 `AGENT_RUNTIME_TEST_DATABASE_URL`，禁止使用 `.env.local` 真实库。
2. 预发布浏览器 E2E 必须覆盖断线不取消、cursor 补齐、等待用户续跑和取消处理中。
3. 生产切流按 `shadow`、`worker_readonly`、5%、25%、100% `worker_all` 推进，每阶段检查 ownership、重复副作用和 dead-letter。
4. 只有 100% cohort 稳定后，才能删除 `legacy` Runner；已被 Worker 领取的 Run 不能交给 legacy 重跑。

## 基线 Evals

### B1. Worker 失败后续跑同一个 Run

**输入/fixture**: 创建包含稳定 `requestId`、用户、Conversation 和原始输入的 Run；第一次 Orchestrator 返回可恢复错误，第二个 Worker 接管。

**执行路径**: Worker A claim 后保存 `before_model` checkpoint 并消费输入；失败写入 Observation/Recovery checkpoint；Worker B 从最新 checkpoint 重建 Context。

**断言**: 两次执行收到相同原始输入，第二次 Context 包含 `RECOVERY` 指令，Run 最终 `succeeded`，预算没有因换 Worker 重置。

**现有覆盖**: `src/__tests__/agent-worker-recovery.test.ts`、`src/__tests__/durable-orchestrator-engine.test.ts`。

### B2. Governed Tool Attempt 完整闭环

**输入/fixture**: 同一 Run 下带 capability、allowlist、幂等键和 read-back 策略的写工具。

**执行路径**: 先持久化 intent，再执行、读回/对账并写结果；重复投递使用同一幂等记录。

**断言**: 高风险写入没有 intent 时不 dispatch；重复请求不重复副作用；读回不一致不能成功。

**现有覆盖**: `src/__tests__/governed-tool-attempt.test.ts`、`src/__tests__/postgres-tool-attempt-store.test.ts`。

## 边界 Evals

### E1. Observer 故障不阻断执行

**输入/fixture**: 一个可成功的 Run 和一个持续失败的 Evidence handler。

**执行路径**: Run 事务写 snapshot/event/outbox；observer 独立消费并超过重试预算。

**断言**: Run 结果保持成功，outbox 进入 `dead_letter`，Admin 可见并可审计重试，敏感字段被脱敏。

**现有覆盖**: `src/__tests__/run-evidence-observer.test.ts`、`src/__tests__/agent-runtime-admin-route.test.ts`。

### E2. 用户和执行能力不串线

**输入/fixture**: 两个用户并发 Run，使用不同 Agent allowlist 和相同工具参数。

**执行路径**: Worker 使用各自 Execution Principal 调用共享 server service。

**断言**: query、write、Gate、Attempt、artifact 和 Evidence 均按用户隔离，一个 Run 的 allowlist 不改变另一个 Run。

**现有覆盖**: `src/__tests__/durable-agent-runtime.test.ts`、`src/__tests__/immutable-tool-registry.test.ts`、`src/__tests__/worker-tool-exposure.test.ts`。

## 回归 Evals

### R1. 旧 checkpoint 覆盖最新输入

**输入/fixture**: 首次模型周期已消费 durable input，随后发生可恢复工具错误。

**执行路径**: catch 分支重新读取最新 checkpoint，再追加 Recovery Observation，而不是使用 claim 前的旧 checkpoint。

**断言**: 第二次 claim 不出现 “Run has no durable input”，原任务文本完整保留且能继续。

**现有覆盖**: `src/__tests__/agent-worker-recovery.test.ts`。

### R2. 监控或治理拒绝终止整个 Run

**输入/fixture**: 一个工具被策略拒绝，同时 allowlist 仍有安全替代工具；另一个 observer handler 超时。

**执行路径**: denial 作为结构化 Tool Result 回灌模型，observer 通过 outbox 重试。

**断言**: Run 可以安全重规划；只有没有安全路径、需批准或预算耗尽时才等待用户/失败。

**现有覆盖**: `src/__tests__/recovery-supervisor.test.ts`、`src/__tests__/server-agent-loop-recovery.test.ts`、`src/__tests__/run-evidence-observer.test.ts`。

## 测试文件映射

- `src/__tests__/durable-agent-run-state.test.ts`
- `src/__tests__/agent-worker-recovery.test.ts`
- `src/__tests__/governed-tool-attempt.test.ts`
- `src/__tests__/recovery-supervisor.test.ts`
- `src/__tests__/run-context-builder.test.ts`
- `src/__tests__/run-evidence-observer.test.ts`
- `src/__tests__/durable-run-client.test.ts`
- `src/__tests__/worker-tool-exposure.test.ts`
- `src/__tests__/agent-worker-deployment.test.ts`
- `src/__tests__/agent-runtime-regressions.eval.test.ts`

## 最小上线门槛

- 类型检查、完整 Vitest、Runtime Eval、Worker 构建、lint 和 Next.js build 全部通过。
- 真实数据库故障注入只能在一次性测试库完成；预发布通过后再扩大生产 cohort。
- ownership/重复副作用/跨用户事故为 0，critical dead-letter 为 0，成功态必须有 Contract 和读回证据。
- `shared/agent-artifacts` 可写且独立于 immutable release，rollback 后旧工件仍可读取。
