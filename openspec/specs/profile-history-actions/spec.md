## ADDED Requirements

### Requirement: 历史记录详情查看

进化轨迹中每条记录 SHALL 可点击展开查看变更详情。

#### Scenario: 点击历史记录

- **WHEN** 用户点击进化轨迹中的某条记录
- **THEN** 系统 SHALL 弹出 Modal 展示该次变更的详细信息
- **AND** Modal 包含：变更时间、事件描述、完整的 changes 列表（每项变化的具体内容）

### Requirement: 一键还原到历史版本

历史详情 Modal SHALL 提供「还原到此版本」按钮，允许用户回退画像到该次更新后的状态。

#### Scenario: 还原历史版本

- **WHEN** 用户在历史详情 Modal 中点击「还原到此版本」按钮
- **THEN** 系统 SHALL 弹出二次确认：「确认还原画像到 XX 天前的状态？当前修改将丢失」
- **AND** 用户确认后，系统 SHALL 用该历史版本的 goals + skills + preferences 覆盖当前数据
- **AND** history 数组 SHALL 追加一条新记录：「画像已还原到 YYYY-MM-DD 的版本」
- **AND** 页面 SHALL 刷新显示还原后的画像

#### Scenario: 取消还原

- **WHEN** 用户在二次确认中点击取消
- **THEN** Modal SHALL 关闭，画像 SHALL 保持不变

### Requirement: 还原后锁定保护

还原操作完成后，还原的目标版本中的字段 SHALL 自动标记为锁定状态，防止 Agent 立即覆盖。

#### Scenario: 还原后自动锁定

- **WHEN** 用户确认还原到历史版本
- **THEN** 还原的 goals、skills、preferences 字段 SHALL 自动标记 `source: "manual"`
- **AND** 页面 SHALL 显示锁定指示器
