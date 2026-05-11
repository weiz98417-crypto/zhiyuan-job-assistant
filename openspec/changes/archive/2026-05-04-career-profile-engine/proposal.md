## Why

V1.5 积累了 applications、evaluations、practice records、STAR stories、JDs 和 explore chat 数据——但全部是孤岛。系统不知道"用户是谁"，每次 AI 交互从零开始。V2.0 的 Agent 需要一个持续进化的用户画像来做个性化决策。

## What Changes

- 新增求职画像数据模型——技能 × 熟练度、偏好向量（公司规模/行业/文化/工作方式）、市场对标（竞争力分数、薪资范围、趋势技能缺口）、进化历史快照
- 新增数据挖掘管线——从 DexieDB（applications/reports/stories/practiceRecords/jds）和 localStorage（CV/chat/profile）提取洞察
- 新增 `POST /api/profile/analyze` API——生成或更新画像，返回结构化画像数据
- 新增画像可视化页面——雷达图 + 技能缺口清单 + 偏好分布 + 进化时间轴
- 画像在每次新评估/面试练习后自动更新

## Capabilities

### New Capabilities

- `career-profile`: 求职画像数据模型与生成引擎——从用户历史数据中提取技能、偏好、缺口、竞争力分数，并支持持续进化
- `career-profile-ui`: 求职画像前端可视化——雷达图、技能缺口、偏好分布、进化时间轴

### Modified Capabilities

- `frontend-shell`: 导航新增"求职画像"入口

## Impact

- 新增 API: `POST /api/profile/analyze`
- 新增页面: `/profile`
- 数据层: 复用 DexieDB 现有表，新增 profile 表存储画像快照
- 依赖: DeepSeek API（画像推理）、现有 DexieDB 数据
