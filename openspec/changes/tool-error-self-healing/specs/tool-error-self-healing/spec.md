## ADDED Requirements

### Requirement: 工具永久错误包含纠正信息

系统 SHALL 在工具返回 permanent 错误时，在 error 消息中包含当前可用的资源列表，使 LLM 能从错误中自我纠正而不必盲目重试。

#### Scenario: read_file 参数无效时返回可用资源

- **WHEN** read_file 收到无效 path（空字符串或无法匹配任何路由）
- **THEN** error 包含可用资源列表（"我的简历"、参考简历 ID/名称列表、合法文件扩展名）
- **AND** LLM 收到纠正信息后直接使用正确参数重试

#### Scenario: get_report_detail 报告不存在时返回最近报告

- **WHEN** get_report_detail 传入不存在的 reportNum
- **THEN** error 包含最近 5 份报告的编号、公司、岗位
- **AND** LLM 能直接建议用户正确的报告编号

### Requirement: degradeToUser 后禁止工具调用

Agent loop SHALL 在 degradeToUser 路径注入的上下文中包含禁止工具调用的约束，阻止 LLM 在告知用户错误后继续调用工具。

#### Scenario: permanent 错误后停止工具调用

- **WHEN** 工具返回 permanent 错误且 agent loop 执行 degradeToUser
- **THEN** 推入 LLM 上下文的 errorObs 包含 "禁止调用任何工具。你必须在下一轮直接输出文字回复。"
- **AND** LLM 下一轮不调用任何工具
- **AND** 不触发 consecutiveFailures 累加导致的硬停止

### Requirement: Agent 系统提示词注入可用资源

系统 SHALL 在 Agent 启动时在系统提示词中注入当前会话的可用资源摘要，减少 LLM 首次调用工具时猜错参数的概率。

#### Scenario: Resume agent 启动时注入简历资源

- **WHEN** Resume agent 的 buildSystemPrompt 被调用
- **THEN** 系统提示词包含 "当前可用资源: 你的简历(read_file path='我的简历'), 参考简历: #1 张雯茜 [#AI产品, #教育]"
- **AND** 资源列表不超 300 字符
