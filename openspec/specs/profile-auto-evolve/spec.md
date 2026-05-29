## ADDED Requirements

### Requirement: 评估后自动更新画像

每次 JD 评估完成后，系统 SHALL 自动触发画像更新。此外，系统 SHALL 在用户对话中自动扫描消息提取信号。

#### Scenario: 评估完成触发更新

- **WHEN** Agent Chat 中 JD 评估完成（eval `done` 事件）
- **THEN** 系统 SHALL 静默调用 `/api/profile/analyze`（`force: false`）
- **AND** 同时 SHALL 扫描评估中的 JD 文本和用户反应提取信号
- **AND** 调用 SHALL 不阻塞对话 UI

#### Scenario: 24h 缓存

- **WHEN** 上次 analyze 距今不足 24 小时且非对话触发的强制更新
- **THEN** `/api/profile/analyze` SHALL 返回缓存结果
- **AND** 对话结束/切换会话触发的更新 SHALL 绕过缓存（`force: true`）

### Requirement: 自我定位对话中动态更新画像

用户在进行自我定位对话或其他 Agent 对话时，系统 SHALL 自动扫描用户消息并提取信号，不依赖 AI 模型主动调用 mine_profile 工具。

#### Scenario: 对话消息自动信号提取

- **WHEN** 用户在 Agent Chat 中发送任意消息
- **THEN** 系统 SHALL 异步扫描消息内容，提取技能提及、角色偏好、底线条件、公司偏好、薪资期望
- **AND** 提取到的信号 SHALL 写入 `profile_signals` 表（source="auto_scan"）
- **AND** AI 模型仍可通过 mine_profile 工具手动写入信号，两种方式共存

#### Scenario: 对话结束触发画像更新

- **WHEN** 用户切换会话、新建会话、或离开 Agent 页面
- **THEN** 系统 SHALL 自动调用 `triggerProfileUpdate({ force: true })`
- **AND** 调用 SHALL 为 fire-and-forget，不阻塞 UI

#### Scenario: 用户切换查看画像

- **WHEN** 用户在 Agent 对话进行中切换到 `/profile` 页面
- **THEN** 页面 SHALL 展示最新画像数据（包含当前对话中自动提取的信号）
- **AND** 每 5 秒轮询获取最新数据
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

### Requirement: 信号批量写入 API

系统 SHALL 提供批量信号写入端点以减少请求次数。

#### Scenario: 批量写入信号

- **WHEN** 客户端扫描到多条新信号
- **THEN** 系统 SHALL 通过 `POST /api/data/signals/batch` 一次性写入
- **AND** 每条信号 SHALL 包含 source、signal_type、content_json、session_id
