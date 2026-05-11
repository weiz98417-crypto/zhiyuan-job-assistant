## MODIFIED Requirements

### Requirement: 求职画像页面

系统 SHALL 提供 `/profile` 页面，以"情报摘要"卡片流形式展示用户的求职画像，以具体事实为先、计算指标为辅。

#### Scenario: 页面入口

- **WHEN** 用户点击导航中的"求职画像"
- **THEN** 跳转到 `/profile` 页面
- **AND** 页面按以下顺序展示卡片：目标方向 → 核心技能 → 底线条件 → 偏好信号 → 竞争力概览 → 最近活动

#### Scenario: 每个卡片标注数据来源

- **WHEN** 画像卡片展示数据
- **THEN** 每个卡片 SHALL 标注数据来源（对话提取 / 手动添加 / 行为推断 / 配置文件）
- **AND** 展示来源对应的图标或标签

#### Scenario: 画像为空时的引导

- **WHEN** 用户首次访问画像页面且尚未生成画像
- **THEN** 显示引导卡片："你的求职画像尚未生成"
- **AND** 提供快捷入口跳转到 Agent Chat 开始自我定位对话
- **AND** 说明："与纸鸢聊聊你的职业方向，系统会自动提取关键信息"

#### Scenario: 画像生成中

- **WHEN** 用户点击"开始分析"后 API 计算中
- **THEN** 显示分析进度指示（"正在分析你的求职数据..."）
- **AND** 禁止重复点击

## ADDED Requirements

### Requirement: 竞争力分数解释

竞争力分数 SHALL 附带等级标签和维度分解。

#### Scenario: 分数展示含等级标签

- **WHEN** marketFit.overallScore 存在
- **THEN** 分数 SHALL 以进度条 + 数字 + 等级标签形式展示
- **AND** 等级分为：0-20 "起步" / 21-40 "积累中" / 41-60 "有一定竞争力" / 61-80 "具备竞争力" / 81-100 "高度匹配"

#### Scenario: 分数维度分解

- **WHEN** 画像包含 marketFit 数据
- **THEN** 分数下方 SHALL 展示维度分解（技能匹配度 / 经验相关性 / 市场需求度 / 偏好清晰度）
- **AND** 每个维度 SHALL 显示百分比和权重

### Requirement: 降低可视化门槛

技能雷达图、技能缺口、偏好分布的可视化展示门槛 SHALL 降低。

#### Scenario: 技能雷达图门槛降低

- **WHEN** 画像包含至少 3 项技能或用户已完成至少 1 次 JD 评估
- **THEN** 技能雷达图 SHALL 展示（旧门槛：3 次报告）

#### Scenario: 技能缺口门槛降低

- **WHEN** 画像包含 skillGaps 数据或用户已完成至少 2 次 JD 评估
- **THEN** 技能缺口清单 SHALL 展示（旧门槛：5 次）

#### Scenario: 偏好分布门槛降低

- **WHEN** 画像的 preferences 有任意非零值
- **THEN** 偏好分布柱状图 SHALL 展示（旧门槛：5 次报告）
