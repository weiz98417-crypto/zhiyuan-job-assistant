## ADDED Requirements

### Requirement: 对话消息自动信号扫描

系统 SHALL 在每次用户发送消息后自动扫描消息内容，提取画像信号并写入数据库，不依赖 AI 模型主动调用 mine_profile 工具。

#### Scenario: 技能提及提取

- **WHEN** 用户消息中包含技能表述（如"我擅长"、"做过"、"精通"、"熟悉"、"会" + 名词短语）
- **THEN** 系统 SHALL 自动提取为 `skill_claim` 类型信号
- **AND** SHALL 写入 `profile_signals` 表（source="auto_scan"）
- **AND** 按会话去重——同一会话中相同技能不重复写入

#### Scenario: 角色偏好提取

- **WHEN** 用户消息中包含角色倾向（如"我想做"、"目标是"、"考虑转"、"适合" + 岗位名称）
- **THEN** 系统 SHALL 自动提取为 `role_preference` 类型信号

#### Scenario: 底线条件提取

- **WHEN** 用户消息中包含明确拒绝（如"不接受"、"不考虑"、"排斥"、"拒绝"、"不去" + 条件描述）
- **THEN** 系统 SHALL 自动提取为 `dealbreaker` 类型信号

#### Scenario: 公司偏好提取

- **WHEN** 用户消息中提及具体公司名并带有正面或负面情绪
- **THEN** 系统 SHALL 自动提取为 `company_pref` 类型信号
- **AND** 正面情绪标记为 liked，负面情绪标记为 disliked

#### Scenario: 薪资期望提取

- **WHEN** 用户消息中包含薪资数字（如"40k"、"3万"、"不低于15K"）
- **THEN** 系统 SHALL 自动提取为 `salary_expectation` 类型信号

### Requirement: 扫描触发时机

信号扫描 SHALL 在特定时机自动触发，不打断对话流程。

#### Scenario: 每次用户消息后扫描

- **WHEN** 用户在 Agent Chat 中发送任意消息
- **THEN** 系统 SHALL 在消息发送后异步执行信号扫描
- **AND** 扫描 SHALL 不阻塞 UI 或对话流
- **AND** 扫描到的新信号 SHALL 批量写入 `/api/data/signals/batch`

#### Scenario: 对话结束触发画像更新

- **WHEN** 用户切换会话、新建会话、删除会话、或离开 Agent 页面
- **THEN** 系统 SHALL 自动调用 `triggerProfileUpdate({ force: true })`
- **AND** 调用 SHALL 为 fire-and-forget，不阻塞 UI

#### Scenario: JD 评估后触发

- **WHEN** Agent Chat 中 JD 评估完成
- **THEN** 除现有评估后更新外，SHALL 额外扫描评估中的 JD 文本提取信号
- **AND** 用户对 JD 的反应（如"这个不错"、"不感兴趣"）SHALL 同样被扫描
