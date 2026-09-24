## ADDED Requirements

### Requirement: Agent 交互记忆

系统 SHALL 记录每次 Agent 与用户的交互，包括触发原因、上下文快照、推理过程、使用的工具、输出内容和用户反馈。

#### Scenario: 仪表盘加载触发 Agent 推理

- **WHEN** 用户访问首页仪表盘
- **AND** Agent 执行推荐和健康检查
- **THEN** 系统创建一条 AgentInteraction 记录
- **AND** 记录包含 contextSnapshot（画像版本、Pipeline 摘要）
- **AND** 记录包含 reasoning（Agent 的推理摘要）
- **AND** 记录包含 toolsUsed（实际调用的工具列表）
- **AND** 记录包含 output（推荐结果和健康状态）

#### Scenario: 评估完成触发 Agent 推理

- **WHEN** 用户在 evaluate 页面完成一次 JD 评估
- **THEN** 系统创建一条 AgentInteraction 记录，trigger 为 "evaluation_completed"
- **AND** contextSnapshot 包含新评估的 JD 信息

#### Scenario: 记录用户反馈

- **WHEN** 用户对 Agent 推荐点击"不感兴趣"或"查看评估"
- **THEN** 系统更新对应的 AgentInteraction 记录，填充 feedback 字段
- **AND** feedback.action 为 "dismissed" 或 "clicked"

#### Scenario: 交互日志自动清理

- **WHEN** AgentInteraction 记录超过 90 天
- **THEN** 系统自动删除过期记录
- **AND** AgentDecisions 不受此清理影响（保留用于结果追踪）

### Requirement: Agent 决策记忆

系统 SHALL 记录 Agent 做出的每个推荐、警告和建议，并追踪用户响应和后续结果。

#### Scenario: 推荐决策记录

- **WHEN** Agent 推荐一个 JD 给用户
- **THEN** 系统创建一条 AgentDecision 记录
- **AND** 记录包含 type（"recommend_apply" 或 "recommend_skip"）
- **AND** 记录包含 target（关联的 reportId）
- **AND** 记录包含 confidence（Agent 对推荐的置信度 0-1）
- **AND** userResponse 初始为 "pending"

#### Scenario: 用户接受推荐

- **WHEN** 用户点击推荐卡片上的"查看评估"并后续投递了该岗位
- **THEN** 对应的 AgentDecision.userResponse 更新为 "accepted"
- **AND** outcome.didApply 设为 true

#### Scenario: 用户拒绝推荐

- **WHEN** 用户点击推荐卡片上的"不感兴趣"
- **THEN** 对应的 AgentDecision.userResponse 更新为 "rejected"

#### Scenario: 决策结果追踪

- **WHEN** 被推荐的岗位后续获得回复/面试/Offer
- **THEN** 对应的 AgentDecision.outcome 更新对应字段
- **AND** 系统据此计算 Agent 推荐准确率

### Requirement: Agent 偏好模型

系统 SHALL 从用户反馈和行为中持续学习排序信号，构建动态偏好模型；推断信号不等于用户明确确认的求职偏好。

#### Scenario: 从推荐反馈学习角色偏好

- **WHEN** 用户 dismiss 一个推荐（role="后端工程师"）
- **THEN** 系统只记录低权重、短期的排序信号，不将其标为用户明确偏好
- **AND** 重复且一致的反馈才可提出待确认的角色偏好，confidence 根据交互次数重新计算

#### Scenario: 单次忽略岗位不形成公司黑名单

- **WHEN** 用户 dismiss 一个推荐（company="某大厂"）
- **THEN** 系统只记录该岗位的忽略反馈，不将该公司加入 `companyPreferences.disliked`
- **AND** 后续同公司其他岗位仍可被推荐

#### Scenario: 用户明确排除公司

- **WHEN** 用户直接要求不再推荐某公司
- **THEN** 系统将该公司记录为明确的当前求职偏好
- **AND** 后续岗位发现与推荐遵守这一约束

#### Scenario: 偏好不超过边界

- **WHEN** 偏好模型的 role score 已达 -0.15 或 +0.15
- **THEN** 即使再有同方向反馈，score 不再增加/减少
- **AND** 防止过拟合

#### Scenario: 低置信度不生效

- **WHEN** 某 role 的 preference confidence < 0.3（样本量不足）
- **THEN** 该偏好不参与推荐排序计算

#### Scenario: 探索总结初始化偏好

- **WHEN** 用户在 explore 页面完成对话总结
- **AND** summarize 返回 targetRoles
- **THEN** targetRoles 中 confidence ≥ 60 的模型推断可作为来源为 "explore" 的待确认候选
- **AND** 用户确认前不得写成明确求职偏好或覆盖手动设定的 goals

#### Scenario: 偏好随时间衰减

- **WHEN** 用户 dismiss 某 role 的偏好距今超过 90 天
- **THEN** 该偏好 score 向 0 衰减 50%
- **AND** 如果衰减后 |score| < 0.05，则移除该条目
