## ADDED Requirements

### Requirement: Agent 注册中心

系统 SHALL 提供一个 Agent Registry，集中管理所有子 Agent 的定义。

#### Scenario: Agent 定义结构

- **WHEN** 新增一个子 Agent
- **THEN** 其定义包含以下字段：
  - `id`: 唯一标识符（string）
  - `name`: 中文显示名（string）
  - `description`: 能力描述（string）
  - `intentPatterns`: 触发正则数组（RegExp[]）
  - `systemPrompt`: 动态 prompt 生成函数（() => string）
  - `tools`: 工具定义数组（ToolDefinition[]）
  - `priority`: 路由优先级（number）
- **AND** 定义通过 `registerAgent()` 函数注册到 Registry

#### Scenario: 运行时查询

- **WHEN** Orchestrator 需要匹配 Agent
- **THEN** 调用 `classifyIntent(content: string): AgentDefinition`
- **AND** 返回优先级最高的匹配 Agent 定义

#### Scenario: 首批 Agent 注册

- **WHEN** 系统启动
- **THEN** Registry 注册以下 Agent：
  - `interview`（面试教练，priority=10）
  - `evaluate`（JD 评估，priority=10）
  - `general`（通用助手，priority=1，兜底）
- **AND** Profile Agent（`id: "profile"`, priority=10）可选注册

### Requirement: Prompt 管理

每个子 Agent SHALL 有独立的 System Prompt 生成函数，支持动态注入上下文。

#### Scenario: 动态上下文注入

- **WHEN** 子 Agent 的 `systemPrompt()` 被调用
- **THEN** 生成的 Prompt 包含：
  - Agent 的专用角色定义和能力描述
  - 当前用户的 Career DNA 摘要
  - 当前会话的 Memory Digest（如有）
- **AND** 不与其它 Agent 的 Prompt 混合

#### Scenario: Prompt 版本管理

- **WHEN** Agent 的 prompt 需要更新
- **THEN** 修改对应 `build{Agent}Prompt()` 函数
- **AND** 不影响其他 Agent
