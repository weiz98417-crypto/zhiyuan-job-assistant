## ADDED Requirements

### Requirement: 三层信号融合

Profile Engine SHALL 从三个数据源融合生成画像——Layer 1 显式声明（profile.yml）、Layer 2 对话信号（profile_signals 表）、Layer 3 行为数据（applications/reports 统计）——并以不同优先级规则应用于不同画像字段。

#### Scenario: Goals 优先级——用户确认最高

- **WHEN** profile.yml 声明目标为"AI产品经理"、profile_signals 中有"AI运营偏好"信号、行为数据显示 AI运营 JD 打分更高
- **THEN** goals.targetRoles SHALL 使用 profile.yml 的值（用户显式声明的）
- **AND** 行为数据和对话信号作为 preferences 字段的参考，但不直接覆盖 goals

#### Scenario: Skills 合并去重

- **WHEN** CV 中提到"数据分析"、对话信号中提到"数据分析"、评估报告推断出"数据分析"
- **THEN** skills 数组 SHALL 合并为一条 "数据分析" 条目
- **AND** evidence 数组 SHALL 合并所有来源的证明片段

#### Scenario: Preferences 行为推断为主

- **WHEN** 用户投递了 10 个岗位，其中 8 个是大型公司
- **THEN** preferences.companySize.large SHALL 被推算为高值
- **AND** 对话信号中如果用户说了"想去小公司"，可以覆盖行为推断

#### Scenario: MarketFit 纯数据计算

- **WHEN** Profile Engine 计算 marketFit
- **THEN** 数据 SHALL 仅来自 applications、reports 的统计（投递数、通过率、平均分、行业分布）
- **AND** SHALL 不受用户主观信号影响

### Requirement: Profile Engine 服务端运行

Profile 生成逻辑 SHALL 迁移到服务端（`/api/profile/analyze`），从 SQLite 读取数据，在服务端调用 LLM 做信号融合和推断。

#### Scenario: 服务端分析

- **WHEN** 前端调用 `/api/profile/analyze`（POST）
- **THEN** 服务端 SHALL 从 SQLite 读取 applications、reports、profile_signals 数据
- **AND** SHALL 调用 DeepSeek API 做 LLM 推断
- **AND** SHALL 将三层信号按优先级融合为 ZhiyuanProfile
- **AND** SHALL 写入 SQLite profiles 表并返回结果

#### Scenario: 前端触发分析

- **WHEN** dingwei 对话完成一个阶段或 JD 评估完成
- **THEN** 前端 SHALL 调用 `fetch('/api/profile/analyze', { method: 'POST', body: JSON.stringify({ force: true }) })`
- **AND** 调用 SHALL 不阻塞 UI（fire-and-forget）

### Requirement: 信号摘要透出

Profile Engine SHALL 在生成画像时为每个字段标注来源（Layer 1/2/3），使 /profile 页面能展示"这个数据从哪来的"。

#### Scenario: 字段来源标注

- **WHEN** Profile Engine 生成了画像
- **THEN** 每个 skills 条目 SHALL 包含 `source: "cv" | "signal" | "inferred"`
- **AND** preferences 条目 SHALL 包含 `source: "behavior" | "signal" | "declared"`
- **AND** goals 条目 SHALL 包含 `confirmedAt` 时间戳
