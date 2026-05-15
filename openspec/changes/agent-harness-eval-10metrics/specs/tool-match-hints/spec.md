## ADDED Requirements

### Requirement: Tool Match Hints

ToolDefinition SHALL 支持 `matchHints` 关键词数组，在 LLM 工具列表中提供偏置提示。**不影响 LLM 选择权**。

#### Scenario: 关键词偏置不影响选择

- **WHEN** read_file 定义了 `matchHints: ["参考简历", "我的简历"]`
- **THEN** LLM 工具列表中显示 `(触发词: 参考简历, 我的简历)`
- **AND** LLM 仍可自由选择其他工具
- **AND** harness 不做硬路由

#### Scenario: 默认无提示

- **WHEN** 工具未定义 matchHints
- **THEN** LLM 工具列表不显示触发词
