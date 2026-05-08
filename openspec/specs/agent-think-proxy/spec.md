## ADDED Requirements

### Requirement: LLM 代理端点

`/api/agent/think` SHALL 作为安全的 LLM 调用代理，持有 API key 并转发请求到 DeepSeek。

#### Scenario: 正常代理

- **WHEN** 客户端 POST `{ systemPrompt, messages }` 到 `/api/agent/think`
- **THEN** 服务端使用 `DEEPSEEK_API_KEY` 环境变量调用 DeepSeek API
- **AND** 以 SSE 流返回 LLM 输出（type: text 事件）
- **AND** API key 不出现在任何客户端可见的代码或网络响应中

#### Scenario: API key 缺失

- **WHEN** 服务端未配置 `DEEPSEEK_API_KEY`
- **THEN** 返回 `{ success: false, error: "未配置 API Key" }`，状态码 500

#### Scenario: DeepSeek 返回错误

- **WHEN** DeepSeek API 返回非 200
- **THEN** 服务端返回 `{ success: false, error: "AI 请求失败: {status}" }`，状态码 502

#### Scenario: 不解析工具调用

- **WHEN** LLM 输出包含 `<<TOOL>>` 或 `<<PLAN>>`
- **THEN** 服务端原样透传文本，不做任何解析
- **AND** 工具解析由客户端 Agent Loop 完成
