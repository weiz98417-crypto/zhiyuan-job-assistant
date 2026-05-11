## 1. SQLite 基础设施

- [x] 1.1 安装 better-sqlite3，创建 `dashboard/db.ts`（连接 + 建表）
- [x] 1.2 创建 `dashboard/schema.sql`（4 张表 DDL）
- [x] 1.3 实现数据迁移脚本：从 Markdown/TSV 文件迁移到 SQLite（首次启动执行）

## 2. REST API

- [x] 2.1 `GET/POST /api/data/applications`
- [x] 2.2 `GET /api/data/reports/:reportNum` + `GET /api/data/reports`
- [x] 2.3 `GET/POST /api/data/jds`
- [x] 2.4 `GET/PUT /api/data/profile`

## 3. 后端切换

- [x] 3.1 `/api/profile/analyze` 从读 IndexedDB + 文件改为读 SQLite
- [x] 3.2 `/api/evaluate/stream` 报告写入从文件改为 SQLite
- [x] 3.3 `/api/data/import` 从读文件改为读 SQLite
- [x] 3.4 `/api/report/save` 写 SQLite 替代 applications.md

## 4. 清理

- [x] 4.1 废弃 applications.md/TSV 写入逻辑，文件保留只读
- [x] 4.2 废弃 merge-tracker.mjs / dedup-tracker.mjs（SQLite 去重替代）
