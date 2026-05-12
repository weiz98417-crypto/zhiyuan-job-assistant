## MODIFIED Requirements

### Requirement: LLM 代理端点

`/api/agent/think` SHALL 作为安全的 LLM 调用代理，持有 API key 并转发请求到 DeepSeek。当客户端提供 `tools` 参数时，代理 SHALL 将工具定义传给 DeepSeek 并解析流式 `tool_calls` delta。

#### Scenario: 正常代理

- **WHEN** 客户端 POST `{ systemPrompt, messages }` 到 `/api/agent/think`
- **THEN** 服务端使用 `DEEPSEEK_API_KEY` 环境变量调用 DeepSeek API
- **AND** 以 SSE 流返回 LLM 输出（type: text 事件）
- **AND** API key 不出现在任何客户端可见的代码或网络响应中

#### Scenario: 带 tools 参数的代理

- **WHEN** 客户端 POST `{ systemPrompt, messages, tools: [...] }`
- **THEN** DeepSeek API 请求 SHALL 包含 `tools` 字段
- **AND** 流式解析 `delta.tool_calls[]` 并按 index 累积
- **AND** 流结束时如有 tool_calls，产出 `{ type: "tool_calls", tool_calls: [...] }` SSE 事件

#### Scenario: API key 缺失

- **WHEN** 服务端未配置 `DEEPSEEK_API_KEY`
- **THEN** 返回 `{ success: false, error: "未配置 API Key" }`，状态码 500

#### Scenario: DeepSeek 返回错误

- **WHEN** DeepSeek API 返回非 200
- **THEN** 服务端返回 `{ success: false, error: "AI 请求失败: {status}" }`，状态码 502

## REMOVED Requirements

### Requirement: 不解析工具调用

**Reason**: native function calling 后，服务端负责解析 `tool_calls` delta 并产出结构化事件。客户端不再需要解析 `<<TOOL>>` 文本标签。
**Migration**: 客户端 `parseToolCall()` 替换为消费 `tool_calls` SSE 事件。
