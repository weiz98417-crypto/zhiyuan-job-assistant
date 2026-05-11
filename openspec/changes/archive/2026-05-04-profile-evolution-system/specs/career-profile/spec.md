## MODIFIED Requirements

### Requirement: 求职画像数据模型

系统 SHALL 维护一个结构化的求职画像（ZhiyuanProfile），包含技能、偏好、市场对标、进化历史和求职目标。数据 SHALL 存储于 SQLite profiles 表，前端通过 API 读取，DexieDB 仅做缓存。

#### Scenario: 画像初始化

- **WHEN** 用户首次完成 dingwei 定位
- **THEN** 系统 SHALL 创建画像结构，包含用户确认的 goals
- **AND** skills 和 preferences 从 CV 和对话信号中初步填充
- **AND** history 记录一条"初次定位完成"事件（含定位出的目标方向）

#### Scenario: 画像数据存储

- **WHEN** 画像生成或更新完成
- **THEN** 完整 ZhiyuanProfile 数据 SHALL 写入 SQLite profiles 表（data_json + goals_json + history_json）
- **AND** API 返回最新数据后前端同步到 DexieDB 缓存
- **AND** profiles 表保留最近 10 个版本的完整快照

#### Scenario: 画像包含求职目标

- **WHEN** 用户通过 dingwei 对话确认目标
- **THEN** 画像的 goals 字段 SHALL 被更新
- **AND** goals 包含：targetRoles（角色+级别+匹配依据）、salaryRange（min/max）、dealBreakers（底线条件数组）、companyPrefs（规模/行业/工作方式偏好）
- **AND** 目标变更触发 history 事件，记录变更原因

#### Scenario: 画像字段来源追踪

- **WHEN** 画像被生成或更新
- **THEN** 每个字段 SHALL 标注数据来源（Layer 1 显式声明 / Layer 2 对话信号 / Layer 3 行为推断）
- **AND** goals 字段 SHALL 标注确认时间（confirmedAt）
