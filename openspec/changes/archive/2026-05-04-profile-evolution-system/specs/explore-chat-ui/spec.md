## ADDED Requirements

### Requirement: Dingwei Skill 加载

探索 Tab 的 Agent Chat SHALL 在检测到定位意图时加载 dingwei Skill（`zhiyuan-dingwei.md`），替代当前的纯聊天 Skill（`zhiyuan-explore.md`）。

#### Scenario: 自我定位触发时加载 dingwei Skill

- **WHEN** 用户点击「自我定位」SuggestionChip 或发送"帮我做自我定位"
- **THEN** Agent Chat SHALL 传递 mode="dingwei" 参数
- **AND** 后端 SHALL 加载 `zhiyuan-dingwei.md` 作为系统提示词

#### Scenario: 普通聊天保持轻量

- **WHEN** 用户在探索 Tab 发送非定位意图的消息（闲聊、吐槽、随便聊聊）
- **THEN** Agent SHALL 保持轻量聊天风格，不触发 dingwei 结构化流程
- **AND** SHALL 使用 zhiyuan-agent.md 的统一模式

### Requirement: Suggestion Chips 更新

「自我定位」SuggestionChip SHALL 更新行为：点击后输入框填入"帮我做自我定位"，同时传递 mode="dingwei"。

#### Scenario: Chip 点击行为

- **WHEN** 用户点击「自我定位」Chip
- **THEN** 输入框 SHALL 填入"帮我做自我定位"
- **AND** 发送消息时 SHALL 携带 mode="dingwei"
- **AND** Agent 进入 dingwei 结构化对话流程
