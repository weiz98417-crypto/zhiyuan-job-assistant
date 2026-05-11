## 1. 基础设施：SQLite & API

- [x] 1.1 `server-schema.sql` 新增 `news_cache` 表（含 source/source_name 索引）
- [x] 1.2 `server-db.ts` 新增 news_cache CRUD 函数（`cacheNews`、`getCachedNews`、`cleanExpiredNews`）
- [x] 1.3 新增 `GET /api/news/industry` — SSR 拉取 6 个 RSS/API 源，DeepSeek 摘要，写入缓存，返回 JSON
- [x] 1.4 新增 `GET /api/news/company` — 读取用户画像目标公司，Agent 抓取+摘要，返回 JSON

## 2. 首页组件

- [x] 2.1 创建 `HeroMetrics.tsx` — 5 个 KPI 卡片（已评估/已投递/面试中/Offer/平均匹配分），每个带环比趋势↑↓标注
- [x] 2.2 创建 `PipelineFunnel.tsx` — 横向条形漏斗图（发现→评估→投递→面试→Offer），纯 CSS 圆角胶囊条，转化率标注
- [x] 2.3 创建 `TodoReminders.tsx` — 从投递和面试数据自动推断待办（跟进信/准备面试/考虑投递）
- [x] 2.4 创建 `MiniPipeline.tsx` — 各状态卡片数 badge 总览，点击跳转 tracker
- [x] 2.5 创建 `IndustryNews.tsx` — 行业快讯列表，Suspense 包裹，骨架屏加载态，每条显示来源+摘要+时间
- [x] 2.6 创建 `CompanyNews.tsx` — 目标企业快讯，有目标公司时展示，无则引导设置

## 3. 首页重组

- [x] 3.1 重写 `page.tsx` — 精简为数据编排层（从 Dexie 读取 applications/interviews，计算环比/漏斗/待办），组装所有子组件
- [x] 3.2 保留 greeting + HandwritingTitle + 每日鼓励（维持品牌调性）
- [x] 3.3 移除旧的最近活动列表、移除 Phase Card（弱化为待办提醒中的引导）
- [x] 3.4 快捷操作区域保留并更新入口

## 4. 设置页

- [x] 4.1 设置页新增"快讯设置"区域——目标公司列表增删、刷新频次选择
- [x] 4.2 设置数据通过 `profiles` API 持久化

## 5. 边缘情况与打磨

- [x] 5.1 首页空状态优化——首次访问保留现有引导（评估第一份 JD），但增加漏斗和快讯的骨架占位
- [x] 5.2 快讯加载失败降级——显示"快讯暂不可用"占位，不影响其他模块
- [x] 5.3 所有新组件响应式适配（移动端漏斗变垂直列表，快讯卡片堆叠）
