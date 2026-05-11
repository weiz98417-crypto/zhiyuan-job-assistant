## ADDED Requirements

### Requirement: Agent SHALL detect overdue pipeline items

`check_pipeline_health` 工具 SHALL 查询投递记录，识别距离上次联系超过 7 天的项，按逾期天数降序排列。

#### Scenario: 存在逾期项

- **WHEN** 投递记录中存在 3 天前和 10 天前的未回复项
- **THEN** 返回逾期列表，标记 10 天前为 "⚠️ 逾期"，3 天前为 "正常"
- **AND** 格式化为表格：公司、岗位、投递日期、已过天数、建议操作

#### Scenario: 无逾期项

- **WHEN** 所有投递记录均在 7 天内
- **THEN** 返回 "✅ 管道健康，所有投递在正常跟进周期内"

#### Scenario: 无投递记录

- **WHEN** 数据库中无投递记录
- **THEN** 返回 "暂无投递记录"
