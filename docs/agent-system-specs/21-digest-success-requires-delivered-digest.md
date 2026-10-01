# Spec 21: Digest Success Requires A Delivered Digest

**Target label:** `ready-for-agent`  
**Depends on:** Spec 19、ADR-0039、ADR-0030/0036（transcript 单写者）、词表「无人值守 Run」「岗位精选」；批次 0.14.x

## Problem Statement

岗位精选 Run 的两条 stop-guard 判据都被 `get_job_digest` 工具调用标记完成（`task-contract.ts:378-383`）：「digest summary generated」在模型尚未输出任何内容时就已满足。respond 阶段失败的 run 仍以 succeeded 结束，`reconcileFinishedDigestRuns` 记成功并推进水位线——失败在恰好是本功能存在的目的（把精选送到用户面前）的那个点上被记成成功。现有缓解（水位线用 run.createdAt 重叠窗口 + stop-guard 降级文案）把伤害从「永久丢岗位」降为「重复展示 + 可见的未完成文案」，但成功账本仍然是错的。

## Solution

对账加产出校验：精选 Run 在其时间窗内、于常驻对话中真实落入了 assistant 消息（respond 阶段产物）且该消息**不是** stop-guard 的「任务未完成」降级文案（按结构化标记判定，不按文案字符串）才记 succeeded 并推进水位线；否则按 `not_delivered` 对账，调度备注说明「精选未送达」，下期精选重读窗口自动覆盖（水位线不推进）。

## User Stories

1. 作为求职者，我依赖每周精选真的出现；没送达的周期应该在下一期补上，而不是被记成成功。
2. 作为运维人员，我希望调度表的 last_status 反映「精选是否真的送达」，从而能回答用户「为什么这周没有精选」。

## Implementation Decisions

- **查询载体（按字面实现会系统性误判的点）**：durable 模式下 worker 经 memory adapter 落库、`sessions.messages_json` 不更新——送达校验必须走 durable 读回路径（`readSessionRowsWithDurableMessages` / `session-api-readback` 同源），**禁止**直查 messages_json。
- **时间窗归属**：`AgentRunSnapshot` 没有 `startedAt`（只有 `createdAt`/`updatedAt`）；送达窗口 = `[run.createdAt, run.updatedAt]` 内创建的 assistant 消息。`AgentMessage` 无 runId/requestId 元数据，时间窗是第一期唯一归属手段——残余误判窗口（窗口内用户在精选对话手动聊出的 assistant 消息被计入）作为已知限制记录；升级路径（消息 metadata 标记 digestRunId）列为后续可选项，第一期不做。
- **降级文案的结构化标记**：给 `incompleteResponse`（`task-program.ts:90-96`）加机器标记前缀（仿同函数 `nudgeMessage` 已有的 `<!-- system:program-stop-guard -->` 先例，`:84`），送达判定按标记排除，不做文案字符串匹配。
- reconcile 不送达路径：`lastStatus="not_delivered"`，note 说明「精选未送达，下期将重读本期窗口」；`last_digest_at` 不推进（与 `advanceSchedule` 现有 COALESCE 语义一致），下一期 `since` 仍为本期素材读取点之前，岗位经去重说明重读。
- 不改 stop-guard 判据数量与工具标记机制——两层语义不同：判据管 run 内部完整性，送达校验管跨层交付事实。
- **写侧顺序前提（回归锚点）**：现有安全依赖 `saveConversation` 先于 run 终态事件返回（`durable-orchestrator-engine.ts:789` 先于 `:798-806`）——「succeeded 但消息未落库」目前不可能发生；该顺序若被调整会静默破坏本判定，测试清单必须有锚定它的回归断言。

## Testing Decisions

- reconcile 单测：succeeded + 窗口内有非标记 assistant 消息 → succeeded 推进水位线；succeeded + 窗口内只有标记消息或无消息 → not_delivered、水位线不动、note 正确；failed/cancelled 维持既有行为。
- 降级标记断言：`incompleteResponse` 输出带结构化标记；标记使用 HTML 注释形态（对用户不可见，markdown 渲染不显示），降级文案的用户可见呈现与加标记前完全一致；送达判定按标记排除。
- 查询载体断言：durable 模式（messages_json 不更新）下送达判定仍正确——防「直查 messages_json」的回归。
- 组合场景：not_delivered 之后的下一期精选 `since` 覆盖本期窗口（含重复岗位的去重说明）。
- 写侧顺序回归锚点：succeeded 事件到达时对话消息已可读（防 finalize 顺序调整的静默破坏）。

## Out of Scope

- 不改 stop-guard / Task Program 判据机制本身。
- 不做消息 metadata 的 runId 归属（第一期用时间窗 + 已知限制；升级路径另立）。
- 不做推送通知渠道（词表「岗位精选」的投递仍指会话内卡片）。

## Further Notes

- 外部声音 #5 的根治项；与 Spec 19 的对账语义衔接：`last_status` 新增 `not_delivered` 取值（全仓无其他消费方，新增安全）。
