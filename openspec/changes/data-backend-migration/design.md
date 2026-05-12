## Context

盘点结果：8 个 Dexie 表 + 10 个 localStorage 键仅存前端。Agent 的 Career DNA 从 IndexedDB 读 → 数据可能不存在或过时。用户配置在 `config/profile.yml` 是真相来源但 Agent 读不到。

## Goals / Non-Goals

**Goals:** 所有 Agent 行为依赖的数据（画像、CV、记忆、偏好、会话）从服务端读写。前端 Dexie/localStorage 降级为缓存层。

**Non-Goals:** 不改 UI 组件内部状态管理逻辑。不迁移纯前端 UI 状态（主题、SOP 状态）。

## Decisions

### D1: 迁移策略 → API-first，前端缓存层

每个数据域建一个 `/api/*` 端点，前端首次调 API 获取数据，后续写 Dexie 缓存加速 UI。写操作始终走 API → SQLite。

**Why:** 不破坏现有 UI 组件的大量 Dexie 读操作。渐进迁移，每个 API 独立可测。

### D2: CV 数据 → `/api/cv/dna` 返回摘要

CV 完整数据仍在 localStorage（CV 编辑器需要），Agent 只需要摘要：角色、公司、学历、技能关键词。`/api/cv/dna` 从 `config/profile.yml` + `cv.md` 提取。

### D3: 语义记忆 → SQLite `session_memory` 表

新建 SQLite 表替代 localStorage `zhiyuan_semantic_facts`：
```sql
CREATE TABLE session_memory (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER DEFAULT 0,
  summary_type TEXT, -- 'episodic' | 'semantic'
  content TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
```

### D4: 迁移顺序 → P0 先（Agent 行为核心）→ P1（跨会话）→ P2（功能数据）

## Risks

- **[Risk]** Dexie schema 大量代码依赖 `db.xxx.toArray()` — 改成 `fetch /api` 回调 DB 需要逐个组件改 → P0 不改 UI 组件，只改 `shared-memory.ts` 和 Agent 工具中的数据源
- **[Risk]** `/api/profile/dna` 已实现但只在 `shared-memory.ts` 中被调用 — 其他用到 profile 的地方（推荐、画像页）仍读 IndexedDB → 逐步切换
