## 1. 数据模型与数据库

- [x] 1.1 在 types 中定义 CareerProfile 及相关类型（Skill, PreferenceVectors, MarketFit, ProfileHistory）
- [x] 1.2 DexieDB 新增 profiles 表（version 4 migration），存储完整画像 JSON + lastUpdated 索引
- [x] 1.3 实现 profile-storage.ts：saveProfile / loadProfile / getProfileHistory 工具函数

## 2. 数据挖掘管线

- [x] 2.1 实现统计提取模块：从 applications/reports/practiceRecords 计算投递统计、评分分布、行业分布
- [x] 2.2 实现 LLM 推理模块：聚合 CV + stories + practice answers + chat topics → 单次 LLM 调用提取技能/偏好/缺口
- [x] 2.3 实现数据脱敏工具：过滤公司全名、JD 全文、聊天明文，仅保留结构化摘要
- [x] 2.4 实现画像生成主流程：合并统计数据 + LLM 结果 → CareerProfile，含回退逻辑（LLM 失败时用纯统计）

## 3. API 路由

- [x] 3.1 创建 `POST /api/profile/analyze` 路由，接受 `{ force?: boolean }` 参数
- [x] 3.2 实现增量更新判断逻辑（检查 lastUpdated 和数据变更时间戳）
- [x] 3.3 API 返回完整 CareerProfile JSON，包含 history 变更记录

## 4. 画像可视化页面

- [x] 4.1 创建 `/profile` 页面路由和基础布局
- [x] 4.2 实现 SkillRadar 组件（纯 SVG 雷达图，支持 5-8 个技能顶点）
- [x] 4.3 实现 SkillGapList 组件（缺口技能列表，按 gap 降序）
- [x] 4.4 实现 PreferenceBars 组件（水平柱状图，行业/规模/工作方式偏好）
- [x] 4.5 实现 EvolutionTimeline 组件（垂直时间轴 + 竞争力分数迷你折线图）
- [x] 4.6 实现空状态引导（无画像时引导生成）和加载状态

## 5. 导航与集成

- [x] 5.1 AppShell 导航新增"求职画像"菜单项
- [x] 5.2 在 JD 评估完成后触发画像增量更新（静默后台调用）
- [x] 5.3 在面试练习保存后触发画像增量更新
