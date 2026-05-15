## ADDED Requirements

### Requirement: ToolResult 错误分类

系统 SHALL 在 ToolResult 上提供 `errorCategory` 字段,将工具执行结果分为四类。LLM 和 Agent Loop 引擎 SHALL 据此决定下一步行为。

#### Scenario: 成功结果

- **WHEN** 工具执行成功返回数据
- **THEN** errorCategory 为 "ok"
- **AND** Agent Loop 不触发重试或降级

#### Scenario: 临时故障

- **WHEN** 工具因网络超时、API 限流(429)、服务暂不可用(503)而失败
- **THEN** errorCategory 为 "transient"
- **AND** Agent Loop 自动增加 autoRetryCount
- **AND** LLM 收到指示:换参数重试(最多1次)

#### Scenario: 永久故障

- **WHEN** 工具因编码错误、文件不存在、权限不足、数据格式损坏而失败
- **THEN** errorCategory 为 "permanent"
- **AND** Agent Loop 直接降级到 responding 阶段
- **AND** LLM 收到指示:告知用户原因+建议解决方案,不要重试

#### Scenario: 需要用户输入

- **WHEN** 工具需要用户提供更多信息才能继续
- **THEN** errorCategory 为 "need_user_input"
- **AND** Agent Loop 直接降级到 responding 阶段
- **AND** LLM 收到指示:直接询问用户

#### Scenario: 向后兼容默认值

- **WHEN** 旧工具未显式设置 errorCategory
- **THEN** success=true 时默认为 "ok"
- **AND** success=false 时默认为 "transient"(保持旧行为的可重试)
