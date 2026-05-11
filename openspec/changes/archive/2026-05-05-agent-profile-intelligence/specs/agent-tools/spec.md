## ADDED Requirements

### Requirement: 工具名中文化展示

Agent Chat 中所有工具调用相关的 UI 元素 SHALL 使用中文名展示，不再显示英文工具名。

#### Scenario: 工具结果卡片中文化

- **WHEN** Agent Chat 渲染工具执行结果（ToolResultCard）
- **THEN** 卡片头部 SHALL 显示 "{emoji} {中文名}" 格式
- **AND** 原始英文 toolName 不再直接显示给用户
- **AND** 成功状态显示"完成"，失败状态显示"失败"

#### Scenario: 执行指示器中文化

- **WHEN** Agent Chat 渲染"正在执行"指示器（ExecutingIndicator）
- **THEN** 工具名 SHALL 显示中文版本
- **AND** emoji 显示在工具名之前

#### Scenario: 未映射工具兜底

- **WHEN** 工具名在映射表中不存在
- **THEN** 系统 SHALL 显示原始英文名 + 默认图标（🔧）
- **AND** 不会因此崩溃或白屏
