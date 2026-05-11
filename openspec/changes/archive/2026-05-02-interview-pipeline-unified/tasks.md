## 1. 类型与存储

- [x] 1.1 新增 `PracticeRecord` 类型到 types/index.ts
- [x] 1.2 新增 `QuestionPracticeContext` 类型到 types/index.ts
- [x] 1.3 新增 `db.practiceRecords` IndexedDB 表到 lib/db.ts

## 2. API 增强

- [x] 2.1 `/api/interview/coach/stream` 增加可选 `questionContext` 参数，system prompt 围绕题目组织
- [x] 2.2 修复流式 SSE 解析逻辑，确保 section/followUps/done 事件正确递送

## 3. Pipeline 布局重构

- [x] 3.1 创建 `interview/QuestionList.tsx` — 题目卡片网格 + 进度统计 + 分类筛选
- [x] 3.2 创建 `interview/PracticePanel.tsx` — 练习对话面板（封装教练对话 + 追问 + 保存）
- [x] 3.3 创建 `interview/PracticeRecords.tsx` — 已练列表（练习记录 + STAR 故事统一视图）
- [x] 3.4 重构 `interview/page.tsx` 为 Pipeline 主页面（配置区→题目列表→练习面板→已练列表）

## 4. 题目→练习贯通

- [x] 4.1 题目卡片 [练习] 按钮打开练习面板，携带题目上下文
- [x] 4.2 练习面板首次加载时调用 coach/stream，传入 questionContext + 引导消息
- [x] 4.3 题目卡片显示练习状态标记（已练习 ✓ + 评分 / 未练习）

## 5. 练习记录管理

- [x] 5.1 练习面板 [保存到题库] 按钮，提取 Q&A 保存到 practiceRecords
- [x] 5.2 已练列表展示练习记录 + 手动故事统一视图，标注来源
- [x] 5.3 搜索和按分类/来源筛选
- [x] 5.4 练习记录详情展开 + [重新练习] + [删除]

## 6. 验证

- [x] 6.1 TypeScript 编译零错误
- [x] 6.2 Pipeline 全流程：配置 → 出题 → 练习 → 保存 → 查看记录
- [x] 6.3 教练流式输出正常工作（题目上下文模式 + 通用模式）
- [x] 6.4 现有评分功能不受影响
- [x] 6.5 1920px / 1280px / 375px 布局正确，无水平滚动
