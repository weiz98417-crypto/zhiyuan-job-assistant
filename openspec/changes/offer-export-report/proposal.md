## Why

Offer 对比功能已经可用（能路由到 offer agent，对比结果质量也不错），但用户无法将对比结果导出为报告下载。同时 offer 数据和对比报告缺少 SQLite 后端持久化——当前仅存前端 IndexedDB，一清缓存就丢。

## What Changes

### Phase 1: SQLite 持久化
- `offers` 表扩字段：补全 `months_per_year`, `has_social_insurance`, `housing_fund_rate`, `probation_months`, `options`, `start_date`, `other_benefits`
- `offers` 表加 `UNIQUE(company, role)` 避免重复
- 新建 `offer_reports` 表：存对比报告快照（标题、offer JSON、markdown 全文、offer 数量）
- `POST /api/offers` 升级：接受所有字段，支持 upsert
- 新建 `POST /api/offer-reports`：保存对比报告到 SQLite

### Phase 2: Compare 页导出
- Compare 页「对比模式」加操作栏：导出 Markdown / 导出 PDF
- 导出时生成完整报告（对比表 + 维度评分 + 排名 + 谈判建议）
- Markdown 导出：Blob 下载（客户端）
- PDF 导出：HTML 新窗口 + 浏览器打印对话框（同现有 `download_report_pdf` 模式）
- **每次导出时自动同步到 SQLite**（通过 `/api/offer-reports`）

### Phase 3: AgentChat 导出
- `export_file` 工具适配双上下文：
  - 浏览器端：Blob + download（现有逻辑）
  - 服务端：调用 `/api/export-file` 保存到 `output/` 目录，返回下载 URL
- AgentChat 的 `ToolResultCard` 增加「下载文件」链接：当工具结果是 `export_file` 且包含文件路径时渲染下载按钮
- `download_report_pdf` 工具适配：服务端返回可访问的 HTML URL

## Impact

- `src/lib/server-schema.sql` — offers 表扩字段 + offer_reports 新表
- `src/app/api/offers/route.ts` — POST 全字段 upsert
- `src/app/api/offer-reports/route.ts` — NEW: save/query offer reports
- `src/app/api/export-file/route.ts` — NEW: server-side file export
- `src/app/compare/page.tsx` — 导出按钮 + 报告生成 + SQLite 同步
- `src/lib/agent/tools/action/export-file.ts` — 服务端路径适配
- `src/lib/agent/tools/action/download-report-pdf.ts` — 服务端路径适配
- `src/components/agent/AgentChat.tsx` — ToolResultCard 文件下载链接
