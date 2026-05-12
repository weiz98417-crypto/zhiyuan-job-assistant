## ADDED Requirements

### Requirement: Chat sessions SHALL be persisted server-side via SQLite

聊天会话 SHALL 通过 API 读写 SQLite，Dexie `chatSessions` 降级为首次加载后的只读缓存。

#### Scenario: 创建会话

- **WHEN** 用户开始新对话
- **THEN** `POST /api/sessions` 写入 SQLite `sessions` 表（title, messages JSON, created_at）
- **AND** 返回 `{ success: true, data: { id, title, createdAt } }`

#### Scenario: 列出会话

- **WHEN** 用户打开会话列表
- **THEN** `GET /api/sessions` 返回 SQLite 中所有会话（按 updated_at 降序，排除软删除）
- **AND** 首次加载后写入 Dexie 缓存

#### Scenario: 切换会话

- **WHEN** 用户点击历史会话
- **THEN** `GET /api/sessions/:id` 返回完整 messages 数组
- **AND** 前端渲染消息历史

#### Scenario: 多设备同步

- **WHEN** 用户在另一浏览器打开应用
- **THEN** 会话列表从 SQLite 加载（非 IndexedDB）
- **AND** 所有历史会话可见

### Requirement: Sessions SHALL support soft delete

会话软删除——标记 `deleted_at` 而非物理删除，5 秒内可撤销。

#### Scenario: 删除会话

- **WHEN** 用户删除会话
- **THEN** `PATCH /api/sessions/:id` 设置 `deleted_at = now`
- **AND** 5 秒内 `PATCH` 清空 `deleted_at` 可撤销
