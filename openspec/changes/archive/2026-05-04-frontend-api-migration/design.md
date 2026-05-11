## Context

前端 18 个文件直接依赖 Dexie IndexedDB。Change 1 引入 SQLite 后端后，前端需改为通过 REST API 读写数据。

## Goals / Non-Goals

**Goals:** Agent 工具和页面从 IndexedDB 直读改为 API 调用。IndexedDB 保留为离线缓存。
**Non-Goals:** 不改 Agent Chat 对话历史存储（chatSessions 留 IndexedDB）

## Decisions

### Decision 1: 缓存策略

API 成功时 → 写 IndexedDB 缓存 + 更新 UI。API 失败时 → 读 IndexedDB 缓存 + 显示"数据可能不是最新"。

### Decision 2: 逐步替换

第一批：Agent 工具（6 个 query 工具）→ 对用户体验影响最大
第二批：管理页面（/profile, /evaluate/jds, /evaluate/reports）→ 纯展示
第三批：首页统计卡片 → 低频

### Decision 3: 依赖

Change 1 必须先完成。API 端点就绪后才开始前端切。
