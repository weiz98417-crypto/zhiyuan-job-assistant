## MODIFIED Requirements

### Requirement: 求职画像数据模型

系统 SHALL 维护一个结构化的求职画像（CareerProfile），包含技能、偏好、市场对标、进化历史和求职目标，存储于 DexieDB 新表中。

#### Scenario: 画像初始化

- **WHEN** 用户首次使用画像功能
- **THEN** 系统创建空白画像结构
- **AND** 所有技能、偏好、市场对标、目标字段为空或默认值
- **AND** history 记录一条 "画像已创建" 事件

#### Scenario: 画像数据存储

- **WHEN** 画像生成或更新完成
- **THEN** 完整 CareerProfile JSON 写入 DexieDB profiles 表
- **AND** 保留最近 10 个版本的完整快照

#### Scenario: 画像包含求职目标

- **WHEN** 用户通过目标设定向导确认目标
- **THEN** 画像的 goals 字段 SHALL 被更新
- **AND** goals 包含：targetRoles（角色+级别）、salaryRange（min/max）、dealBreakers（底线条件数组）、companyPrefs（规模/行业/工作方式偏好）
- **AND** 目标变更触发 history 事件：`"更新了求职目标"`
