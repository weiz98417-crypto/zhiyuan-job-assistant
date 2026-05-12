## P1: 跨会话持久化

### 1. SQLite Schema — sessions 表

- [x] 1.1 在 `data/zhiyuan.db` 新建 `sessions` 表（id, title, messages_json, pinned, deleted_at, created_at, updated_at）
- [x] 1.2 新建 `cv_data` 表（id, data_json, updated_at）
- [x] 1.3 新建 `offers` 表（id, company, role, monthly_salary, bonus, equity, location, level, benefits_json, application_id, created_at）
- [x] 1.4 新建 `stories` 表（id, title, situation, task, action, result, tags_json, created_at）
- [x] 1.5 新建 `agent_preferences` 表（id, type, entity, weight, decay_rate, last_updated, created_at）

### 2. Sessions API

- [x] 2.1 新建 `POST /api/sessions` — 创建会话，写入 SQLite
- [x] 2.2 新建 `GET /api/sessions` — 列出会话（排除 deleted_at IS NOT NULL）
- [x] 2.3 新建 `GET /api/sessions/[id]` — 获取单个会话完整数据
- [x] 2.4 新建 `PATCH /api/sessions/[id]` — 更新会话（title, messages, deleted_at, pinned）
- [x] 2.5 修改 `agent/sessions.ts` — 从 Dexie CRUD 切换为 API 调用 + Dexie 缓存

### 3. CV Data API

- [x] 3.1 新建 `GET /api/cv/data` — 从 SQLite 读取 CV JSON
- [x] 3.2 新建 `PUT /api/cv/data` — 写入 CV JSON 到 SQLite
- [x] 3.3 修改 `lib/cv-storage.ts` — 保存时同时写 API + localStorage

### 4. Agent Preferences API

- [x] 4.1 新建 `GET /api/agent/prefs` — 返回当前有效偏好（已应用时间衰减）
- [x] 4.2 新建 `POST /api/agent/prefs` — 更新偏好权重
- [x] 4.3 修改 `agent/memory.ts` — Agent 偏好从 API 加载

## P2: 功能数据

### 5. Offers API

- [x] 5.1 新建 `GET /api/offers` — 列出所有 Offer
- [x] 5.2 新建 `POST /api/offers` — 添加 Offer
- [x] 5.3 新建 `DELETE /api/offers/[id]` — 删除 Offer
- [x] 5.4 修改 `compare/page.tsx` — 从 API 加载 Offer，Dexie 降级为缓存

### 6. Stories API

- [x] 6.1 新建 `GET /api/stories` — 列出所有 STAR 故事
- [x] 6.2 新建 `POST /api/stories` — 添加故事
- [x] 6.3 新建 `PUT /api/stories/[id]` — 更新故事
- [x] 6.4 新建 `DELETE /api/stories/[id]` — 删除故事
- [x] 6.5 修改 `interview/page.tsx` — 从 API 加载，Dexie 降级为缓存

### 7. 验证

- [x] 7.1 创建会话 → 关闭浏览器 → 重新打开 → 会话列表仍在
- [x] 7.2 保存 CV → 换浏览器 → CV 数据仍在
- [x] 7.3 添加 Offer → API 返回数据
- [x] 7.4 添加 STAR 故事 → API 返回数据
- [x] 7.5 Agent 偏好跨会话保持
