# Spec: AI Job Insights

## ADDED Requirements

### Requirement: AI 周报生成

系统 SHALL 根据用户的投递数据，自动生成每周求职健康报告。

#### Scenario: 手动生成周报

- **WHEN** 用户点击"生成周报"
- **THEN** AI 汇总本周数据生成报告：投递数量、通过率、方向分布、关键事件
- **AND** 附带 AI 点评："你的 AI PM 方向通过率最高(60%)，建议重点投递"

#### Scenario: 首次使用提示

- **WHEN** 用户数据不足以生成周报（投递 < 3 条）
- **THEN** 提示"数据还不够，继续投递吧！有了更多数据我才能帮你分析"

### Requirement: Pipeline 健康度检查

系统 SHALL 评估用户求职 Pipeline 的健康状态。

#### Scenario: 健康 Pipeline

- **WHEN** Pipeline 各阶段呈漏斗状分布（初筛 > 面试 > 终面 > Offer）
- **THEN** 显示绿色指示灯："Pipeline 健康，推进节奏良好"

#### Scenario: 不健康 Pipeline

- **WHEN** 80% 申请停留在初筛阶段，没有后续推进
- **THEN** 显示黄色/红色指示灯 + 建议："建议暂停新投递，集中跟进已有申请"

#### Scenario: 空 Pipeline

- **WHEN** Pipeline 中无活跃申请
- **THEN** 显示灰色指示灯："Pipeline 为空，开始投递吧！"

### Requirement: 异常检测

系统 SHALL 检测求职数据中的异常模式。

#### Scenario: 回复速度异常

- **WHEN** 某个方向的岗位平均回复时间显著快于其他方向
- **THEN** 提示"X 方向回复速度异常快，可能是急招或高流动性，建议深入了解"

#### Scenario: 零回复预警

- **WHEN** 用户在某方向投递 > 5 份但零回复
- **THEN** 提示"X 方向投递 5 份零回复，建议检查简历匹配度或调整方向"

### Requirement: Offer 时间预测

系统 SHALL 基于当前 Pipeline 进度和历史转化率，预测收到 Offer 的时间窗口。

#### Scenario: 有足够数据时预测

- **WHEN** 用户有 10+ 条投递记录，Pipeline 中有至少 1 个面试阶段申请
- **THEN** 显示预测："按当前进度，预计 3-4 周内会有第一个 Offer"
- **AND** 显示推算依据

#### Scenario: 数据不足时

- **WHEN** 投递记录不足
- **THEN** 显示"数据不足，继续投递后我会给出预测"
