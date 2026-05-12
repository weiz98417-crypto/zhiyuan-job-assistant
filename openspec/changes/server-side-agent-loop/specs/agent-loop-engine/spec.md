## MODIFIED Requirements

### Requirement: Agent Loop 完整性

Agent Loop SHALL 在服务端保持 Think→Act→Observe 多轮迭代能力。事件流（`tool_call` → `tool_result` → `text` → `done`）通过 SSE 从服务端流到浏览器，UI 渲染保持不变。

#### Scenario: 多轮 Think→Act→Observe

- **WHEN** 复杂请求需要多轮工具调用
- **THEN** 服务端循环执行 Think→Act→Observe，每轮产出一组 SSE 事件
- **AND** 浏览器按收到的事件顺序渲染 UI，不处理循环逻辑

#### Scenario: 循环中断

- **WHEN** 连接中断（网络或客户端断开）
- **THEN** 服务端完成当前工具执行后终止
- **AND** 已完成的操作不丢失（已写入数据库的记录保留）
