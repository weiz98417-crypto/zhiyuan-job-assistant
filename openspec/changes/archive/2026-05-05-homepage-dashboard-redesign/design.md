## Context

当前 `frontend/src/app/page.tsx` 是一个约 350 行的单文件组件，包含首页的所有逻辑和 UI。现有功能：greeting、4 个 KPI 卡片、Phase Card（根据状态自适应）、快捷操作、面试日程、最近活动、每日鼓励。

数据来源：前端 Dexie IndexedDB（`db.applications`、`db.interviews`），客户端计算 KPI。无服务端数据参与。

架构约束：Next.js 16 (Turbopack)、React 19、TailwindCSS 4、framer-motion、设计系统组件（HandwritingTitle、WarmButton、PaperCard、ScoreBadge、StaggerList）、CSS 变量主题（Catppuccin）。

## Goals / Non-Goals

**Goals:**
- Hero 指标区：从 4 个无趋势卡片升级为带环比对比的 KPI 仪表
- 转化漏斗：手帳风格的横向条形漏斗图，展示 发现→评估→投递→面试→Offer
- 行业快讯：SSR 渲染 + SQLite 缓存，6 个 RSS/API 源聚合
- 目标企业快讯：用户画像驱动，Agent 定期抓取，DeepSeek 摘要
- 待办提醒：从投递记录中自动推断下一步行动
- 组件拆分：page.tsx 大幅精简，核心逻辑拆到独立组件

**Non-Goals:**
- 不建完整的定时任务系统——快讯刷新走 Next.js API Route + cron job
- 不做实时推送/WebSocket——所有数据拉取为 on-demand
- 不引入 ECharts/Recharts 等重型图表库——漏斗用纯 CSS + Tailwind
- 不改造数据存储层——主页仍从 Dexie 读取 KPI，快讯走 SQLite
- 不移除任何现有子页面功能

## Decisions

### D1: 数据可视化方案 — 纯 CSS 横向条形图

选择：不引入图表库，用 Tailwind 手写 CSS 条形图。

理由：
- 漏斗图只展示 5 个阶段 + 转化率，数据量极小
- 手帳调性要求"温润纸质感"，ECharts/Recharts 画出来太像 BI 大屏
- 零 bundle 增量
- 条形宽度用 CSS `width: ${percent}%` 动态设置，颜色用 `var(--color-primary)` 渐变

备选：Recharts（轻量 React 图表库），被拒理由：视觉风格不匹配。

### D2: 行业快讯架构 — SSR + SQLite 缓存

```
请求流程：
User → GET /api/news/industry
       → 查 SQLite news_cache，where cached_at > now - 6h
       → 命中：直接返回
       → 未命中：fetch 6 个 RSS/API 源 → DeepSeek 摘要 → 写入 news_cache → 返回
```

源列表：
1. `https://openrss.org/anthropic.com/news` — Anthropic 官方动态
2. `https://openai.com/news/rss.xml` — OpenAI 官方新闻
3. `https://jiqizhixin.com/rss` — 机器之心（技术深度）
4. `https://qbitai.com` — 量子位（产业快讯，需 cheerio 抓取）
5. Founder Park 每日速递 — 可能需要自定义抓取或社区 RSS
6. `https://bestblogs.dev/rss` — AI 内容聚合

选择 6 个源的理由：覆盖"海外底层进展（A/O 社）+ 国内产业落地（机心/量子位）+ 产品视角（Founder Park）+ 兜底聚合（BestBlogs）"。

备选：客户端直接 fetch RSS → 被拒：跨域问题 + 暴露源 URL。

### D3: 目标企业快讯 — Agent 驱动

不依赖预定义 RSS，走两步：
1. 读取用户画像中的 `target_companies` 列表
2. 对每家公司：抓取 careers 页面 → cheerio 提取变化 → DeepSeek 生成摘要

触发方式：用户手动点击"刷新"按钮，或在设置中启用定时任务（通过 cron job 调用 API）。

### D4: 组件拆分策略

```
src/app/page.tsx          → 精简为布局 + 数据编排（~80 行）
src/components/home/
  ├── HeroMetrics.tsx     → 4-5 个 KPI 卡片 + 环比趋势
  ├── PipelineFunnel.tsx  → 横向条形漏斗图
  ├── IndustryNews.tsx    → 行业快讯列表
  ├── CompanyNews.tsx     → 目标企业快讯
  ├── TodoReminders.tsx   → 待办提醒
  └── MiniPipeline.tsx    → 迷你管线总览（各状态下卡片数）
```

### D5: news_cache 表设计

```sql
CREATE TABLE IF NOT EXISTS news_cache (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT NOT NULL,           -- 'industry' | 'company'
  source_name TEXT,               -- 'anthropic' | 'qbitai' | 'bytedance'...
  title TEXT NOT NULL,
  summary TEXT,                   -- DeepSeek 生成的摘要
  url TEXT,
  published_at TEXT,
  cached_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_news_cache_source ON news_cache(source);
CREATE INDEX IF NOT EXISTS idx_news_cache_cached ON news_cache(cached_at);
```

## Risks / Trade-offs

- [RSS 源不稳定] → 部分源（量子位、Founder Park）无官方 RSS，需 cheerio 抓取。若页面结构变化则需更新选择器。缓解：BestBlogs 作为聚合兜底。
- [DeepSeek 摘要成本] → 每次刷新调用 6 次 RSS fetch + 1 次 DeepSeek API。缓解：6h 缓存 TTL，刷新频率不高。
- [目标企业抓取被封] → 频繁抓取同一公司 careers 页可能被限流。缓解：设置 24h 最小间隔，User-Agent 声明合规。
- [首页加载性能] → SSR 获取快讯可能拖慢 TTFB。缓解：快讯用 `loading.tsx` (Suspense) 包裹，不阻塞首页其余内容的渲染。
