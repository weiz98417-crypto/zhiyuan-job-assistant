## ADDED Requirements

### Requirement: 执行模式可用工具

执行模式下，纸鸢 SHALL 注入完整的工具列表到 System Prompt，并能解析 LLM 输出的工具调用指令。

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
- **AND** 客户端解析该标记后执行工具
- **AND** 工具执行结果格式化为文本注入到下一轮 LLM 上下文

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
- **AND** LLM 不会收到该错误作为上下文（避免错误的连锁反应）

### Requirement: 知识按场景注入

执行模式下，System Prompt SHALL 包含与当前对话场景相关的行业知识。

#### Scenario: 用户讨论公司面试

- **WHEN** 用户在对话中提到具体公司名
- **THEN** System Prompt 注入该公司面试风格知识（轮次、重点、建议）

#### Scenario: 用户讨论薪资

- **WHEN** 用户在对话中提到薪资或级别
- **THEN** System Prompt 注入薪资基准数据（城市×级别×行业）

#### Scenario: 纯聊天不注入无关知识

- **WHEN** 用户只是闲聊（如 "今天好累"）
- **THEN** 不注入行业知识
- **AND** 只使用 Base Persona + Mode Overlay

### Requirement: 单次最多一个工具调用

每次执行模式对话轮次中，纸鸢 SHALL 最多调用一个工具。工具执行完毕后，如果 LLM 需要进一步行动，由用户决定是否继续。

#### Scenario: 一个工具调用后停止

- **WHEN** LLM 输出并执行了一个工具调用
- **AND** 工具结果已格式化并注入上下文
- **THEN** LLM 基于工具结果生成最终回复
- **AND** 不再自动发起新的工具调用
- **AND** 等待用户下一条消息

#### Scenario: 无需工具则直接回复

- **WHEN** LLM 判断用户请求不需要调用工具
- **THEN** LLM 直接生成文本回复
- **AND** 不输出任何 <<TOOL>> 标记
