# Spec: Homepage News Feed

## Purpose

首页行业快讯和目标企业快讯——让用户在求职过程中掌握外部市场动态和心仪公司近况。

## ADDED Requirements

### Requirement: 行业快讯聚合

首页 SHALL 展示聚合后的 AI 行业快讯，数据源为 6 个权威 RSS/API 源，SSR 渲染 + SQLite 缓存。

#### Scenario: 快讯展示

- **WHEN** 用户打开首页
- **THEN** 行业快讯区域 SHALL 展示 5 条最新资讯
- **AND** 每条资讯包含：来源标识（Anthropic/OpenAI/机器之心等）、标题、一句话摘要、相对时间
- **AND** 提供"查看更多"入口展开全部快讯

#### Scenario: 快讯缓存与刷新

- **WHEN** 服务端收到快讯请求
- **THEN** 检查 `news_cache` 表，若最近一次缓存时间 < 6 小时则直接返回
- **AND** 若缓存过期，拉取 6 个源的新内容，DeepSeek 生成摘要后写入缓存
- **AND** 快讯区域在客户端不自动刷新（用户需手动刷新或重新打开页面）

#### Scenario: 快讯源失效处理

- **WHEN** 某个 RSS 源拉取失败
- **THEN** 跳过该源，用剩余源的快讯填充
- **AND** 若所有源失败，显示"快讯暂不可用"占位

#### Scenario: 首次加载

- **WHEN** `news_cache` 表为空（首次使用）
- **THEN** 通过 Suspense 展示快讯骨架屏（3 条脉冲占位）
- **AND** 异步拉取并写入缓存

### Requirement: 目标企业快讯

首页 SHALL 基于用户画像中的目标公司列表，展示对应的企业动态摘要。

#### Scenario: 有目标公司时展示

- **WHEN** 用户画像中存在 `target_companies` 列表
- **THEN** 企业快讯区域 SHALL 展示："{公司名} 本周新开 X 个岗位" 或 "{公司名} 最近动态：..."
- **AND** 信息由 Agent 抓取公司招聘页/新闻页后，DeepSeek 生成摘要
- **AND** 提供"刷新"按钮手动触发更新

#### Scenario: 无目标公司时隐藏

- **WHEN** 用户画像中无 `target_companies`
- **THEN** 企业快讯区域 SHALL 显示引导："在设置中添加目标公司，获取专属招聘动态"

### Requirement: 快讯管理

用户 SHALL 可以在设置页配置快讯相关参数。

#### Scenario: 设置页快讯区域

- **WHEN** 用户打开设置页
- **THEN** 显示"快讯设置"区域
- **AND** 包含：目标公司编辑列表（可增删）
- **AND** 包含：快讯刷新频次选择（每 6h / 每 12h / 每天 / 手动）
