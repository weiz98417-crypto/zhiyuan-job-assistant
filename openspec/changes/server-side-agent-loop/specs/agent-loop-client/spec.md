## MODIFIED Requirements

### Requirement: 客户端 Agent Loop

Agent Loop SHALL 在服务端执行。`/api/agent/run` 端点接收消息历史，内部运行 ReAct 循环，通过 SSE 流式返回事件。

#### Scenario: Think 通过服务端直接调用

- **WHEN** Agent Loop 需要调用 LLM 思考
- **THEN** 服务端直接 fetch DeepSeek API（不经过客户端代理）
- **AND** 服务端持有 API key

#### Scenario: Act 服务端执行

- **WHEN** LLM 输出 `tool_calls`
- **THEN** 服务端直接执行工具 handler（`registry.execute()`）
- **AND** 不再有 "仅在浏览器可用" 错误（工具 handler 已服务端化或通过 API 桥接）

#### Scenario: Observe 通过 SSE 流回客户端

- **WHEN** 工具执行完成
- **THEN** `tool_result` SSE 事件流回浏览器
- **AND** 浏览器只做 UI 渲染，不做循环逻辑

## REMOVED Requirements

### Requirement: 工具修复

**Reason**: 原 requirement 要求所有工具在客户端 Agent Loop 中正常执行，强调浏览器端可用性。服务端化后，工具在服务端执行（直接调用或 API 桥接），"浏览器端可用"不再是约束。
**Migration**: 浏览器端工具（IndexedDB 直接访问的 6 个 query 工具）改为通过 `/api/agent/data/*` API 桥接。action 工具已在调 API 端点，迁移后改为直接调服务端函数。
