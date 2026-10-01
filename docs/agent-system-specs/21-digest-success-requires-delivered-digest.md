# Spec 21: Digest Success Requires A Delivered Digest

**Target label:** `ready-for-agent`  
**Depends on:** Spec 19、ADR-0039、词表「无人值守 Run」「岗位精选」；批次 0.14.x

## Problem Statement

岗位精选 Run 的两条 stop-guard 判据都被 `get_job_digest` 工具调用标记完成（`task-contract.ts:373-380`）：「digest summary generated」在模型尚未输出任何内容时就已满足。respond 阶段失败的 run 仍以 succeeded 结束，`reconcileFinishedDigestRuns` 记成功并推进水位线——失败在恰好是本功能存在的目的（把精选送到用户面前）的那个点上被记成成功。现有缓解（水位线用 run.createdAt 重叠窗口 + stop-guard 降级文案）把伤害从「永久丢岗位」降为「重复展示 + 可见的未完成文案」，但成功账本仍然是错的。

## Solution

对账加产出校验：精选 Run 只有在其常驻对话中真实落入了本 run 的 digest 内容（respond 阶段的 assistant 消息）才记 succeeded 并推进水位线；否则按失败对账，调度备注说明「精选未送达」，下期精选重读窗口自动覆盖（水位线不推进）。

## User Stories

1. 作为求职者，我依赖每周精选真的出现；没送达的周期应该在下一期补上，而不是被记成成功。
2. 作为运维人员，我希望调度表的 last_status 反映「精选是否真的送达」，从而能回答用户「为什么这周没有精选」。

## Implementation Decisions

- 送达判定：run 终态为 succeeded **且** 其 conversation 在 `run.startedAt` 之后存在该 run 写入的 assistant 消息（worker 单写者，ADR-0030/0036——respond 阶段落库即送达）。stop-guard 的「任务未完成」降级模板文案不算送达。
- reconcile 不送达路径：`lastStatus="not_delivered"`，note 说明「精选未送达，下期将重读本期窗口」；水位线（last_digest_at）不推进——下一期 `since` 仍为本期素材读取点之前，岗位经去重说明重读。
- 不改 stop-guard 判据数量与工具标记机制（「digest summary generated」保留工具标记；送达由对账层校验——两层语义不同：前者管 run 内部的完整性，后者管跨层交付事实）。
- 校验查询按会话批量一次，不逐 run 轮询。

## Testing Decisions

- reconcile 单测：succeeded + 对话有新 assistant 消息 → succeeded 推进水位线；succeeded + 无新消息 → not_delivered、水位线不动、note 正确；failed/cancelled 维持既有行为。
- 「未完成」降级模板文案不计入送达的断言。
- 组合场景：not_delivered 之后的下一期精选 `since` 覆盖本期窗口（含重复岗位的去重说明）。

## Out of Scope

- 不改 stop-guard / Task Program 判据机制本身。
- 不做推送通知渠道（词表「岗位精选」的投递仍指会话内卡片）。

## Further Notes

- 外部声音 #5 的根治项；与 Spec 19 的对账语义衔接：succeeded/failed/cancelled 之外新增 not_delivered 这一 last_status 取值。
