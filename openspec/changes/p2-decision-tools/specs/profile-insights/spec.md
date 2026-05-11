## ADDED Requirements

### Requirement: Agent SHALL extract profile insights from historical signals

`get_profile_insights` 工具 SHALL 从 SQLite `profile_signals`（63 条）和 `session_memory`（语义类型）中读取数据，提炼用户行为模式和偏好趋势。

#### Scenario: 有足够信号

- **WHEN** profile_signals 包含 ≥10 条记录
- **THEN** 输出洞察摘要：偏好的行业、薪资区间、岗位类型、投递行为模式
- **AND** 格式化为结构化 Markdown

#### Scenario: 信号不足

- **WHEN** profile_signals < 10 条
- **THEN** 返回 "画像数据不足，继续使用系统将自动积累"
