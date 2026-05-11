## 1. Agent 工具切 API

- [x] 1.1 search_applications → `fetch("/api/data/applications")`
- [x] 1.2 get_report_detail → `fetch("/api/data/reports/:id")`
- [x] 1.3 get_profile → `fetch("/api/data/profile")`
- [x] 1.4 get_recommendations → `fetch("/api/data/applications")` + API 端计算
- [x] 1.5 get_recent_activity → `fetch("/api/data/applications?recent=7")`
- [x] 1.6 get_pipeline_status → `fetch("/api/data/applications")` + 前端计算

## 2. 页面切 API

- [x] 2.1 /profile → `fetch("/api/data/profile")` + 保留 5s 轮询
- [x] 2.2 /evaluate/jds → `fetch("/api/data/jds")`
- [x] 2.3 /evaluate/reports → `fetch("/api/data/reports")`
- [x] 2.4 /settings 导入 → `fetch("/api/data/applications")` 替代 IndexedDB 直读
- [x] 2.5 首页统计数据 → 从 API 获取

## 3. 缓存层

- [x] 3.1 API 成功时写 IndexedDB 缓存，失败时读缓存
- [x] 3.2 移除「从 CLI 导入」按钮

## 4. 验证

- [x] 4.1 Agent Chat 工具调用正常（查投递、读报告、读画像）
- [x] 4.2 /profile 正常展示
- [x] 4.3 /evaluate/jds 和 /evaluate/reports 正常
