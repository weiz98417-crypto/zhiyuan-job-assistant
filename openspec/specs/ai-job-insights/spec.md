## MODIFIED Requirements

### Requirement: Pipeline 健康度检查

系统 SHALL 分析 Pipeline 各阶段分布并生成健康评估，支持可配置的告警阈值。

#### Scenario: 健康分布检测

- **WHEN** Pipeline 中存在至少 5 条申请记录
- **THEN** 系统计算各阶段占比：初筛(Evaluated)、已投递(Applied)、面试中(Interview)、已Offer(Offer)
- **AND** 如果初筛阶段 ≤ 60%，输出"Pipeline 呈漏斗状健康分布"
- **AND** 如果面试+Offer 阶段 > 30%，输出"Pipeline 后期转化良好"

#### Scenario: 阶段堆积警告

- **WHEN** 初筛阶段（Evaluated）占比超过 70%
- **THEN** 输出警告："警告：大部分申请停留在初筛阶段——建议暂停新投递，集中跟进已有机会"
- **AND** 健康面板指示灯变为黄色
- **AND** 在待处理操作区生成跟进建议

#### Scenario: 严重堆积告警

- **WHEN** 初筛阶段占比超过 80%，或某方向连续 5 次以上零回复
- **THEN** 输出紧急告警："紧急：Pipeline 严重堵塞——立即停止新投递，检查简历和目标方向"
- **AND** 健康面板指示灯变为红色
- **AND** 在待处理操作区生成修正操作

#### Scenario: 可配置阈值

- **WHEN** 用户在设置中修改了告警阈值
- **THEN** 健康检查使用用户自定义阈值（而非默认值）
- **AND** 阈值存储在求职画像的 preferences 中

#### Scenario: 数据不足

- **WHEN** Pipeline 中申请记录少于 5 条
- **THEN** 输出："数据不足——至少需要 5 条申请记录才能生成健康评估"
- **AND** 健康面板显示引导状态
