## Why

当前"今日手帳"首页只是一个轻量跳转页——4 个数字卡片 + 快捷操作 + 最近活动。对于已有多条投递记录的用户，首页无法提供"一眼看清全局"的总览感，也缺少外部信息（行业动态、目标企业近况）帮用户判断市场环境。这不符合"手帳"该有的信息密度——手帳翻开应该是满满的信息，而不是空白页。

## What Changes

- **Hero 指标区升级**：4 个 KPI 卡片改为带环比趋势（↑↓ 箭头 + 与上周对比），新增"已评估"指标
- **转化漏斗图**：横向堆叠条形图，暖灰色渐变，可视化 发现→评估→投递→面试→Offer 的转化率
- **行业快讯**：SSR + SQLite 缓存，聚合 6 个源（Anthropic/OpenAI/机器之心/量子位/Founder Park/BestBlogs），每 6 小时刷新
- **目标企业快讯**：基于用户画像中目标公司，Agent 定期抓取招聘页/新闻页，DeepSeek 生成个性化摘要
- **待办提醒**：从投递记录和面试日程中提取"今天/本周该做的事"
- **快讯刷新设置**：用户在设置页可配置目标公司列表 + 刷新频次
- **移除去重**：移除底部的"最近活动"简单列表（被迷你管线总览替代），Phase Card 弱化为小横幅融入待办区

## Capabilities

### New Capabilities

- `homepage-dashboard`: Hero 指标区（环比趋势）、手帳风格转化漏斗图、待办提醒、迷你管线总览
- `homepage-news-feed`: 行业快讯（SSR+缓存 6 源聚合）、目标企业快讯（AI 聚合+定时任务）、快讯管理

### Modified Capabilities

- `profile-settings-ui`: 新增"快讯设置"区域——目标公司列表、刷新频次选择
- `sqlite-backend`: 新增 `news_cache` 表（source、title、summary、url、published_at、cached_at）

## Impact

- **首页**: `frontend/src/app/page.tsx` 大幅重写，拆分为多个子组件
- **新组件**: `HomeDashboard.tsx`、`PipelineFunnel.tsx`、`NewsFeed.tsx`、`TodoReminders.tsx`
- **新 API**: `GET /api/news/industry` (SSR 快讯)、`GET /api/news/company` (目标企业快讯)
- **设置页**: `frontend/src/app/settings/page.tsx` 新增快讯配置区域
- **DB**: `server-schema.sql` 新增 `news_cache` 表
- **缓存策略**: 行业快讯 6h TTL，企业快讯依赖定时任务触发
