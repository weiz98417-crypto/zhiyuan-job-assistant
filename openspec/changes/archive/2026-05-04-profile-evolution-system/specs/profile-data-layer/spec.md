## ADDED Requirements

### Requirement: SQLite 为单一数据源

系统 SHALL 以 SQLite（zhiyuan.db）为唯一数据源，所有数据写入操作 SHALL 通过 Next.js API Routes 执行。DexieDB SHALL 降级为前端 UI 缓存层，不直接写入业务数据。

#### Scenario: API 写入 applications

- **WHEN** 前端需要写入或更新 applications 数据
- **THEN** 数据 SHALL 通过 `PUT/POST /api/data/applications` 写入 SQLite
- **AND** DexieDB SHALL 通过轮询或事件同步更新本地缓存

#### Scenario: DexieDB 缓存同步

- **WHEN** `/api/data/profile` 返回最新画像数据
- **THEN** 前端 SHALL 将数据写入 DexieDB profiles 表作为缓存
- **AND** UI 渲染 SHALL 优先使用 DexieDB 缓存数据
- **AND** API 不可用时，DexieDB 缓存数据作为离线兜底

### Requirement: Profile Signals 表

SQLite schema SHALL 新增 `profile_signals` 表，存储从对话、评估、面试中提取的结构化画像信号。

#### Scenario: 信号写入

- **WHEN** dingwei 对话中 Agent 提取到画像信号
- **THEN** 信号 SHALL 写入 profile_signals 表
- **AND** 每条信号包含：source（来源）、signal_type（信号类型）、content_json（信号内容）、session_id（关联会话）、created_at（时间戳）

#### Scenario: 信号查询

- **WHEN** Profile Engine 需要融合对话信号
- **THEN** 系统 SHALL 从 profile_signals 表查询最近 30 天的信号
- **AND** 按 signal_type 分组聚合后传入融合逻辑

### Requirement: Profiles 表扩展

SQLite `profiles` 表 SHALL 扩展 `goals_json` 字段，与 `data_json` 分离存储，使 goals 的读写不依赖完整 data_json 的反序列化。

#### Scenario: goals 独立读写

- **WHEN** dingwei 对话写入用户目标岗位
- **THEN** 系统 SHALL 更新 profiles 表的 goals_json 字段
- **AND** `data_json` 字段不受影响
