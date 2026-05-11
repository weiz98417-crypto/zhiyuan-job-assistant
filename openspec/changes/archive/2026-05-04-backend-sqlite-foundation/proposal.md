## Why

当前数据层分裂为两套互不相通的系统：前端 IndexedDB（Dexie.js，11 张表）和后端文件系统（Markdown/TSV/YAML 碎片文件）。`/api/profile/analyze` 等服务端接口无法访问 IndexedDB，导致画像分析等功能从未真正工作。CLI 脚本写 Markdown 文件，前端读 IndexedDB，仅在 Settings 页的「从 CLI 导入」按钮处单向手动同步。DATA_CONTRACT.md 定义的"User Layer / System Layer"文件契约在实操中形同虚设。

## What Changes

- 引入 SQLite（better-sqlite3）作为后端唯一数据库，替代碎片化的 Markdown/TSV/YAML 文件
- 创建四张核心表：`applications`、`reports`、`jds`、`profiles`
- 提供 REST API：`GET/POST /api/data/applications`、`GET /api/data/reports/:id`、`GET/POST /api/data/jds`、`GET/PUT /api/data/profile`
- 废弃 `data/applications.md`、`batch/tracker-additions/*.tsv`、`config/profile.yml` 等文件的写入逻辑
- IndexedDB 降级为只读缓存，前端从 API 读取后缓存到本地

## Capabilities

### New Capabilities

- `sqlite-backend`: SQLite 数据库 + Node.js 访问层（db.ts server-side）
- `data-rest-api`: `/api/data/*` REST 端点，提供 applications/reports/jds/profile 的 CRUD

### Modified Capabilities

- `profile-auto-evolve`: 画像分析从读 IndexedDB 改为读 SQLite
- `zh-evaluation-engine`: 评估报告写入从 reports/*.md 改为 SQLite

## Impact

- 新增：`dashboard/db.ts`（SQLite 访问层）、`dashboard/schema.sql`（建表语句）、`frontend/src/app/api/data/applications/route.ts`、`frontend/src/app/api/data/reports/route.ts`、`frontend/src/app/api/data/jds/route.ts`、`frontend/src/app/api/data/profile/route.ts`
- 改造：`frontend/src/app/api/profile/analyze/route.ts`（读 SQLite 替代 IndexedDB）、`frontend/src/app/api/evaluate/stream/route.ts`（写 SQLite 替代文件写入）、`frontend/src/app/api/data/import/route.ts`（从 SQLite 读而非文件系统）
- 废弃：`data/applications.md` 写入、`batch/tracker-additions/*.tsv`、`merge-tracker.mjs`、`dedup-tracker.mjs`
- 依赖：`better-sqlite3`（npm 包）
