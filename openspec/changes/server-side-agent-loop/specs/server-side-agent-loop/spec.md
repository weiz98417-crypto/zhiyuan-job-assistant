## ADDED Requirements

### Requirement: Agent loop SHALL execute server-side via API route

ReAct 循环 SHALL 在 `POST /api/agent/run` 内执行，接收消息历史，返回 SSE 事件流。浏览器端不再持有循环逻辑。

#### Scenario: 正常循环执行

- **WHEN** 客户端 POST `{ sessionId, messages: [...] }` 到 `/api/agent/run`
- **THEN** 服务端执行 orchestrator → 构建 systemPrompt + tools → 跑 server-runner
- **AND** 流式返回 SSE 事件（`phase`, `text`, `tool_call`, `tool_result`, `done`）

#### Scenario: 工具调用

- **WHEN** LLM 返回 native `tool_calls`
- **THEN** server-runner 直接调用 `registry.execute(name, params)`
- **AND** 工具结果注入上下文 → 继续下一轮 Think

#### Scenario: 达到最大迭代

- **WHEN** 循环达到 5 次迭代仍未产出最终回复
- **THEN** 强制返回 "达到思考上限，请重新提问"

### Requirement: Agent run endpoint SHALL survive client disconnect

`/api/agent/run` SHALL 在客户端断开连接后继续执行当前工具调用并写回结果（通过 `request.signal` 检测但不在中间步骤中断）。

#### Scenario: 客户端断开

- **WHEN** 用户关闭浏览器标签页
- **THEN** 当前正在执行的工具调用完成并写入数据库
- **AND** SSE 流自然终止
