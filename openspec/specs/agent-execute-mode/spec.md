## MODIFIED Requirements

### Requirement: 执行模式可用工具

执行模式下，纸鸢 SHALL 注入完整的工具列表到 System Prompt，并能解析 LLM 输出的工具调用指令。工具调用 SHALL 支持多轮迭代（Agent Loop），而非单次调用。

#### Scenario: System Prompt 含工具列表

- **WHEN** 用户切换到执行 Tab
- **THEN** System Prompt 包含全部已注册工具的名称、描述、参数说明
- **AND** 工具列表格式为文本描述（非 OpenAI function calling JSON）

#### Scenario: 探索模式不含工具

- **WHEN** 用户位于探索 Tab
- **THEN** System Prompt 不包含工具列表
- **AND** LLM 不会尝试输出工具调用指令

#### Scenario: LLM 输出工具调用

- **WHEN** 执行模式下 LLM 决定调用工具
- **THEN** 输出格式为 `<<TOOL>>tool_name\n{params_json}\n<</TOOL>>`
- **AND** 服务端解析该标记后执行工具
- **AND** 工具执行结果格式化为文本注入到下一轮 LLM 上下文
- **AND** 多轮工具调用走 Agent Loop，每轮独立 Think→Act→Observe

### Requirement: 工具调用结果渲染

工具调用结果 SHALL 在聊天中渲染为可视化卡片，而非原始 JSON。

#### Scenario: search_applications 结果

- **WHEN** LLM 调用 search_applications 工具并返回结果
- **THEN** 聊天中显示 "找到 N 条投递记录" 的摘要卡片
- **AND** 卡片列出前 5 条的公司、职位、状态

#### Scenario: get_report_detail 结果

- **WHEN** LLM 调用 get_report_detail 并获取报告
- **THEN** 聊天中显示报告摘要卡片（公司、职位、总分、关键发现）

#### Scenario: evaluate_jd 结果

- **WHEN** LLM 调用 evaluate_jd 工具
- **THEN** 聊天中显示 "评估完成: {company} {role}，总分 {score}/5"
- **AND** 附带跳转到完整报告的链接

#### Scenario: 工具调用失败

- **WHEN** 工具执行失败（如参数错误、API 超时）
- **THEN** 聊天中显示错误提示："{tool_name} 调用失败: {error}"
- **AND** LLM 收到该错误作为上下文（用于重试或跳过）

### Requirement: 多轮工具调用

执行模式下，纸鸢 SHALL 支持多轮工具调用，单次用户请求可执行多个工具。

#### Scenario: 多轮工具链

- **WHEN** 用户请求涉及多个工具（如先查投递再推荐）
- **THEN** Agent Loop 自动执行多轮 Think→Act→Observe
- **AND** 每轮工具调用结果注入下一轮上下文
- **AND** 用户不需要逐条发送指令

#### Scenario: 单次最大工具调用数

- **WHEN** 一个用户请求内执行多轮工具
- **THEN** 最大工具调用次数为 maxToolCallsPerTask（默认 3）

### Requirement: 单次最多一个工具调用

~~每次执行模式对话轮次中，纸鸢 SHALL 最多调用一个工具。~~ **此 Requirement 已移除，被"多轮工具调用"替代。**

## REMOVED Requirements

### Requirement: 单次最多一个工具调用

**Reason**: Agent Loop 支持多轮工具调用，单次限制不再适用
**Migration**: 无。执行模式自动升级为 Agent Loop 驱动。
