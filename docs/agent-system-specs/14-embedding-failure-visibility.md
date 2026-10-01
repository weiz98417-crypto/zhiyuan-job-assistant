# Spec 14: Memory Embedding Failure Visibility And Dead Flag Removal

**Target label:** `ready-for-agent`  
**Depends on:** ADR-0028、Spec 13 的发布门禁证据要求；批次归属 0.13.0（A0）

## Problem Statement

Mastra 会话层适配器在 embedder 失败时静默退回 mock 嵌入（`src/lib/memory/mastra-adapter.ts:60-74`）：语义召回实际退化为不可用，但写入与读回全部表现为"成功"，Spec 13 要求的检索质量门禁会拿到看似正常实则退化的基线。同时 `src/lib/agent/feature-flags.ts` 定义 6 个 flag 却没有任何行为消费者——仅 `production-cutover.ts:2` 导入其类型枚举，死接缝误导维护者以为存在渐进切换通道。

## Solution

嵌入失败必须显式可见：运行时显式失败并进入记忆运行时门禁证据，禁止静默回退；删除死 flag 文件。本 spec 是 Spec 15（评分器）的前置——检索类评测依赖可信嵌入。

## User Stories

1. 作为求职者，我希望语义检索失效时系统明确失败或明确标注降级，而不是悄悄返回不相关结果。
2. 作为运维人员，我希望嵌入服务故障在门禁证据与日志中可见，从而不必靠用户反馈才发现召回失效。
3. 作为评测人员，我希望检索基线建立在真实嵌入上，从而评测结论可信。
4. 作为实现 Agent，我希望项目里不存在没有调用方的 feature flag 文件，从而不会误以为存在运行模式切换。

## Implementation Decisions

- embedder 失败（网络、配额、维度不符、超时）一律显式抛错并记录结构化日志；禁止静默回退 mock 嵌入。
- 失败策略只有两种合法形态：整体失败（记忆写入/检索拒绝并进入门禁失败态）或用户可见的明确降级；选择由记忆运行时门禁（`check:memory-release-gates`）证据决定，不在调用点自行静默决定。
- 删除 `src/lib/agent/feature-flags.ts`；`production-cutover.ts` 对 `AgentFeatureFlagName` 的依赖改为本地常量，cutover 运行时检查逻辑保留（2026-10 计划决策 #15）；同步修正 `agent-feature-flags.test.ts` 与 `agent-production-cutover.test.ts`；删除后全仓无悬空引用。
- 不引入新的 feature flag 机制（2026-10 计划决策 #8：无 flag，确定性门禁说话）。

## Testing Decisions

- 回归测试：模拟 embedder 失败，断言无 mock 静默路径、错误可见、门禁证据被记录。
- 删除 flag 后全量测试绿，静态断言全仓无对 `feature-flags` 的残留引用。
- 检索 eval 在嵌入正常与失败两种模式下的行为均有断言。

## Out of Scope

- 不更换嵌入供应商或模型；不加向量索引（属于 Spec 08/10 范围）。
- 不改变 scan-worker 行为（其 Postgres 封锁已在提交 50919be 修复）。

## Further Notes

- 本 spec 完成前，Spec 15 的检索类评测结论不可信；两 spec 串行实施。
