## Context

当前 `ToolResult` 接口用一个文本字符串（`formatResult` 输出）同时服务三条消费路径：
- **LLM 上下文**：通过 `capToolCtx` 截断到 600 字符后注入，给 LLM 做下一步决策
- **UI 渲染**：SSE `tool_result` 事件的 `result` 字段，前端解析后渲染卡片或纯文本
- **持久化存储**：`AgentMessage.toolResult` 序列化存到 Dexie IndexedDB

三条路径的约束互相矛盾。修 LLM（给更多文本）→ UI 泄洪；修 UI（折叠卡片）→ LLM 信息不足。此外 `client-runner` 和 `server-runner` 共享完全相同的 `DEFAULT_TOOL_CTX_CAP = 600` 和 `MAX_CONTEXT_TOKENS = 24000`，忽略浏览器和服务端的运行环境差异。

## Goals / Non-Goals

**Goals:**
- 将 `ToolResult` 的三条消费路径解耦为独立字段：`llmSummary`（LLM 上下文）、`uiPayload`（UI 渲染）、`rawData`（存储）
- 调整上下文预算常数适配 deepseek-v4-flash 的 128K 窗口
- `errorCategory` 改为必填，无显式值时 fallback 为 `"permanent"` 而非 `"transient"`
- 并行工具调用路径使用更激进的截断策略
- `ToolResultCard` 改为默认折叠，防止纯文本倾倒

**Non-Goals:**
- 不重写 agent loop 的 ReAct 循环结构
- 不改变工具 handler 的签名（返回 `Promise<ToolResult>` 不变）
- 不一次迁移全部 41 个工具 — 使用 `formatResult` fallback 保证兼容

## Decisions

### D1: 新增 `llmSummary` 和 `uiPayload` 字段，而非修改 `data` 语义

**选择**：保持 `data` 字段不变（标记 `@deprecated`），新增 `llmSummary: string` 和 `uiPayload: Record<string, unknown>`。

**理由**：41 个工具各自有 `data` 的语义。一次性改所有工具风险太大。用新字段 + fallback 策略（`llmSummary` 不存在时回退到 `formatResult(data)`）实现渐进迁移。

**替代方案**：改 `data` 为联合类型 `{ llm: string; ui: unknown }`。存在两个问题 — 破坏所有工具的 handler 签名，且旧工具无法向后兼容。

### D2: capToolCtx 优先取 `llmSummary`，fallback 到 `formatResult`

**选择**：`capToolCtx(formatted, toolName)` → `getLLMContext(toolResult, toolName)`。优先从 `toolResult.llmSummary` 取值，不存在时调用 `formatResult` 作为 fallback。

**理由**：迁移期间的兼容性。未迁移的工具继续走 `formatResult` 路径，已迁移的工具直接用 `llmSummary`。迁移完成后删除 fallback。

### D3: errorCategory fallback 从 `"transient"` 改为 `"permanent"`

**选择**：`resolveErrorCategory` 中 `success=false` + 无显式 `errorCategory` → `"permanent"`。

**理由**：当前 fallback 到 `"transient"` 导致大部分工具失败触发 auto-retry + "请换参数重试" prompt。实际上 `success=false` 通常是因为数据不存在、参数错误、权限不够 — 都是 permanent 错误。需要 transient 语义（网络超时等）的工具应显式声明。

**替代方案**：每个工具单独补 `errorCategory`。需要改 41 个工具 handler，且容易遗漏。

### D4: 上下文预算调为 800/64000 而非完全移除限制

**选择**：`DEFAULT_TOOL_CTX_CAP: 600 → 800`，`MAX_CONTEXT_TOKENS: 24000 → 64000`。不取消限制。

**理由**：deepseek-v4-flash 有 128K 窗口，64000 字符 ≈ 16000 tokens，仅占 12.5%。仍保留上限防止极端情况（如无限循环导致上下文暴涨），但不再在正常使用中触发截断。800 字符的 llmSummary 能给 LLM 足够上下文做决策。

### D5: 并行路径用 500 字符摘要

**选择**：并行工具调用时，每个结果的 LLM 上下文推送限制为 500 字符。并行完成后追加一条汇总消息。

**理由**：并行意味着 LLM 同时需要多个数据源，每个不需要太深。500 字符够 LLM 判断哪个结果值得深挖，下一轮单独用完整 llmSummary。

## Risks / Trade-offs

- **[风险] 迁移期间 llmSummary 和 formatResult 共存，可能产生不一致** → 第一批迁移的工具回归测试覆盖
- **[风险] 64000 字符上下文增加 API 调用成本** → 128K 窗口中 16000 tokens 的增量成本可忽略（deepseek-v4-flash 输入 ¥0.28/百万 tokens）
- **[风险] errorCategory fallback 改为 permanent 后，少数需要 transient 的工具可能被误判** → 监控工具失败日志，发现 transient 场景时显式声明
- **[风险] ToolResultCard 默认折叠可能隐藏关键信息** → 通过 `uiPayload.type` 区分：profile/report 类型走专用组件渲染，其余走折叠默认

## Migration Plan

1. **Phase 1**：类型层 — 改 `ToolResult` 和 `ToolDefinition` 接口，新增字段，标记废弃。capToolCtx 加 fallback 逻辑。zero breaking change。
2. **Phase 2**：执行层 — 改 client-runner 和 server-runner 的常数和 resolveErrorCategory。SSE 加 uiPayload 字段。
3. **Phase 3**：UI 层 — ToolResultCard 折叠，page.tsx 简化 SSE 处理。
4. **Phase 4**：工具迁移 — 分四批，每批模式相同。第一批 `get_profile`、`read_file`、`get_reference_detail`、`get_report_detail`。
5. **Phase 5**：清理 — 移除 formatResult 函数和废弃字段。

回滚策略：Phase 1-3 的改动不破坏现有工具（保留 fallback）。Phase 4 可逐工具回滚。

## Open Questions

- 是否需要给 `uiPayload` 定义 TypeScript 联合类型（`{ type: "profile_view_card" } | { type: "report_blocks" } | ...`）还是保持 `Record<string, unknown>`？建议先用宽类型，等所有工具迁移完后收紧。
