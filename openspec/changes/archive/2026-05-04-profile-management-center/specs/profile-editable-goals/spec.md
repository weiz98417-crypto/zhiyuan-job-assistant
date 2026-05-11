## ADDED Requirements

### Requirement: 目标岗位卡片编辑入口

目标岗位卡片 SHALL 在右上角显示编辑按钮（铅笔图标）。点击 SHALL 弹出编辑表单对话框。

#### Scenario: 点击编辑按钮弹出表单

- **WHEN** 用户点击目标岗位卡片右上角的编辑按钮
- **THEN** 系统 SHALL 弹出 Modal 表单，标题为「编辑求职目标」
- **AND** 表单预填当前画像中的 goals 数据

### Requirement: 目标岗位增删

编辑表单 SHALL 支持添加和删除目标岗位角色。

#### Scenario: 添加目标角色

- **WHEN** 用户在编辑表单中点击「+ 添加岗位」按钮
- **THEN** 表单 SHALL 新增一行输入：角色名称（文本）+ 级别（下拉：初级/中级/高级/负责人/专家）
- **AND** 用户可输入自定义角色名

#### Scenario: 删除目标角色

- **WHEN** 用户点击某个目标角色条目旁的删除按钮（✕）
- **THEN** 该条目 SHALL 立即从表单中移除
- **AND** 至少保留一个角色条目（最后一条不可删除）

### Requirement: 薪资与底线编辑

编辑表单 SHALL 包含薪资期望区间（min/max，单位 K）和底线条件列表。

#### Scenario: 编辑薪资区间

- **WHEN** 用户在表单中修改薪资 min 或 max 输入框的值
- **THEN** 输入值 SHALL 实时校验（必须为正整数，max ≥ min）

#### Scenario: 增删底线条件

- **WHEN** 用户点击「+ 添加底线条件」按钮
- **THEN** 表单 SHALL 新增一行文本输入，placeholder 为"例如：五险一金全额、不加班、不外包"
- **AND** 用户可删除已有底线条目

### Requirement: 保存与锁定

编辑表单提交时 SHALL 调用 PATCH `/api/data/profile` 写入 goals_json，并标记 `confirmedAt` 时间戳。

#### Scenario: 保存目标变更

- **WHEN** 用户点击表单中的「保存」按钮
- **THEN** 系统 SHALL 发送 PATCH 请求更新 goals_json
- **AND** 请求 SHALL 包含 `source: "manual"` 标记
- **AND** 成功后关闭 Modal 并刷新页面数据

#### Scenario: 取消编辑

- **WHEN** 用户点击表单中的「取消」按钮或点击 Modal 外部区域
- **THEN** 表单 SHALL 关闭，不保存任何修改
