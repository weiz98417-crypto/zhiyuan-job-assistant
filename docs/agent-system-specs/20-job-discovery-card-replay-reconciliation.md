# Spec 20: Job Discovery Card Replay Reconciliation

**Target label:** `ready-for-agent`  
**Depends on:** ADR-0020、ADR-0030/0036（transcript 单写者）、词表「Conversation Item」「岗位发现结果卡」；优先级 hotfix（0.13.x/0.14.x 第一项）

## Problem Statement

岗位发现 Run 卡在创建瞬间把瞬时状态写进持久化 transcript（`scan-portals.ts:114/163` 写入的是 `readBack.status`——新建扫描落 `pending`、恢复进行中扫描落 `running`，均为瞬时值），扫描终态只存在于 scan_queue 表、从不同步回 transcript。回放链路没有任何 reconcile：`use-agent-conversation.tsx:708` 直接 `setMessages`，`transcript-merge.ts:104` 以服务端为准原样合并——与 Run Gate 的对账机制（`run-gate-message-status.ts` / `execution-session-service.ts:60`）不对称。用户点开历史对话，早已完成的搜索卡片永远显示「运行中」。失速放大器：无 scanId 时状态默认落 `pending` → 卡片判定 active 永久转圈；轮询 `/api/scan/status` 404/401 时 spinner 不消失。

## Solution

**对账放服务端读回层，一次成型**：durable 路径的消息在 `session-api-readback.ts:21-44` 组装、legacy 路径在 `GET /api/sessions` 读回——在这两处组装点按卡内 scanId 批量查 scan_queue 终态、覆写 `uiPayload.status` 后再返回。这样所有客户端注入点（首屏 hydrate、会话切换、run 事件后的反复 merge）拿到的都是已对账数据：`mergeServerTranscript` 的「服务端为准」恰好成为正确的传播机制，而不是覆盖对账结果的敌人。渲染层加兜底（无 scanId 或查无记录 → 非进行中呈现；轮询失败停止 spinner）。

## User Stories

1. 作为求职者，我点开上周的对话时，已完成的岗位发现卡片显示真实结果，而不是永远转圈。
2. 作为求职者，一次扫描找不到记录时，卡片明确告诉我状态未知，而不是假装还在搜索。
3. 作为实现 Agent，我希望对账在读回层一次完成，从而不必在每个客户端注入点重复修复逻辑。

## Implementation Decisions

- 新增 scan-data 批量函数 `getScanStatusesForUser(userId, scanIds)`：单条 SQL `WHERE id = ANY($2)`（scan_queue 主键列是 `id`；含 `updated_at`，作为终态时间来源），替代逐卡 N 次 `/api/scan/status` 请求。
- 读回层对账（服务端，钩子挂 `readSessionRowsWithDurableMessages` **入口**——它在 legacy 驱动下会原样早退，挂 postgres 分支之后会静默漏掉 legacy 模式）：`reconcileJobDiscoveryRunMessages(messages, scanStatuses)` 只动 `payload.type === "job_discovery_run"` 的条目，覆写 `uiPayload.status` 与 `resolvedAt`（取 scan_queue.updated_at）；`surface-projection` 的 job_discovery_run 字段白名单同步补 `resolvedAt`（否则投影剥掉它，覆写了也到不了卡片）。
- 终态映射（scan_queue 实际词表）：`done` → `done`；`failed` → `failed`；`canceled` → `canceled`（卡片呈现「已停止」，非 active）；**查无记录或卡内无 scanId → `unknown`**（呈现「状态未知」，非 active）——两种「无事实源」情况同规则，不留自相矛盾。
- 读回层对账不改持久化 transcript（读时投影，非写回）；会话数据保持单写者原则（ADR-0030/0036）。
- 渲染兜底（`AgentDomainCards.tsx:1322-1331,1339-1406`）：`status` 为 `unknown` 或缺失 scanId 时不得落入默认 `pending`/active 判定；轮询失败时停止 spinner 与「运行中」标题，降级为「状态未知」。
- 与 Run Gate 对账的关系：Gate 是双端（服务端喂模型上下文 + 客户端决策修正）；本 spec 只做读回端——卡片是 UI 投影概念，不进 Run Context（当前 run-context 序列化不消费 toolResult/uiPayload；若未来把卡片摘要喂给模型，此论断需重审），不需要 worker 侧对账。

## Testing Decisions

- reconcile 纯函数单测：`pending`/`running` 卡 + `done`/`failed`/`canceled` 终态 → 各自覆写；查无记录与无 scanId → `unknown`；非 job_discovery_run 消息原样通过。
- 读回层集成断言：`session-api-readback`（postgres 与 legacy 两条驱动路径）、`GET /api/sessions` 列表、`GET /api/sessions/[id]` 单会话——返回的消息均含覆写后状态。
- 渲染兜底单测：`unknown` 卡片不显示进行中；轮询 404 后 spinner 消失、显示状态未知。
- 回归：现有 AgentDomainCards / use-agent-conversation / session-api-readback 测试全绿。

## Out of Scope

- 不改 scan-portals 写入协议与 uiPayload 形状（写入协议变更另立决策，先观察读回对账效果）。
- 不修 scan_queue 孤儿运行（对账后仍为 running 是真实状态，属扫描子系统缺陷）。
- 不为其他工具卡补对账（`evaluate_jd_full` 工具内 await 到完成，无「进行中」卡落库，无同病）。

## Further Notes

- 根因证据链：`AgentDomainCards.tsx:1322-1331`（status 判定）、`scan-portals.ts:111-127/160-176`（瞬时写入）、`use-agent-conversation.tsx:708-713`（无对账回放）、`transcript-merge.ts:88-110`（服务端为准合并）、`scan-worker.mjs:349/368/397` 与 `scan-data.ts:284`（终态词表 done/failed/canceled）。
- 与 Spec 04 的关系：本 spec 是「UI 读持久投影」原则在回放路径的补课——投影没有的终态，由读回层对账从事实源（scan_queue）补齐。
