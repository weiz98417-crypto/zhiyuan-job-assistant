## ADDED Requirements

### Requirement: 快讯设置区域

设置页 SHALL 新增"快讯设置"区域，允许用户管理目标公司列表和刷新频次。

#### Scenario: 目标公司管理

- **WHEN** 用户打开设置页的快讯设置区域
- **THEN** 展示当前目标公司列表（tag/pill 形式，可点击删除）
- **AND** 提供输入框 + 添加按钮新增公司
- **AND** 数据写入 `profiles` 表的 `goals_json` 中 `target_companies` 字段

#### Scenario: 刷新频次选择

- **WHEN** 用户在快讯设置中选择刷新频次
- **THEN** 提供下拉选项：每 6 小时 / 每 12 小时 / 每天 / 手动
- **AND** 选择后保存到 `profiles` 表的 `goals_json` 中 `news_refresh_interval` 字段
