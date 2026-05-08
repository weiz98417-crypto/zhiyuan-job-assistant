## ADDED Requirements

### Requirement: 客户端 Agent Loop

Agent Loop SHALL 在浏览器端执行，通过 `/api/agent/think` 代理调用 LLM。

#### Scenario: Think 通过代理

- **WHEN** Agent Loop 需要调用 LLM 思考
- **THEN** 发送 POST 到 `/api/agent/think`，携带 `{ systemPrompt, messages }`
- **AND** 服务端持有 API key 转发到 DeepSeek
- **AND** 客户端通过 SSE 流式接收 LLM 输出文本

#### Scenario: Act 本地执行

- **WHEN** LLM 输出包含 `<<TOOL>>` 工具调用
- **THEN** 客户端直接执行工具 handler（DexieDB / fetch / 浏览器 API）
- **AND** 不再有 "仅在浏览器可用" 错误

#### Scenario: Loop 完整性

- **WHEN** 复杂请求需要多轮 Think→Act→Observe
- **THEN** 每轮 Think 走代理，Act 走本地
- **AND** 事件流（plan_created → task_started → ... → task_done → done）不变

### Requirement: 工具修复

所有工具在客户端 Agent Loop 中 SHALL 正常执行。

#### Scenario: Query 工具可用

- **WHEN** LLM 调用 search_applications / get_report_detail / get_profile / get_recent_activity / get_recommendations / get_pipeline_status
- **THEN** 直接访问 DexieDB，返回数据
- **AND** 不再返回 "仅在浏览器可用"

#### Scenario: Action 工具 API 正确

- **WHEN** LLM 调用 evaluate_offer / generate_cv / scan_portals
- **THEN** 分别调用存在的 API 端点（/api/evaluate, /api/cv, /api/scan/status）
- **AND** 不再返回 404
