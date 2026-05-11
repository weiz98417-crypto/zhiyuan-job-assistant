## MODIFIED Requirements

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

## ADDED Requirements

### Requirement: 信号批量写入 API

系统 SHALL 提供批量信号写入端点以减少请求次数。

#### Scenario: 批量写入信号

- **WHEN** 客户端扫描到多条新信号
- **THEN** 系统 SHALL 通过 `POST /api/data/signals/batch` 一次性写入
- **AND** 每条信号 SHALL 包含 source、signal_type、content_json、session_id
