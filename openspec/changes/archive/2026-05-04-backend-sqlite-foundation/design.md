## Context

当前数据层：前端 IndexedDB (Dexie 11 表) + 后端文件系统 (Markdown/TSV/YAML)。两者没有可靠同步，服务端 API 无法访问前端数据，CLI 和前端各写各的。

## Goals / Non-Goals

**Goals:** SQLite 作为后端唯一数据库，前端通过 REST API 读写，IndexedDB 降级为缓存。
**Non-Goals:** 不迁对话历史（chatSessions）、不迁面试练习记录

## Decisions

### Decision 1: better-sqlite3

同步 API、零配置、单文件数据库（`data/career-ops.db`）。比异步的 sql.js 更适合 CLI 脚本。

### Decision 2: 四张核心表

```sql
applications (id, num, date, company, role, score, status, pdf, report_url, notes, created_at, updated_at)
reports     (id, report_num, date, company, role, archetype, score, legitimacy, blocks_json, keywords_json, created_at)
jds         (id, company, role, source_type, source_url, body, keywords_json, report_id, created_at)
profiles    (id, data_json, history_json, last_updated)
```

### Decision 3: API 设计

```
GET    /api/data/applications          → 列表，支持 ?status=&company=&page=
POST   /api/data/applications          → 新增或更新（按 company+role 去重）
GET    /api/data/reports/:reportNum    → 单份报告
GET    /api/data/reports               → 报告列表
GET    /api/data/jds                   → JD 列表
POST   /api/data/jds                   → 新建 JD
GET    /api/data/profile               → 获取画像
PUT    /api/data/profile               → 更新画像
```

### Decision 4: 迁移策略

保留 Markdown 文件只读兼容。首次启动时从 files 迁移数据到 SQLite，之后文件不再写入。
