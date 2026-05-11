## ADDED Requirements

### Requirement: 探索总结写入 Agent 画像

用户完成对话总结后，系统 SHALL 将提取的画像数据同步写入 CareerProfile 和 AgentPreferenceModel，而不只是存入 localStorage。

#### Scenario: Summarize 成功后的连锁写入

- **WHEN** 用户在 explore 页面点击"总结"并成功获得 ProfileData
- **THEN** 系统在现有 localStorage 存储之后，额外执行：
- **AND** 调用 saveProfile() 将 targetRoles 写入 CareerProfile.goals（source="explore"）
- **AND** 调用 saveProfile() 将 preferences 写入 CareerProfile.preferences
- **AND** 将 targetRoles 中 confidence ≥ 60 的角色写入 AgentPreferenceModel.rolePreferences

#### Scenario: 手动设定优先于探索总结

- **WHEN** 用户已在 GoalSettingWizard 中手动设定了 goals（source="manual"）
- **AND** 后续探索总结尝试覆盖
- **THEN** 手动设定的 goals 保留
- **AND** 探索总结的偏好仅写入 AgentPreferenceModel，不覆盖 CareerProfile.goals

#### Scenario: 探索总结触发偏好模型更新

- **WHEN** 探索总结写入了新的角色偏好
- **THEN** AgentPreferenceModel 中对应角色的 preference source 标记为 "explore"
- **AND** 初始 confidence 基于对话轮数（≥6 轮 → 0.6, ≥10 轮 → 0.8, 否则 0.4）
- **AND** 下次推荐排序时叠加该偏好权重
