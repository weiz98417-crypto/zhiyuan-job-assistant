## Why

当前 Agent 的工具调用协议是自定义的 `<<TOOL>>工具名\n{json}<</TOOL>>` 文本标签，依赖正则解析（`client-runner.ts:45-91`）。这带来三个问题：1) LLM 输出格式不稳定，标签缺失、JSON 语法错误频繁；2) 工具描述通过文本注入系统提示，LLM 靠"读文字"而非"理解结构"来判断何时调用工具；3) DeepSeek V4 已支持 OpenAI 兼容的原生 function calling API，但项目未使用。升级到原生 function calling 让模型通过 API 层面理解工具语义，消除文本解析的脆弱性。

## What Changes

- **BREAKING**: `<<TOOL>>` 文本标签协议退役，所有工具调用改用 DeepSeek V4 native tools API
- `ToolRegistry` 新增 `toOpenAITools()` 方法，将工具定义序列化为 OpenAI/DeepSeek 兼容格式
- `/api/agent/think` 接受 `tools` 参数，传出给 DeepSeek，流式解析 `delta.tool_calls[]` 并产出 `tool_calls` SSE 事件
- `client-runner.ts` 不再解析 `<<TOOL>>` 标签，改为接收原生 `tool_calls` 事件执行工具
- `RESEARCH_PROTOCOL` 删除格式指令部分（`<<TOOL>>` 语法示例），保留研究策略部分
- 移除 `think/route.ts` 中对 `<<TOOL>>` 标签的清理逻辑（`content.replace(...)` 行）

## Capabilities

### New Capabilities

- `native-function-calling`: DeepSeek V4 native tools API 集成——think proxy 接收工具定义，传给模型，解析流式 tool_call delta，产出结构化 tool_calls 事件供 loop 消费

### Modified Capabilities

- `agent-think-proxy`: think 端点新增 `tools` 参数接收、DeepSeek 请求体包含 `tools` 字段、流解析产出 `tool_calls` SSE 事件类型。原有的 `<<TOOL>>` 标签清理逻辑移除，`tool` role 转换逻辑改为原生 `tool` role + `tool_call_id`
- `agent-tools`: ToolRegistry 新增 `toOpenAITools()` 序列化方法。工具列表注入 LLM 的方式从文本拼接（`buildToolListText()`）变为结构化 tools 数组
- `agent-loop-client`: 工具调用解析从 `parseToolCall()` 正则解析改为处理原生 `tool_calls` 事件。`collectThinkText()` 改为同时收集文本和 tool_calls
- `agent-prompt-protocol`: RESEARCH_PROTOCOL 常量中移除 `<<TOOL>>` 格式要求和语法示例，保留研究策略部分（实体拆分、先发现再深入等）

## Impact

- **修改**: `frontend/src/app/api/agent/think/route.ts`（核心改动——加 tools 参数 + tool_calls 流解析）
- **修改**: `frontend/src/lib/agent/tools/registry.ts`（加 `toOpenAITools()`）
- **修改**: `frontend/src/lib/agent/loop/client-runner.ts`（替换 parseToolCall → 原生 tool_calls 处理）
- **修改**: `frontend/src/lib/agent/loop/types.ts`（SSEEvent 新增 `tool_calls` 事件类型）
- **修改**: `frontend/src/lib/agent/orchestrator/index.ts`（OrchestratorResult 新增 `tools` 字段）
- **修改**: `frontend/src/app/agent/page.tsx`（传 tools 给 agentLoopClient）
- **依赖**: 无外部依赖变更，DeepSeek V4 Flash 已有 API 原生支持
