## ADDED Requirements

### Requirement: System SHALL maintain three-layer memory

系统 SHALL 以三层结构管理 Agent 记忆：工作记忆（最近 10 轮，始终在上下文）、情景记忆（超过 15 轮时生成摘要）、语义记忆（跨会话结构化事实提取）。

#### Scenario: 对话未超限——仅工作记忆

- **WHEN** 对话轮数 ≤ 15 轮用户消息
- **THEN** 上下文仅包含最近 10 轮完整消息
- **AND** 不触发摘要

#### Scenario: 对话超限——触发情景摘要

- **WHEN** 对话轮数 > 15 轮用户消息
- **THEN** 系统对最早 5 轮生成 LLM 摘要
- **AND** 摘要以 `[摘要] ...` 格式注入 system prompt
- **AND** 上下文包含：摘要 + 最近 10 轮完整消息

#### Scenario: 新会话启动——加载语义记忆

- **WHEN** 用户开始新会话
- **THEN** 系统从 SQLite `session_memory` 加载历史语义提取结果
- **AND** 语义事实注入 system prompt（如"用户偏好：互联网行业，薪资 20-30K"）

### Requirement: Episodic summary SHALL be concise and accurate

情景摘要 SHALL 不超过 200 字，覆盖用户讨论的主题、关注的要点、做出的决定。

#### Scenario: 摘要生成

- **WHEN** 触发摘要
- **THEN** 调 DeepSeek V4 生成摘要
- **AND** 摘要长度 ≤ 200 字
- **AND** 格式为 `[摘要] 用户讨论了X，关注Y，决定了Z`
