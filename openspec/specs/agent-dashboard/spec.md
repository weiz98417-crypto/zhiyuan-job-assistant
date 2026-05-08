## ADDED Requirements

### Requirement: Agent 仪表盘首页

系统 SHALL 将首页重构为 Agent 仪表盘，采用四区布局展示 Agent 推荐、Pipeline 健康、待处理操作和最近动态。

#### Scenario: 仪表盘整体布局

- **WHEN** 用户访问首页
- **THEN** 显示四区布局：顶部问候语 + 竞争力分数摘要
- **AND** 上行左侧为 Agent 推荐区（Top 3 推荐卡片）
- **AND** 上行右侧为 Pipeline 健康面板
- **AND** 下行左侧为待处理操作列表
- **AND** 下行右侧为最近动态时间线
- **AND** 所有卡片使用温暖的手帳风格，保持 DESIGN.md 设计原则

#### Scenario: 问候语个性化

- **WHEN** 首页加载且 profile 中存在用户姓名
- **THEN** 根据当前时间显示个性化问候（"早上好/下午好/晚上好，[名字]"）
- **AND** 如果有竞争力分数，显示大号 Display 字体展示当前分数和变化趋势（↑3 / ↓2 / → 持平）

#### Scenario: 没有推荐时

- **WHEN** Agent 推荐区无数据（无画像或无待评估 JD）
- **THEN** 推荐区显示引导卡片："去评估几个 JD，Agent 会为你推荐最匹配的岗位"

### Requirement: Pipeline 健康面板

系统 SHALL 在首页展示 Pipeline 健康状态，包含迷你漏斗图和状态指示灯。

#### Scenario: 健康状态正常

- **WHEN** Pipeline 各阶段分布正常（初筛 ≤ 60%，面试/Offer 阶段有数据）
- **THEN** 显示绿色指示灯 + "Pipeline 分布健康"
- **AND** 迷你漏斗图展示各阶段数量

#### Scenario: 健康状态警告

- **WHEN** 某 Pipeline 阶段堆积超过 70%
- **THEN** 显示黄色指示灯 + 具体警告文案（如"大部分申请在初筛阶段——建议暂停新投递，集中跟进"）
- **AND** 问题阶段在漏斗图中以暖色高亮

#### Scenario: 健康状态告警

- **WHEN** 某 Pipeline 阶段堆积超过 80%，或某方向连续 5+ 次零回复
- **THEN** 显示红色指示灯 + 紧急告警文案
- **AND** 在待处理操作区生成对应的修正建议

#### Scenario: Pipeline 为空

- **WHEN** Pipeline 中无任何数据
- **THEN** 健康面板显示引导："开始评估你的第一个 JD 吧"

### Requirement: 待处理操作

系统 SHALL 根据 Pipeline 状态和最近数据，动态生成操作建议列表。

#### Scenario: 有待评估 JD

- **WHEN** Pipeline 中存在状态为 Evaluated 的 JD 且未投递
- **THEN** 显示操作："有 N 个评估完的岗位，选择感兴趣的投递"
- **AND** 点击跳转到 tracker 页

#### Scenario: 有即将到来的面试

- **WHEN** 存在 48 小时内的面试安排
- **THEN** 显示操作："明天 [时间] 有 [公司] 的面试——去面试准备页练习"
- **AND** 点击跳转到 interview 页

#### Scenario: 有逾期跟进

- **WHEN** 存在投递超过 7 天未跟进的申请
- **THEN** 显示操作："[公司] 的申请已投递 N 天，建议跟进"
- **AND** 点击跳转到 tracker 页对应条目

#### Scenario: 无待处理操作

- **WHEN** 没有需要立即处理的事项
- **THEN** 显示温暖文案："一切尽在掌握——去探索页和 AI 聊聊职业规划？"

### Requirement: 最近动态

系统 SHALL 在首页展示最近的求职活动时间线。

#### Scenario: 有最近活动

- **WHEN** 存在近 7 天内的求职活动（评估/投递/面试/练习）
- **THEN** 以垂直时间线展示最近 5 条活动
- **AND** 每条显示：相对时间（"2 小时前"）、活动类型图标、简短描述
- **AND** 点击可跳转到对应详情

#### Scenario: 无最近活动

- **WHEN** 7 天内无任何活动
- **THEN** 显示："最近还没有活动——去评估你的第一个 JD 吧"
