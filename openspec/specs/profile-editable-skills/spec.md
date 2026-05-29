## ADDED Requirements

### Requirement: 核心技能卡片编辑入口

核心技能卡片 SHALL 在右上角显示编辑按钮。点击 SHALL 弹出技能编辑表单。

#### Scenario: 点击编辑技能

- **WHEN** 用户点击核心技能卡片右上角的编辑按钮
- **THEN** 系统 SHALL 弹出 Modal 表单，标题为「编辑核心技能」
- **AND** 表单列出当前所有技能，每条包含：技能名、熟练度滑块（0-100）、证据标签

### Requirement: 技能熟练度调整

每条技能 SHALL 可通过滑块调整熟练度（0-100）。

#### Scenario: 拖动熟练度滑块

- **WHEN** 用户在编辑表单中拖动某技能的熟练度滑块
- **THEN** 滑条旁的数字 SHALL 实时更新
- **AND** 该技能在表单中标记为"已修改"（蓝色圆点指示器）

### Requirement: 技能增删

用户 SHALL 可手动添加新技能或删除已有技能。

#### Scenario: 手动添加技能

- **WHEN** 用户点击「+ 添加技能」按钮
- **THEN** 表单 SHALL 新增一行：技能名输入框 + 熟练度滑块（默认 50）+ 证据输入框
- **AND** 新增的技能 SHALL 标记 `source: "manual"`

#### Scenario: 删除技能

- **WHEN** 用户点击某技能旁的删除按钮
- **THEN** 系统 SHALL 弹出确认提示「确定删除"XXX"技能？」
- **AND** 确认后该技能从列表移除

### Requirement: 技能修改锁定

用户手动修改过的技能 SHALL 自动标记为锁定状态，Agent 后续自动更新不覆盖该技能。

#### Scenario: 修改后自动锁定

- **WHEN** 用户保存了技能修改（熟练度调整、新增、删除）
- **THEN** 被修改的技能 SHALL 在 SQLite 中标记 `source: "manual"`
- **AND** 锁定技能在卡片上显示小锁图标
- **AND** Profile Engine 后续更新 SHALL 跳过 source 为 "manual" 的技能

#### Scenario: 解锁技能

- **WHEN** 用户在编辑表单中点击锁定技能的解锁按钮
- **THEN** 该技能的 source SHALL 重置为 `"auto"`
- **AND** 下次 Profile Engine 运行时可再次自动更新该技能
