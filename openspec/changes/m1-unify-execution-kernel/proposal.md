# Proposal: m1-unify-execution-kernel

## Why

生产执行路径仍是三代并存：`client-runner.ts`（已证实生产零调用）、`remote-runner.ts` → `/api/agent/run` directMode（真实 legacy 路径）、durable Worker。`AGENT_RUNTIME_MODE` 代码默认 `legacy` 且按用户分桶，同用户同类请求会掉入不同路径（PE2E-EXEC-004 非确定行为的根因，见 session 112/119）。loop 逻辑两份手工拷贝已漂移，模型调用链三份拷贝。依据 ADR-0023 与 `docs/UPGRADE-PLAN-2026-09.md` 里程碑 M1。

## What Changes

- 生产显式切换 `worker_all`，以 `execution_owner` 列验证后观察一周
- 删除 `client-runner.ts`、`remote-runner.ts`、`/api/agent/run` directMode 分支及 page.tsx 的 legacy 降级路径
- 补齐 worker 五缺口：interviewState 传递、服务端提示词上下文重建、contract 重建携带 journey artifacts、三类 UI 事件（persist_done/search 进度/offer 状态）、imageIntake 进 Run Admission
- MODEL_CHAIN/流解析三份收编为单一 ModelGateway 模块
- `AGENT_RUNTIME_MODE` 收敛为 `worker_all` 单值

## Impact

- 受影响 spec：`agent-loop-client`、`agent-loop-engine`、`agent-think-proxy`、`react-agent-loop`、`sse-robust-parsing`（归档或改写为 worker 语义）
- 删除依赖 client-runner 的测试（`agent-image-loop.test.ts` 等），迁移覆盖到 worker 路径
- 验收：PE2E 11 类短链路全过 + UI-001 + 行为等价
