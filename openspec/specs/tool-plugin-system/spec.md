## ADDED Requirements

### Requirement: 工具独立文件

每个工具 SHALL 定义为独立文件，位于 `tools/query/` 或 `tools/action/` 目录下。

#### Scenario: 查询类工具

- **WHEN** 工具只读数据（如 search_applications）
- **THEN** 文件位于 `tools/query/` 目录
- **AND** category 字段值为 "query"

#### Scenario: 行动类工具

- **WHEN** 工具有副作用或调用外部 API（如 evaluate_jd）
- **THEN** 文件位于 `tools/action/` 目录
- **AND** category 字段值为 "action"

#### Scenario: 工具文件结构

- **WHEN** 创建新工具文件
- **THEN** 文件 export 一个 `ToolDefinition` 对象
- **AND** 包含 name, description, category, parameters, handler, formatResult 六个字段

### Requirement: Tool Registry 集中管理

所有工具 SHALL 通过 ToolRegistry 注册和查询，外部不直接 import 工具 handler。

#### Scenario: 注册工具

- **WHEN** 系统初始化
- **THEN** `tools/index.ts` 导入所有工具文件并调用 `registry.register()`
- **AND** 注册后工具可通过 `registry.get(name)` 查询

#### Scenario: 获取工具列表给 LLM

- **WHEN** 构建 System Prompt 时需要工具描述
- **THEN** `registry.buildToolListText()` 返回所有已注册工具的格式化文本
- **AND** 文本包含每个工具的名称、描述、参数说明

#### Scenario: 按分类筛选

- **WHEN** 需要只获取查询类工具
- **THEN** `registry.getByCategory("query")` 返回符合条件的工具列表

### Requirement: 工具接口标准化

所有工具 SHALL 遵循统一的 ToolDefinition 接口。

#### Scenario: 参数验证

- **WHEN** 工具被调用
- **THEN** handler 内部验证必填参数
- **AND** 参数缺失时返回 `{ success: false, error: "参数缺失: xxx" }`

#### Scenario: 错误处理

- **WHEN** 工具执行过程中抛出异常
- **THEN** registry 捕获异常并返回 `{ success: false, error: "工具执行错误: <message>" }`
- **AND** 异常不传播到 Loop 层

#### Scenario: 结果格式化

- **WHEN** 工具返回结果需要展示给用户
- **THEN** 调用 `tool.formatResult(result)` 生成人类可读的摘要文本
- **AND** 摘要不超过 200 字符

### Requirement: 向后兼容

重构后的工具系统 SHALL 保持与现有 `tools.ts` 相同的对外 API。

#### Scenario: executeTool 调用

- **WHEN** 外部调用 `executeTool(name, params)`
- **THEN** 函数内部委托给 registry 查找并执行对应工具
- **AND** 返回格式与重构前完全一致

#### Scenario: buildToolListForLLM 调用

- **WHEN** 外部调用 `buildToolListForLLM()`
- **THEN** 返回所有已注册工具的格式化文本
- **AND** 格式与重构前完全一致
