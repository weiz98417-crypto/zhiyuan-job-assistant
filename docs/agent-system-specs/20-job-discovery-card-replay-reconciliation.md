# Spec 20: Job Discovery Card Replay Reconciliation

**Target label:** `ready-for-agent`  
**Depends on:** ADR-0020、ADR-0030/0036（transcript 单写者）、词表「Conversation Item」「岗位发现结果卡」；优先级 hotfix（0.13.x/0.14.x 第一项）

## Problem Statement

岗位发现 Run 卡在创建瞬间把瞬时状态写进持久化 transcript（`scan-portals.ts:114/163` 的 `uiPayload.status="running"`），扫描终态只存在于 scan_queue 表、从不同步回 transcript。回放链路没有任何 reconcile：`use-agent-conversation.tsx:708` 直接 `setMessages`，`transcript-merge.ts:104` 以服务端为准原样合并——与 Run Gate 拥有的双端 reconcile（`run-gate-message-status.ts` / `execution-session-service.ts:60`）形成直接不对称。用户点开历史对话，早已完成的搜索卡片永远显示「岗位发现运行中」。两处失速放大器：无 scanId 时状态默认落 `pending` → 卡片判定 active 永久转圈；轮询 `/api/scan/status` 404/401 时 spinner 不消失。

## Solution

仿 Run Gate 的对账机制新增 `reconcileJobDiscoveryRunMessages`：会话加载时按卡内 scanId 批量查询 scan_queue 终态，覆写 `uiPayload.status` 与结束时间为真实终态；渲染层加兜底（无 scanId 视为已结束、轮询失败停止 spinner 降级为「状态未知」）。渲染条件本身不改——输入正确时它是合理的。

## User Stories

1. 作为求职者，我点开上周的对话时，已完成的岗位发现卡片显示真实结果，而不是永远转圈。
2. 作为求职者，一次扫描找不到记录时，卡片明确告诉我状态未知，而不是假装还在搜索。
3. 作为实现 Agent，我希望搜索卡与 Run Gate 用同一种对账模式，从而不必理解两套状态修复逻辑。

## Implementation Decisions

- 新增纯函数 `reconcileJobDiscoveryRunMessages(messages, scanStatuses)`（仿 `run-gate-message-status.ts`）：输入消息数组与 scanId→终态映射，输出覆写后的消息；只动 `payload.type === "job_discovery_run"` 的条目。
- 对账调用点在会话加载路径：客户端 `use-agent-conversation.tsx` 会话切换之后；批量查询走既有 `/api/scan/status`（按 scanId 逐个或批量），一次会话加载至多一轮查询。
- 终态映射：scan_queue 的 completed/failed/expired 等终态覆写 `uiPayload.status` 与 `resolvedAt`；查无记录（404/过期清理）覆写为 `unknown`，不保留 active 判定。
- 渲染兜底（`AgentDomainCards.tsx:1322-1331,1339-1406`）：`status` 缺失或无 scanId 时不得落入默认 `pending`（视为已结束）；轮询失败时停止 spinner 与「运行中」标题，降级为「状态未知」一行说明。
- 不改 `scan-portals` 的写入协议：瞬时状态仍随 uiPayload 持久化（写入协议变更另立决策，先观察对账效果）。
- 孤儿扫描（scan_queue 遗留非终态）：对账后仍为 running 的卡片显示运行中是真实状态，不在本 spec 处理（属于扫描子系统缺陷）。

## Testing Decisions

- reconcile 单测：running 卡 + scan_queue 终态 → 覆写为终态；查无记录 → unknown；非 job_discovery_run 消息原样通过（纯函数，golden 断言）。
- 渲染兜底单测：无 scanId 卡片不显示进行中；轮询 404 后 spinner 消失、显示状态未知。
- 回归：现有 AgentDomainCards / use-agent-conversation 测试全绿。

## Out of Scope

- 不改 scan-portals 写入协议与 uiPayload 形状。
- 不修 scan_queue 孤儿运行（扫描子系统独立缺陷）。
- 不为其他工具卡（如 evaluate_jd_full）补对账——它们没有异步跨进程终态问题。

## Further Notes

- 根因证据链：`AgentDomainCards.tsx:1322-1331`（status 判定）、`scan-portals.ts:111-127`（瞬时写入）、`use-agent-conversation.tsx:708-713`（无对账回放）、`transcript-merge.ts:88-110`（原样合并）。
- 与 Spec 04 的关系：本 spec 是「UI 读持久投影」原则在回放路径的补课——投影没有的终态，由对账从事实源（scan_queue）补齐。
