## Why

当前 12 个 Dexie 表中 8 个、10 个 localStorage 键全部只存前端。用户换个浏览器/清缓存/用隐私模式，所有数据丢失。更致命的是：Agent 的 Career DNA 读 IndexedDB，而 `config/profile.yml` 才是真相来源——导致 LLM 不知道用户的经验级别（"高级AI产品经理(高级/负责人)"），猜成"应届生"。

## What Changes

### P0：Agent 直接依赖的数据（已部分完成）

- `/api/profile/dna`：从 `config/profile.yml` 读取 Career DNA（**已完成**）
- `/api/cv/dna`：从服务端读 CV 关键摘要（角色、公司、学历、技能）
- `/api/memory/dna`：从 SQLite 读跨会话语义记忆（技能、偏好、底线）

### P1：跨会话持久化

- Chat sessions 从 IndexedDB → SQLite（`/api/sessions/*` CRUD）
- Agent preferences（角色/公司偏好 + 衰减）→ SQLite（`/api/agent/prefs/*`）
- CV 数据（`zhiyuan-cv` localStorage）→ SQLite（`/api/cv/data`）

### P2：功能数据

- Offers → SQLite
- STAR stories → SQLite
- Agent decisions/interactions → SQLite（可选，量大可延迟）

### 不动

- `zhiyuan-theme`（主题偏好，前端 UI 状态，合理）
- `zhiyuan-profile-sop-state`（SOP 状态机，前端会话状态，合理）
- Dexie 保留作为**只读缓存层**（首次从 API 加载，后续读缓存加速 UI）

## Capabilities

- `profile-dna-api`: `/api/profile/dna` — 从 config/profile.yml 读取用户 Career DNA（已完成）
- `cv-dna-api`: `/api/cv/dna` — 从服务端读 CV 摘要
- `memory-dna-api`: `/api/memory/dna` — 从 SQLite 读跨会话语义记忆
- `session-server-storage`: Chat sessions 服务端 CRUD + 迁移 API
- `agent-prefs-server-storage`: Agent 偏好模型服务端存储
- `cv-server-storage`: CV 数据服务端存储
- `offer-server-storage`: Offer 数据服务端存储
- `story-server-storage`: STAR 故事服务端存储

## Impact

| 数据 | 当前 | 目标 |
|------|------|------|
| Career DNA | IndexedDB `profiles` | `/api/profile/dna` ✅ |
| CV 摘要 | localStorage `zhiyuan-cv` | `/api/cv/dna` |
| 语义记忆 | localStorage `zhiyuan_semantic_facts` | `/api/memory/dna` |
| Chat sessions | IndexedDB `chatSessions` | SQLite + `/api/sessions/*` |
| Agent prefs | IndexedDB `agentPreferences` | SQLite + `/api/agent/prefs` |
| CV 数据 | localStorage `zhiyuan-cv` | SQLite + `/api/cv/data` |
| Offers | IndexedDB `offers` | SQLite + `/api/offers/*` |
| Stories | IndexedDB `stories` | SQLite + `/api/stories/*` |
| Agent interactions | IndexedDB | **保留前端**（量大、不跨会话） |
| 主题/UI 状态 | localStorage | **保留前端**（合理） |
