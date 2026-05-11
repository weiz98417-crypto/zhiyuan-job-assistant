## ADDED Requirements

### Requirement: 推荐反馈记忆化

用户对 Agent 推荐的反馈（"不感兴趣"/"查看评估"）SHALL 写入 Agent Memory，影响后续推荐排序。

#### Scenario: 用户 dismiss 推荐

- **WHEN** 用户在首页仪表盘点击推荐卡片的"不感兴趣"
- **THEN** 卡片以淡出动画消失（现有行为不变）
- **AND** 系统异步写入 AgentInteraction.feedback = { action: "dismissed", timestamp: now }
- **AND** 系统更新 AgentPreferenceModel.companyPreferences.disliked
- **AND** 系统更新 AgentPreferenceModel.rolePreferences[被拒role].score -= 0.1
- **AND** 系统创建 AgentDecision 记录（userResponse = "rejected"）

#### Scenario: 用户查看推荐详情

- **WHEN** 用户点击推荐卡片的"查看评估"
- **THEN** 系统异步写入 AgentInteraction.feedback = { action: "clicked", timestamp: now }
- **AND** 系统更新 AgentPreferenceModel.rolePreferences[该role].score += 0.05
- **AND** AgentDecision.userResponse 保持 "pending"（等待投递确认）

#### Scenario: 偏好加成影响后续推荐

- **WHEN** AgentPreferenceModel 中存在角色/公司偏好数据
- **AND** 下一次推荐计算 matchScore 时
- **THEN** 偏好加成叠加到最终分数
- **AND** liked 角色 +5 分，disliked 角色 -10 分
- **AND** disliked 公司 -10 分
- **AND** 加成总幅度不超过 ±15 分

#### Scenario: 无偏好模型时行为不变

- **WHEN** AgentPreferenceModel 尚未初始化（新用户）
- **THEN** 推荐行为与 V2.0 完全一致
- **AND** 不因偏好模型缺失而报错
