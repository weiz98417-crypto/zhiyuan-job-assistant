## Why

前端 18 个文件直接依赖 IndexedDB（Dexie.js）。Agent 工具（search_applications、get_profile 等）直接读 IndexedDB 表，/api/profile/analyze 等服务端接口却无法访问这些数据。迁移到后端 SQLite 后，前端需要改为通过 REST API 读写数据，IndexedDB 降级为只读缓存。

## What Changes

- Agent 工具从 `db.applications.toArray()` 改为 `fetch("/api/data/applications")`
- 涉及的工具：search_applications、get_report_detail、get_profile、get_recommendations、get_recent_activity、get_pipeline_status
- `/profile` 页面从 `loadProfile()` (IndexedDB) 改为 `fetch("/api/data/profile")`
- `/evaluate/jds` 和 `/evaluate/reports` 页面从 IndexedDB 改为调 API
- IndexedDB 保留作为离线缓存（本地存一份，优先读 API，API 不可用时用缓存）
- Settings 页「从 CLI 导入」按钮移除（不再需要）

## Capabilities

### New Capabilities

- `agent-tools-api`: Agent 工具通过 REST API 读写后端数据，不再直接依赖 IndexedDB

### Modified Capabilities

- `profile-settings-ui`: /profile 从读 IndexedDB 改为读 API
- `jd-evaluation-ui`: JD 库和报告库从 IndexedDB 改为 API

## Impact

- 改造：`lib/agent/tools/query/*.ts`（6 个工具）、`app/profile/page.tsx`、`app/evaluate/jds/page.tsx`、`app/evaluate/reports/page.tsx`、`app/evaluate/history/page.tsx`、`app/settings/page.tsx`、`app/page.tsx`（首页统计数据）
- 保留：`lib/db.ts`（IndexedDB 缓存层）、Dexie 依赖
- 依赖：backend-sqlite-foundation（Change 1 的 API 必须先就绪）
