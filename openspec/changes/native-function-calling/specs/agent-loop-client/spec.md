## MODIFIED Requirements

### Requirement: 客户端 Agent Loop

Agent Loop SHALL 在浏览器端执行，通过 `/api/agent/think` 代理调用 LLM。工具调用解析 SHALL 消费 `/api/agent/think` 产出的 `tool_calls` SSE 事件，而非解析 `<<TOOL>>` 文本标签。

#### Scenario: Think 通过代理

- **WHEN** Agent Loop 需要调用 LLM 思考
- **THEN** 发送 POST 到 `/api/agent/think`，携带 `{ systemPrompt, messages, tools }`
- **AND** 服务端持有 API key 转发到 DeepSeek
- **AND** 客户端通过 SSE 流式接收 LLM 输出文本和 `tool_calls` 事件

#### Scenario: Act — 原生 tool_calls 执行

- **WHEN** 收到 `{ type: "tool_calls", tool_calls: [{ name, arguments }] }` SSE 事件
- **THEN** 客户端直接执行对应的工具 handler
- **AND** 不再使用 `parseToolCall()` 正则解析

#### Scenario: Act — 无工具调用回复

- **WHEN** SSE 流以 `done` 结束且无 `tool_calls` 事件
- **THEN** 累积的文本内容作为最终回复展示给用户

#### Scenario: Loop 完整性

- **WHEN** 复杂请求需要多轮 Think→Act→Observe
- **THEN** 每轮 Think 走代理，Act 走本地
- **AND** 事件流（tool_call → tool_result → text → done）保持不变
