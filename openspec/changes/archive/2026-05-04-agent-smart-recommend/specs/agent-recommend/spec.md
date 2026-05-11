## ADDED Requirements

### Requirement: Agent 推荐引擎

系统 SHALL 基于用户求职画像和目标，从 Pipeline 中推荐最匹配的 JD，按匹配度降序排列。

#### Scenario: 有画像时推荐

- **WHEN** 用户调用推荐 API 且存在求职画像和待评估 JD
- **THEN** 系统读取画像中的技能、偏好、竞争力分数
- **AND** 对 Pipeline 中状态为 Evaluated 且评分 ≥ 4.0 的 JD 做语义匹配
- **AND** 返回 Top 3 推荐，每条包含：JD ID、公司、岗位、匹配分数（0-100）、推荐理由（3-5 条）、风险提示（如有）
- **AND** 推荐理由引用画像中的具体数据点（如"你的 AI PM 方向通过率 60%，高于平均"）

#### Scenario: 无画像时的回退

- **WHEN** 用户调用推荐 API 但尚未生成求职画像
- **THEN** 系统退化为基于目标设定中的角色关键词匹配
- **AND** 返回结果附带提示："完成更多评估以获得个性化推荐"
- **AND** 匹配分数标注为"基础匹配"而非"个性化匹配"

#### Scenario: Pipeline 无待评估 JD

- **WHEN** 用户调用推荐 API 但 Pipeline 中没有 Evaluated 状态的 JD
- **THEN** 返回空推荐列表
- **AND** 附带引导："去评估页粘贴你的第一个 JD 吧"

#### Scenario: 推荐缓存

- **WHEN** 推荐结果在 1 小时内且 Pipeline 无新增 JD
- **THEN** 返回缓存结果
- **AND** 响应头标记 `X-Cache: HIT`

#### Scenario: 用户反馈

- **WHEN** 用户对某条推荐点击"不感兴趣"
- **THEN** 该 JD 在后续推荐中降权
- **AND** 用户偏好向量中对应维度微调（如大厂推荐被跳过 → 大厂偏好分数 -0.05）
