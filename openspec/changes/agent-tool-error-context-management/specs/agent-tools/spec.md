## MODIFIED Requirements

### Requirement: 工具结果格式化

系统 SHALL 在 ToolResult 中包含 errorCategory 字段以支持智能错误分类。

#### Scenario: 工具结果带错误分类

- **WHEN** 工具执行完成并返回结果
- **THEN** ToolResult SHALL 包含 errorCategory 字段
- **AND** errorCategory 值为 "ok"|"transient"|"permanent"|"need_user_input" 之一
- **AND** Agent Loop 和 LLM 据此决定后续行为

#### Scenario: 工具结果格式化不变

- **WHEN** 工具执行完成并返回结果
- **THEN** formatResult 将结果转换为 LLM 可读的文本摘要
- **AND** 摘要控制在 500 tokens 以内（避免 context 膨胀）
