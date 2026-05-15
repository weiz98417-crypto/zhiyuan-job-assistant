## MODIFIED Requirements

### Requirement: 工具注册表

系统 SHALL 提供一个声明式的 Agent 工具注册表，每个工具包含名称、描述、参数定义、执行器和结果构建器。

#### Scenario: 注册查询工具

- **WHEN** Agent 需要查询用户数据（如搜索投递历史、获取报告详情）
- **THEN** 工具注册表中存在对应的查询工具
- **AND** 每个查询工具通过 DexieDB 直接查询，不经过 HTTP API

#### Scenario: 注册行动工具

- **WHEN** Agent 需要调用外部 API（如评估 JD、生成面试题）
- **THEN** 工具注册表中存在对应的行动工具
- **AND** 每个行动工具通过 fetch 调用对应的 API 路由

#### Scenario: 工具参数校验

- **WHEN** Agent 调用工具时传入了无效参数
- **THEN** 工具执行器返回明确的错误信息
- **AND** 错误信息包含缺失的参数名或无效值

#### Scenario: 工具结果构建

- **WHEN** 工具执行完成并返回 ToolResult
- **THEN** handler 返回的 ToolResult 包含 `llmSummary`（LLM 上下文文本）、`uiPayload`（UI 结构化数据）、`success`、`errorCategory`
- **AND** 若未提供 `llmSummary`，agent loop 回退到 `formatResult(data)` 生成文本
- **AND** `errorCategory` 未声明时，`success=true` 默认 `"ok"`，`success=false` 默认 `"permanent"`

### Requirement: 工具列表注入 LLM

系统 SHALL 在执行模式下将可用工具列表注入 LLM system prompt，让 LLM 决定调用哪些工具。

#### Scenario: 执行模式工具注入

- **WHEN** Agent 处于执行模式（仪表盘推理或用户主动提问）
- **THEN** LLM system prompt 末尾注入可用工具列表
- **AND** 每个工具以 "工具名: 描述 (参数: ...)" 格式呈现
- **AND** 工具列表控制在 500 tokens 以内

#### Scenario: 探索模式无工具注入

- **WHEN** Agent 处于探索模式（/explore 页面聊天）
- **THEN** LLM system prompt 不注入工具列表
- **AND** 探索模式仅使用 BASE/DEEP 聊天框架

## REMOVED Requirements

### Requirement: 工具结果格式化（formatResult）

**Reason**: 被 `llmSummary` 字段和 `buildLLMSummary` 替代。LLM 上下文不应复用 UI 渲染和存储的同一字符串。

**Migration**: 迁移期间 `formatResult` 作为 fallback 保留。工具迁移完成后删除。新工具直接在 handler 中设置 `llmSummary` 字段。
