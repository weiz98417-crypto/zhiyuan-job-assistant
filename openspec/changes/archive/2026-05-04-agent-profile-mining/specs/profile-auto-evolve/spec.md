## ADDED Requirements

### Requirement: 评估后自动更新画像

每次 JD 评估完成后，系统 SHALL 自动触发画像更新，使画像随求职行为持续进化。

#### Scenario: 评估完成触发更新

- **WHEN** Agent Chat 中 JD 评估完成（eval `done` 事件）
- **THEN** 系统 SHALL 静默调用 `/api/profile/analyze`（不带 `force` 参数）
- **AND** 调用 SHALL 不阻塞对话 UI
- **AND** 失败时 SHALL 静默忽略（不提示用户）

### Requirement: 自我定位对话中动态更新画像

用户在进行「自我定位」对话时，每完成一个阶段的回答，系统 SHALL 触发画像增量更新，使 `/profile` 页面实时反映对话中发现的信息。

#### Scenario: 每阶段回答后触发更新

- **WHEN** 用户在自我定位对话中完成一个阶段的回答（Agent 已确认总结）
- **THEN** 系统 SHALL 调用 `/api/profile/analyze` 更新画像数据
- **AND** 调用 SHALL 不打断对话流程（后台静默执行）

#### Scenario: 用户切换查看画像

- **WHEN** 用户在自我定位对话进行中切换到 `/profile` 页面
- **THEN** 页面 SHALL 展示最新画像数据（包括刚才对话中已收集的信息）
- **AND** EvolutionTimeline SHALL 展示每条新增记录
- **AND** 用户切回 Agent Chat 后对话不中断

#### Scenario: 24h 缓存避免频繁调用

- **WHEN** 上次 analyze 距今不足 24 小时且非自我定位对话触发
- **THEN** `/api/profile/analyze` SHALL 返回缓存结果
- **AND** 自我定位对话触发的更新 SHALL 绕过缓存（`force: true`）

### Requirement: EvolutionTimeline 自动记录

画像每次更新时，EvolutionTimeline SHALL 自动新增记录条目，无需用户手动触发。

#### Scenario: 自动记录变更

- **WHEN** `/api/profile/analyze` 生成了新的画像数据
- **THEN** history 数组 SHALL 追加一条 ProfileHistoryEntry
- **AND** 条目 SHALL 包含时间戳和变更摘要
- **AND** `/profile` 页面的 EvolutionTimeline SHALL 展示最新记录

#### Scenario: 多次评估累计进化

- **WHEN** 用户完成了 3 次 JD 评估
- **THEN** EvolutionTimeline SHALL 展示至少 3 条画像变更记录
- **AND** 最新记录排在最前
