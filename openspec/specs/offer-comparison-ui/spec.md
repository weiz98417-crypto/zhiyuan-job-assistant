# Spec: Offer Comparison UI

## ADDED Requirements

### Requirement: Offer 录入

用户可以录入或从投递追踪导入 Offer 信息。

#### Scenario: 手动录入 Offer

- **WHEN** 用户点击"添加 Offer"
- **THEN** 显示 Offer 信息表单：公司、岗位、月薪（税前/税后）、年终奖、期权/股票、五险一金、试用期、入职时间、其他福利
- **AND** 所有金额字段支持税前/税后自动换算

#### Scenario: 从投递追踪导入

- **WHEN** 用户从投递追踪中选择状态为"已获 Offer"的记录
- **THEN** Offer 信息自动填充
- **AND** 关联原始评估报告

### Requirement: 并排对比

用户可以选择 2-4 个 Offer 进行并排比较。

#### Scenario: 选择 Offer 对比

- **WHEN** 用户勾选 2 个以上 Offer 并点击"对比"
- **THEN** 以并排表格显示各 Offer 的关键维度
- **AND** 每个维度的最优值以暖色高亮

#### Scenario: 雷达图可视化

- **WHEN** 对比视图中有 2 个以上 Offer
- **THEN** 显示多维度雷达图（薪资、成长空间、WLB、公司前景、团队匹配、风险）
- **AND** 各维度分数来自原始评估报告或用户手动评分

#### Scenario: 总薪酬计算

- **WHEN** 对比 Offer 时
- **THEN** 系统自动计算年总包（月薪×月数+年终奖+期权年化价值）
- **AND** 显示五险一金缴纳基数差异对实发工资的影响

### Requirement: 决策辅助

系统提供结构化的决策辅助工具。

#### Scenario: 决策矩阵

- **WHEN** 用户查看对比结果
- **THEN** 提供加权决策矩阵（用户可调整各维度权重）
- **AND** 自动计算加权总分并排序

#### Scenario: 谈判建议

- **WHEN** 用户选择了倾向的 Offer
- **THEN** 基于薪资市场数据生成谈判话术
- **AND** 标注该 Offer 的可谈判空间（根据评估报告 Block D）
