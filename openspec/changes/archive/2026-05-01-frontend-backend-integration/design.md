## Context

Career-Ops 前端是 Next.js 16 App Router + React 19 + TypeScript + Tailwind CSS 4，local-first 数据层基于 Dexie.js/IndexedDB。9 个功能模块页面中，只有 `/api/evaluate` 接通了 DeepSeek API。后端 CLI 脚本（`.mjs`）和提示词文件（`modes/`）与前端脱节。需要在不引入独立后端服务器、不大幅重构的前提下，通过 Next.js API Routes 桥接两端。

## Goals / Non-Goals

**Goals:**
- 新增 6 个 API 路由，覆盖 JD 抓取、PDF 生成、AI 分析、面试问题、扫描状态、数据导入
- 前端页面用真实 API 替换 mock 数据和本地假逻辑
- 移植 followup-cadence、analyze-patterns、liveness-core 的纯算法到前端 TypeScript
- 保持与 CLI 数据文件的格式兼容（双向 import/export）
- 所有 API 返回统一格式 `{ success, data?, error? }`

**Non-Goals:**
- 不创建独立后端服务器（只加 Next.js API Routes）
- 不触发 CLI 脚本从浏览器执行（scan 保持 CLI-only）
- 不修改 CLI `.mjs` 脚本、modes 文件、数据格式
- 不做多用户/云端同步/数据库

## Decisions

### Decision 1: Next.js API Routes（非独立服务）

**选择**: 所有后端能力通过 Next.js App Router 的 `route.ts` 暴露

**理由**:
- 部署简单（一个 `next start`）
- 复用现有的 DeepSeek 调用模式和错误处理
- 无需管理另一个进程或端口
- 对单用户工具体量足够

**替代方案**: 独立的 Express/Fastify 服务。功能更强但引入了进程管理、端口分配、跨域等问题。对当前规模过度设计。

### Decision 2: PDF 用 Playwright 直出

**选择**: API route 内启动 Playwright headless Chromium，读取 `templates/cv-template.html` 渲染生成 PDF

**理由**:
- `generate-pdf.mjs` 已经验证了 Playwright PDF 的质量（ATS 兼容、字体渲染、页眉页脚）
- HTML 模板已存在且成熟，直接复用
- 无需外部渲染服务（零延迟、零费用）
- 项目根已有 playwright 依赖

**替代方案**: 用 Puppeteer（API 类似但多一层依赖）或 Browserless 云服务（增加延迟和外部依赖）。Playwright 已在使用且证明可靠。

### Decision 3: JD 抓取用 fetch + cheerio

**选择**: `fetch` + `cheerio` 解析 HTML，不做 JS 渲染

**理由**:
- 大多数 JD 页面（ Boss直聘、拉勾、猎聘、LinkedIn）是服务端渲染
- cheerio 轻量（~2MB vs Playwright ~200MB）
- 快速且不消耗额外内存
- 10 秒超时、500KB 响应限制防止滥用

**替代方案**: Playwright/Puppeteer 可处理 JS 渲染的 SPA 页面，但太重。对 SPA-only 页面降级提示"改用文本粘贴模式"即可。

### Decision 4: 扫描不 API 触发（保持 CLI-only）

**选择**: `/api/scan/status` 是只读 API（读 `data/pipeline.md` + `data/scan-history.tsv`）。不创建扫描执行 API。

**理由**:
- `scan.mjs` 并发调用 10+ 外部 API，运行 30+ 秒
- 在 serverless 环境下容易超时
- 涉及文件系统写入（pipeline.md, scan-history.tsv）
- 浏览器侧触发 CLI 操作增加不必要的复杂度
- Discover 页面"扫描"按钮改为引导提示（"在终端运行 `node scan.mjs`"）

**替代方案**: Next.js Background Tasks / Server Actions 可执行长时间操作，但对于本单用户项目，CLI 已是成熟的扫描方式。

### Decision 5: 数据导入单向（CLI → 前端）

**选择**: API Route 只读项目根数据文件，返回 JSON。前端写入 IndexedDB。不回写 CLI 文件。

**理由**:
- 避免 serverless 部署时的文件系统权限问题
- CLI 保持数据文件的权威写入路径
- 导出方向已通过浏览器 blob download 支持
- 单向数据流简单可控

**替代方案**: 双向同步会增加冲突解决、锁、权限复杂度。单用户场景下不需要。

### Decision 6: followup-cadence & analyze-patterns 移植到前端 TypeScript

**选择**: 提取核心算法到 `frontend/src/lib/analytics.ts`，在浏览器端运行

**理由**:
- 两个脚本都是纯计算（数据 → 统计数据），不涉及 I/O
- IndexedDB 已有完整数据，无需 API 往返
- 延迟为零（本地计算）
- 前端 TypeScript 可复用相同的逻辑结构

**替代方案**: 包装成 API route 可以保持算法在服务端。但无实际收益——这些是纯函数，本地计算更快且离线可用。

### Decision 7: 统一 DeepSeek 调用模式

**选择**: 所有 AI 路由遵循与 `/api/evaluate` 相同模式：加载 modes → 构建 system prompt → 调 DeepSeek → 解析 JSON 返回

**理由**:
- 一致错误处理和调试体验
- 共用 `DEEPSEEK_API_KEY` 环境变量
- 相同的 prompt 加载路径规则（`path.join(process.cwd(), "..", "modes/")`）
- `response_format: { type: "json_object" }` 确保可解析输出

### Decision 8: Mode 文件加载策略

**选择**: 从 `<project_root>/modes/` 动态加载，`process.cwd()` 在 Next.js 中即 frontend 目录，用 `..` 回到项目根

**理由**:
- Modes 独立演进，不应打包进前端构建产物
- 用户可自定义 modes 文件，无需重新 build
- 与现有 evaluate route 保持一致

## Risks / Trade-offs

| 风险 | 缓解措施 |
|------|---------|
| Playwright 使 node_modules +~200MB | 已经是项目依赖；serverless 部署用 `@sparticuz/chromium` |
| cheerio 对 SPA 页面无效 | 降级提示"改用文本粘贴模式"覆盖 90%+ 场景 |
| 长 JD 文本超出 DeepSeek context | 限制 JD 文本 8000 字符；超长截断 |
| PDF API 在 serverless 超时 | Vercel 60s 上限足够；本地开发无限制 |
| 数据导入重复条目 | 前端校验（company+role 去重），对齐现有 merge-tracker 逻辑 |

## Migration Plan

1. 安装新依赖（cheerio, playwright）
2. 创建 API 路由，逐个验证
3. 更新前端页面，每次改一个页面并验证功能
4. 无需数据迁移——前端 IndexedDB 是独立的，CLI 数据文件不受影响
5. 回滚：删除新增的 API 路由目录，恢复页面前用 git checkout
