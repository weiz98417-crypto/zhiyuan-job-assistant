## 1. 移除手动教练 UI

- [x] 1.1 从 `frontend/src/app/interview/page.tsx` 中移除 `PracticePanel` 的渲染和状态管理
- [x] 1.2 移除独立评分工具 UI（`showScorer`、`scoreInput`、`scoreResult` 相关状态和 JSX）
- [x] 1.3 移除教练模式选择器（六种模式按钮组）相关状态和 JSX
- [x] 1.4 移除 `QuestionList` 从页面渲染（保留 import 和组件文件）
- [x] 1.5 清理不再使用的状态变量和 handler 函数（`handlePractice`、`handleRePractice`、`runScore` 等）

## 2. 添加练习统计看板

- [x] 2.1 新增统计计算函数：从 `db.practiceRecords` 聚合 totalCount、avgScore、byCategory、byMode、scoreTrend
- [x] 2.2 新增"练习概览"卡片组件：展示练习次数、平均分、分数等级标签
- [x] 2.3 新增简易趋势图：最近 10 次练习的分数变化（使用 CSS 柱状图或 SVG 折线，不引入 chart 库）
- [x] 2.4 新增题型分布展示：按 category 分组显示次数和均分，弱项高亮
- [x] 2.5 处理空数据状态：无练习记录时显示引导卡片

## 3. 重构为仪表盘布局

- [x] 3.1 修改页面整体布局：统计看板 → 最近练习记录 → STAR 故事 → 面试日程
- [x] 3.2 练习记录区域：保留 `PracticeRecords` 组件，增加筛选和搜索
- [x] 3.3 STAR 故事区域：保留现有编辑器和管理功能

## 4. 添加跳转 Agent 入口

- [x] 4.1 在页面 Header 添加 [去练习 →] 按钮，跳转 `/agent?coach=true`
- [x] 4.2 在统计看板弱项提示卡片添加 [针对性练习 →] 按钮，携带 `questionType` 参数
- [x] 4.3 将出题配置区改为预配置 + [去练习 →] 按钮，携带 `jdId`、`preset` 参数
- [x] 4.4 面试日程卡每项添加 [针对性准备 →] 入口

## 5. 验证

- [x] 5.1 验证 `/interview` 页面不再显示 PracticePanel 和评分工具
- [x] 5.2 验证有练习数据时统计看板正确显示
- [x] 5.3 验证无练习数据时显示引导卡片
- [x] 5.4 验证"去练习"按钮正确跳转 `/agent?coach=true`
- [x] 5.5 验证带 JD 和预设的跳转携带了正确的 URL params
- [x] 5.6 验证 STAR 故事管理功能不受影响
- [x] 5.7 验证面试日程展示和准备清单不受影响
