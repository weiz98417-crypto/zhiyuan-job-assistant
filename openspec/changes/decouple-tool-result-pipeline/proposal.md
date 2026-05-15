## Why

当前 `ToolResult` 用一个文本字符串（`formatResult` 输出）同时服务 LLM 上下文决策、UI 组件渲染和持久化存储三条消费路径。三条路径的约束互相矛盾：LLM 需要足够信息做决策但不能超预算，UI 需要结构化数据渲染交互卡片，存储需要完整性。导致任何一条路径的优化都会破坏另一条（给 LLM 更多数据 → UI 泄洪；折叠 UI 卡片 → LLM 信息不足）。表现为 tools 调用反复横跳、上下文暴涨触发截断、工具失败进入无意义重试循环。拆开三条管道是根本解法。

## What Changes

- **BREAKING**: `ToolResult` 接口新增 `llmSummary`（LLM 上下文）和 `uiPayload`（UI 渲染）字段。旧的 `data` 和 `formatResult` 标记废弃但仍向后兼容
- **BREAKING**: `errorCategory` 改为必填字段，无显式值时 fallback 为 `"permanent"`（不再是 `"transient"`）
- Agent Loop 中 `capToolCtx` 改为基于 `llmSummary` 字段而非 `formatResult` 字符串截断
- 上下文预算常数调优：`DEFAULT_TOOL_CTX_CAP` 600→800，`MAX_CONTEXT_TOKENS` 24000→64000
- SSE `tool_result` 事件新增 `uiPayload` 字段
- `ToolResultCard` 组件改为默认折叠 + `uiPayload` 驱动渲染
- `resolveErrorCategory` fallback 从 `"transient"` 改为 `"permanent"`
- 分四批迁移所有 41 个工具到新的 `llmSummary` + `uiPayload` 模式

## Capabilities

### New Capabilities

- `tool-result-triple-pipe`: ToolResult 拆分为三条独立管道 — llmSummary（给 LLM 决策）、uiPayload（给 React 组件渲染）、rawData（给存储/日志）。每条管道独立调参，互不挤压。

### Modified Capabilities

- `agent-tools`: ToolResult 接口变更 — 新增 `llmSummary`、`uiPayload` 字段；废弃 `data`、`formatResult`；`errorCategory` 改为必填
- `agent-loop-engine`: capToolCtx 语义变更（从截断 formatResult 字符串改为消费 llmSummary 字段）；上下文预算常数调整

## Impact

- `src/lib/agent/tools/types.ts` — ToolResult / ToolDefinition 接口
- `src/lib/agent/loop/client-runner.ts` — capToolCtx、上下文预算、resolveErrorCategory、SSE 事件
- `src/lib/agent/loop/server-runner.ts` — 同步 client-runner 修改
- `src/components/agent/AgentChat.tsx` — ToolResultCard 折叠、uiPayload 渲染
- `src/app/agent/page.tsx` — SSE tool_result 处理、showAsCard 逻辑
- 全部 41 个工具 handler — 分四批迁移，第一批 4 个（get_profile、read_file、get_reference_detail、get_report_detail）
