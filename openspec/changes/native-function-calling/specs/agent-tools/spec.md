## ADDED Requirements

### Requirement: 工具注册表 SHALL 支持 OpenAI 工具格式序列化

`ToolRegistry` SHALL 提供 `toOpenAITools()` 方法，将已注册的所有工具定义序列化为 DeepSeek/OpenAI 兼容的 `tools` 数组。

#### Scenario: 标准工具序列化

- **WHEN** 调用 `toOpenAITools()`
- **THEN** 返回数组中每个元素为 `{ type: "function", function: { name, description, parameters: { type: "object", properties, required } } }`
- **AND** `properties` 的 key 为参数名，value 为 `{ type, description }`
- **AND** `required` 数组包含所有 `required: true` 的参数名

## MODIFIED Requirements

### Requirement: 工具列表注入 LLM

系统 SHALL 将可用工具以原生 function calling 格式传给 LLM，替代文本格式注入 system prompt。

#### Scenario: 执行模式工具注入

- **WHEN** Agent 处于执行模式（仪表盘推理或用户主动提问）
- **THEN** 工具列表以 OpenAI `tools` 数组格式通过 `/api/agent/think` 的 `tools` 参数传给 DeepSeek
- **AND** 不再将工具列表作为文本注入 system prompt

#### Scenario: 探索模式无工具注入

- **WHEN** Agent 处于探索模式（/explore 页面聊天）
- **THEN** `/api/agent/think` 请求不包含 `tools` 参数
- **AND** Agent 仅做纯文本对话
