## ADDED Requirements

### Requirement: ToolResult 三条独立管道

系统 SHALL 将工具执行结果拆分为三条独立管道：`llmSummary`（LLM 上下文决策）、`uiPayload`（UI 组件渲染）、`rawData`（持久化存储/日志）。每条管道独立配置预算和格式，互不挤压。

#### Scenario: LLM 上下文管道

- **WHEN** 工具执行完成返回 ToolResult
- **THEN** agent loop 从 `llmSummary` 字段取文本推入 LLM 上下文
- **AND** 若 `llmSummary` 不存在，回退到 `formatResult(data)` 生成 LLM 文本
- **AND** LLM 文本由 `toolCtxCap` 控制上限，不存在时使用工具定义中的默认值

#### Scenario: UI 渲染管道

- **WHEN** 工具执行完成且 SSE `tool_result` 事件包含 `uiPayload`
- **THEN** 前端从 `uiPayload` 读取结构化数据
- **AND** 根据 `uiPayload.type` 选择对应的 React 组件渲染
- **AND** `uiPayload` 不进入 LLM 上下文

#### Scenario: 存储管道

- **WHEN** 需要持久化工具执行记录
- **THEN** 系统从 `rawData` 字段取完整数据进行序列化
- **AND** 若 `rawData` 不存在，回退到 `uiPayload` + `llmSummary` 的组合

### Requirement: errorCategory 显式声明

系统 SHALL 要求每个 ToolResult 显式声明 `errorCategory`。未声明时，`success=false` 的默认类别为 `"permanent"`（不可重试），`success=true` 的默认类别为 `"ok"`。

#### Scenario: 未声明 errorCategory 的失败结果

- **WHEN** 工具返回 `{ success: false }` 且未设置 `errorCategory`
- **THEN** agent loop 将其视为 permanent 错误
- **AND** 不触发自动重试
- **AND** 向 LLM 推送 `[TOOL_ERROR category=permanent]` 消息

#### Scenario: 网络超时需要 transient 语义

- **WHEN** 工具因网络超时返回失败且声明 `errorCategory: "transient"`
- **THEN** agent loop 触发最多 2 次自动重试
- **AND** 向 LLM 推送 `[TOOL_ERROR category=transient]` 带重试提示

### Requirement: 并行工具调用的 LLM 上下文截断

当 LLM 在单轮中并行调用多个独立工具时，每个工具结果的 LLM 上下文推送 SHALL 使用更激进的截断（500 字符），并行完成后追加汇总消息。

#### Scenario: 并行调用 3 个工具

- **WHEN** LLM 同时调用 get_profile、read_file、get_reference_detail
- **THEN** 三个工具并行执行
- **AND** 每个工具的 llmSummary 被截断到 500 字符后推入上下文
- **AND** 总上下文注入不超过 1500 字符 + 汇总消息
- **AND** LLM 下一轮可单独调用工具获取完整结果

### Requirement: ToolResultCard 默认折叠

工具结果卡片 SHALL 默认折叠显示：展示工具名 + 前 100 字符预览，用户点击展开后显示完整内容。

#### Scenario: 非结构化工具结果的默认渲染

- **WHEN** 工具结果没有对应的专用 UI 组件（如 ProfileViewCard）
- **THEN** ToolResultCard 渲染为折叠状态
- **AND** 用户看到工具名 + emoji + 前 100 字符预览 + 展开按钮

#### Scenario: 用户点击展开

- **WHEN** 用户点击 ToolResultCard 的展开按钮
- **THEN** 卡片展开显示完整的工具结果文本
- **AND** 再次点击折叠回预览状态

### Requirement: 上下文预算常数区分文档类和搜索类工具

系统 SHALL 支持按工具语义区分 LLM 上下文预算：文档类工具（read_file、get_reference_detail、get_report_detail）允许更高的 llmSummary 上限，搜索类工具保持紧凑摘要。

#### Scenario: 文档类工具的 LLM 摘要

- **WHEN** read_file / get_reference_detail / get_report_detail 返回结果
- **THEN** llmSummary 允许最多 4000 字符
- **AND** 超过时截断并标注 `[已截断]`

#### Scenario: 搜索类工具的 LLM 摘要

- **WHEN** web_search / search_applications 返回结果
- **THEN** llmSummary 限制为 800 字符
- **AND** 仅包含最相关的结果
