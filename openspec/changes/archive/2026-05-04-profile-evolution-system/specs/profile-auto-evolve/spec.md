## MODIFIED Requirements

### Requirement: 评估后自动更新画像

每次 JD 评估完成后，系统 SHALL 自动触发画像更新。更新逻辑 SHALL 改为从 SQLite 读取三层信号融合，而非从 DexieDB 统计数据生成。

#### Scenario: 评估完成触发更新

- **WHEN** Agent Chat 中 JD 评估完成（eval `done` 事件）
- **THEN** 系统 SHALL 静默调用 `/api/profile/analyze`（`force: false`）
- **AND** 服务端 Profile Engine SHALL 从 SQLite 读取数据做三层融合
- **AND** 调用 SHALL 不阻塞对话 UI

#### Scenario: 24h 缓存

- **WHEN** 上次 analyze 距今不足 24 小时且非 dingwei 对话触发
- **THEN** `/api/profile/analyze` SHALL 返回缓存结果
- **AND** dingwei 对话触发的更新 SHALL 绕过缓存（`force: true`）

### Requirement: 自我定位对话中动态更新画像

用户在进行「自我定位」对话时，每完成一个阶段的回答，系统 SHALL 通过 mine_profile 工具触发画像增量更新。更新 SHALL 融合当前对话中已收集的信号。

#### Scenario: 每阶段回答后触发更新

- **WHEN** 用户在 dingwei 对话中完成一个阶段的回答（Agent 已确认总结）
- **THEN** 系统 SHALL 调用 mine_profile 写入信号到 profile_signals 表
- **AND** SHALL 触发 `/api/profile/analyze`（`force: true`）
- **AND** 调用 SHALL 不打断对话流程（后台静默执行）

#### Scenario: 用户切换查看画像

- **WHEN** 用户在 dingwei 对话进行中切换到 `/profile` 页面
- **THEN** 页面 SHALL 展示最新画像数据（包含当前对话中已收集的信号）
- **AND** EvolutionTimeline SHALL 展示新增的变更记录
- **AND** 用户切回 Agent Chat 后对话不中断

### Requirement: Profile Engine 服务端化

Profile 生成逻辑 SHALL 迁移到服务端 `/api/profile/analyze`，从 SQLite 而非 DexieDB 读取数据。

#### Scenario: 服务端运行

- **WHEN** `/api/profile/analyze` 被调用
- **THEN** 服务端 SHALL 从 SQLite 读取 applications、reports、profile_signals、CV 数据
- **AND** SHALL 调用 DeepSeek API 做 LLM 推断
- **AND** SHALL 将结果写入 SQLite profiles 表
- **AND** 前端 READ 时从 API 获取最新结果

### Requirement: EvolutionTimeline 自动记录

画像每次更新时，EvolutionTimeline SHALL 自动新增记录条目。记录 SHALL 包含更新原因（来源），而非仅"LLM 画像分析完成"。

#### Scenario: 自动记录变更含来源

- **WHEN** Profile Engine 生成了新的画像数据
- **THEN** history 数组 SHALL 追加一条 ProfileHistoryEntry
- **AND** 条目 SHALL 包含：时间戳、事件描述（如"初次定位完成"、"方向变更：AI产品→AI运营"）、变更摘要列表、来源标记（dingwei/evaluation/auto）
- **AND** `/profile` 页面的 EvolutionTimeline SHALL 展示最新记录

#### Scenario: 多次评估累计进化

- **WHEN** 用户完成了 3 次 JD 评估
- **THEN** EvolutionTimeline SHALL 展示至少 3 条画像变更记录
- **AND** 最新记录排在最前
