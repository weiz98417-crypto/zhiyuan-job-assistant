# Spec: JD-Report Association

## ADDED Requirements

### Requirement: 报告卡片显示关联 JD 状态

报告卡片 SHALL 显示是否有关联 JD 库中的记录，并提供跳转链接。

#### Scenario: 有关联 JD 时的显示

- **WHEN** 报告卡片对应的 JD 在 `jds` 表中存在（通过 JD body 前200字匹配或 `reportId` 关联）
- **THEN** 卡片上显示"查看 JD"链接图标
- **AND** 点击后跳转到 JD 库详情页

#### Scenario: 无关联 JD 时的显示

- **WHEN** 报告没有对应的 JD 库记录
- **THEN** 不显示"查看 JD"链接

### Requirement: JD 详情显示关联报告

JD 详情面板 SHALL 显示关联的报告信息，并提供跳转链接。

#### Scenario: JD 有关联报告时的显示

- **WHEN** JD 的 `reportId` 不为空且对应报告存在
- **THEN** JD 详情面板显示"查看评估报告"按钮
- **AND** 按钮上显示报告评分和日期
- **AND** 点击后打开报告详情面板

#### Scenario: JD 无关联报告时的显示

- **WHEN** JD 的 `reportId` 为空或对应报告已被删除
- **THEN** 显示"暂无评估报告"并提供"去评估"跳转链接

### Requirement: 关联维护

删除报告时 SHALL 自动解除关联 JD 的 `reportId` 引用。

#### Scenario: 删除报告解除关联

- **WHEN** 用户删除某份报告
- **AND** `jds` 表中存在 `reportId` 指向该报告的 JD 记录
- **THEN** 该 JD 记录的 `reportId` 设为 `undefined`
- **AND** JD 记录本身不删除
