# Spec: Homepage Dashboard

## Purpose

今日手帳首页——求职总览 Dashboard。提供 Hero 指标区、转化漏斗、待办提醒、迷你管线，让用户一眼看清求职全貌。

## Requirements

### Requirement: Hero 指标区

首页 SHALL 在顶部展示 4-5 个核心 KPI 卡片，每项包含数值和与上周对比的环比趋势。

#### Scenario: 指标卡片展示

- **WHEN** 用户打开首页且有投递数据
- **THEN** 展示 5 个指标卡片：已评估数、已投递数、活跃面试数、Offer 数、平均匹配分
- **AND** 每个卡片显示当前数值
- **AND** 显示与上周的环比趋势（↑ +N 或 ↓ -N 或 → 持平）
- **AND** 趋势上升用绿色标注，下降用暖橙色标注，持平用 muted 色

#### Scenario: 无数据时展示占位

- **WHEN** 用户首次访问且无任何投递数据
- **THEN** 指标卡片数值显示为 "—"
- **AND** 不显示环比趋势

### Requirement: 转化漏斗图

首页 SHALL 展示横向条形漏斗图，可视化求职管线各阶段转化。

#### Scenario: 漏斗展示

- **WHEN** 用户打开首页且有投递数据
- **THEN** 显示 5 个阶段的横向条形图：已发现 → 已评估 → 已投递 → 面试中 → Offer
- **AND** 每阶段条形宽度比例反映该阶段数量
- **AND** 每阶段标注具体数字
- **AND** 相邻阶段之间标注转化率百分比

#### Scenario: 漏斗视觉风格

- **WHEN** 漏斗图渲染
- **THEN** 使用渐变色（从浅到深的 `var(--color-primary)` 色系）
- **AND** 条形为圆角胶囊形状
- **AND** 不使用图表库，纯 CSS/Tailwind 实现
- **AND** 无 hover 交互，静态呈现

#### Scenario: 单阶段为空

- **WHEN** 某阶段数量为 0
- **THEN** 该阶段仍展示占位条形（宽度最小化）
- **AND** 转化率标注为 "—"

### Requirement: 待办提醒

首页 SHALL 从投递记录和面试日程中自动推断并展示待办事项。

#### Scenario: 自动提取待办

- **WHEN** 用户打开首页
- **THEN** 系统检查投递状态和面试时间
- **AND** 为"面试后超过 3 天未跟进"的条目生成"建议发送跟进信"提醒
- **AND** 为"未来 7 天有面试"的条目生成"准备面试"提醒
- **AND** 为"评估后超过 7 天未投递"的条目生成"考虑投递"提醒

#### Scenario: 无待办时

- **WHEN** 当前无任何需要跟进的事项
- **THEN** 显示"暂无待办，一切顺利 🎐"

### Requirement: 迷你管线总览

首页 SHALL 展示各状态下的投递卡片数量总览，作为迷你 Kanban。

#### Scenario: 管线展示

- **WHEN** 用户打开首页且有投递数据
- **THEN** 按状态分组显示卡片数：Evaluated / Applied / Interview / Offer / Discarded
- **AND** 每状态显示数量 badge
- **AND** 点击可跳转到 tracker 页对应筛选

#### Scenario: 无投递数据时隐藏

- **WHEN** applications 为空
- **THEN** 迷你管线区域不渲染
