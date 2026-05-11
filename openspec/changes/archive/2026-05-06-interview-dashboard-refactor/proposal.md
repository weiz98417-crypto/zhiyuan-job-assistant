## Why

Phase 1（`agent-interview-coach`）将面试教练能力迁移到了 Agent Chat。此后 `/interview` 页面上的手动教练 UI（PracticePanel、评分工具、教练模式选择）变成了冗余。但这个页面仍有保留价值——它积累了用户的练习记录、STAR 故事、面试日程。

**目标：将 `/interview` 从一个"动手练习工具"重构为"面试准备仪表盘"——只读、回顾、导航。**

## What Changes

### 移除教练 UI，保留数据视图

- 删除：PracticePanel 组件引用、独立评分工具、教练模式选择器
- 保留并增强：练习记录列表、STAR 故事管理、面试日程
- 新增：练习统计看板（练习次数、平均分趋势、弱项标记）
- 新增：每个模块的「开始练习 → Agent」入口按钮

### 从练习到 Agent 的导航

- STAR 故事列表项、练习记录项增加「练习这个方向」
- 导航到 `/agent` 时传递上下文（题目类型、故事标题），Agent 自动切入教练模式
- 面试日程卡增加「针对性准备」入口

### 出题配置简化

- 出题功能移到 Agent 侧（Phase 1），此页面保留 JD/CV/预设的查看功能
- 可以作为 Agent 教练模式的"预配置"页面——先选好 JD 和预设，再跳转 Agent

## Capabilities

### Modified
- `interview-prep-ui`：页面从教练工具重构为仪表盘，增加统计和分析视角
- `interview-question-practice`：练习面板移除，改为跳转 Agent
- `interview-coach-chat`：独立教练对话移除，合并到 Agent Chat

### New
- `interview-practice-analytics`：练习数据统计——次数、分数趋势、弱项分布

## Impact

- **修改文件**: `frontend/src/app/interview/page.tsx`（大幅删减），`frontend/src/components/design/index.ts`（可能无需改动）
- **可能删除**: `frontend/src/app/interview/PracticePanel.tsx`（如果不再被其他地方引用），`frontend/src/app/interview/QuestionList.tsx`（独立题目列表功能迁移到 Agent）
- **API 影响**: 无新增 API。现有 `/api/interview/generate`、`/api/interview/coach`、`/api/interview/score` 予以保留（Phase 3 多 Agent 架构时统一处理）
- **依赖**: 必须在 Phase 1 完成后进行
