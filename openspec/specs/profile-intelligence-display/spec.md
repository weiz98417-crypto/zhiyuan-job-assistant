## ADDED Requirements

### Requirement: 情报摘要布局

画像页 SHALL 以"情报摘要"卡片流形式展示用户画像，以具体事实为先、计算指标为辅。

#### Scenario: 页面整体布局

- **WHEN** 用户访问 `/profile` 页面
- **THEN** 页面 SHALL 按以下顺序展示卡片：目标方向 → 核心技能 → 底线条件 → 偏好信号 → 竞争力概览 → 最近活动
- **AND** 每个卡片 SHALL 标注数据来源（对话提取 / 手动添加 / 行为推断 / 配置文件）

#### Scenario: 有数据时展示事实卡片

- **WHEN** 画像包含 goals、skills、或 preferences 数据
- **THEN** 每个事实卡片 SHALL 展示具体内容（目标岗位标签、技能名称+熟练度、底线文本、偏好分布）
- **AND** 无数据的卡片 SHALL 显示引导文案而非完全隐藏

#### Scenario: 画像为空时的引导

- **WHEN** 用户首次访问画像页面且尚未生成任何画像数据
- **THEN** 显示引导卡片："你的求职画像尚未生成"
- **AND** 提供快捷入口跳转到 Agent Chat 开始自我定位对话
- **AND** 说明："与纸鸢聊聊你的职业方向，系统会自动提取关键信息"

### Requirement: 竞争力分数解释

竞争力分数 SHALL 附带等级标签和维度分解，使用户能理解分数的含义。

#### Scenario: 分数展示含等级标签

- **WHEN** marketFit.overallScore 存在
- **THEN** 分数 SHALL 以进度条 + 数字 + 等级标签形式展示
- **AND** 等级分为：0-20 "起步" / 21-40 "积累中" / 41-60 "有一定竞争力" / 61-80 "具备竞争力" / 81-100 "高度匹配"
- **AND** 进度条使用 Warm Amber 渐变色

#### Scenario: 分数维度分解

- **WHEN** 画像包含 marketFit 数据
- **THEN** 分数下方 SHALL 展示维度分解条（技能匹配度 / 经验相关性 / 市场需求度 / 偏好清晰度）
- **AND** 每个维度 SHALL 显示百分比分数和权重
- **AND** 无 LLM 维度数据时使用行为统计估算

#### Scenario: 无分数时展示引导

- **WHEN** marketFit.overallScore 为 0 或不存在
- **THEN** 竞争力概览卡片 SHALL 显示："尚未计算——完成首次 JD 评估后自动生成"
- **AND** 提供"去评估 JD"快捷按钮

### Requirement: 降低可视化门槛

技能雷达图、技能缺口、偏好分布的可视化展示门槛 SHALL 降低。

#### Scenario: 技能雷达图门槛

- **WHEN** 画像包含至少 3 项技能或用户已完成至少 1 次 JD 评估
- **THEN** 技能雷达图 SHALL 展示
- **AND** 不足 3 项技能时显示提示："评估更多 JD 可丰富技能画像"

#### Scenario: 技能缺口门槛

- **WHEN** 画像包含 skillGaps 数据或用户已完成至少 2 次 JD 评估
- **THEN** 技能缺口清单 SHALL 展示
- **AND** 无缺口数据时显示鼓励文案

#### Scenario: 偏好分布门槛

- **WHEN** 画像的 preferences 有任意非零值
- **THEN** 偏好分布柱状图 SHALL 展示
- **AND** 全零值时显示："与纸鸢聊聊你的偏好，系统会自动记录"

### Requirement: 最近活动时间线

画像页 SHALL 展示最近活动时间线，让用户了解画像的演变过程。

#### Scenario: 时间线内容

- **WHEN** 画像的 history 数组包含记录
- **THEN** 最近活动卡片 SHALL 展示最近 10 条变更记录
- **AND** 每条记录 SHALL 显示：时间、事件描述、变更摘要
- **AND** 记录 SHALL 带有来源标记（dingwei / evaluation / auto / manual）
- **AND** 最新记录排在最前

#### Scenario: 无历史记录

- **WHEN** history 数组为空
- **THEN** 最近活动卡片 SHALL 显示："暂无活动记录 — 开始与纸鸢对话或评估 JD 后这里会显示变化"
