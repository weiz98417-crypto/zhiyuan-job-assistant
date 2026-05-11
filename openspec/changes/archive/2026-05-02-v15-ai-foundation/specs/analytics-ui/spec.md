# Spec: Analytics UI

## MODIFIED Requirements

### Requirement: 求职周报

系统 SHALL 通过 AI 自动生成每周求职健康报告，包含数据汇总、趋势分析和行动建议。

#### Scenario: AI 周报内容

- **WHEN** 用户点击"生成周报"
- **THEN** AI 汇总本周数据：投递数量、通过率、方向分布、关键事件
- **AND** 附带 AI 点评和建议（如"你的 AI PM 方向通过率最高(60%)，建议重点投递"）
- **AND** 配上一句温暖的鼓励语

#### Scenario: 数据不足时的提示

- **WHEN** 用户投递数据 < 3 条
- **THEN** 提示"数据还不够，继续投递吧！有了更多数据我才能帮你分析"

#### Scenario: 历史周报查看

- **WHEN** 用户查看历史周报
- **THEN** 按周倒序展示，可对比两周之间的变化趋势

## ADDED Requirements

### Requirement: Pipeline 健康度检查

系统 SHALL 评估求职 Pipeline 健康状态并以指示灯展示。

#### Scenario: 健康 Pipeline

- **WHEN** Pipeline 各阶段呈漏斗状分布
- **THEN** 显示绿色指示灯："Pipeline 健康，推进节奏良好"

#### Scenario: 不健康 Pipeline

- **WHEN** 80% 申请停留在初筛阶段
- **THEN** 显示黄/红指示灯 + 具体建议

#### Scenario: 空 Pipeline

- **WHEN** 无活跃申请
- **THEN** 显示灰色指示灯 + 鼓励投递

### Requirement: 异常检测

系统 SHALL 检测求职数据中的异常模式并主动提醒。

#### Scenario: 零回复预警

- **WHEN** 用户在某方向投递 > 5 份但零回复
- **THEN** 提示"建议检查简历匹配度或调整方向"

#### Scenario: 回复速度异常

- **WHEN** 某方向回复速度显著快于其他方向
- **THEN** 提示"可能是急招或高流动性，建议深入了解"

### Requirement: Offer 时间预测

系统 SHALL 基于 Pipeline 进度预测收到 Offer 的时间窗口。

#### Scenario: 有足够数据时预测

- **WHEN** 投递记录 > 10 条且 Pipeline 中有面试阶段申请
- **THEN** 显示预测时间窗口和推算依据

#### Scenario: 数据不足时

- **WHEN** 投递记录不足
- **THEN** 显示"数据不足，继续投递后我会给出预测"
