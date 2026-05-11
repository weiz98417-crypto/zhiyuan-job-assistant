## Why

面试准备的三个模块（出题、教练、题库）当前是互不连接的孤岛：出了题目没有"练习"入口，教练不知道在练哪道题，题库是手动录入的独立笔记本。用户的核心痛点——"出了题然后呢？摆着看吗？"——源于模块间缺乏以题目为线索的 Pipeline 设计。业界标杆（TechSpar、interview-coach-skill）均采用 Pipeline 架构：Setup → Generate → Practice → Save → Track，题目贯穿全流程。

本变更分两阶段：**Phase 1** 将三个孤岛改造为统一 Pipeline 页面（单页四区），**Phase 2** 增加全真模拟面试会话。

## What Changes

**Phase 1 — Pipeline 统一（本次实现）：**
- **BREAKING**: 移除三个 Tab（出题/教练/题库），替换为单页四区 Pipeline 布局
- 新增题目→练习连接：每张题目卡片增加 `[练习此题]` 按钮，点击在内联面板中打开教练对话
- 教练对话接收题目上下文（问题文本、考察意图、JD 摘要、CV 摘要），不再只是裸经历描述
- 练习完成后一键保存 Q&A 对到题库，带自动标签和评分
- 题库从"手动 STAR 故事"升级为"已练习 Q&A 对 + 手动故事"，显示练习状态
- 修复教练流式输出（如果当前 stream API 有 bug，一并修复）

**Phase 2 — 全真模拟（后续）：**
- 新增模拟面试会话：选择 JD → 生成题目集 → 逐题计时问答 → 会话报告
- 可选语音输入/输出
- 会话结束后生成综合评估报告

## Capabilities

### New Capabilities

- `interview-pipeline-layout`: 单页 Pipeline 布局（配置区→题目列表→练习面板→已练列表），替换三个独立 Tab
- `interview-question-practice`: 题目卡片增加练习动作，点击后在上下文中打开教练对话，携带题目+JD+CV 信息
- `interview-practice-record`: Q&A 练习记录类型，支持从教练对话保存到题库，含题目、回答、评分、标签、练习时间

### Modified Capabilities

- `interview-prep-ui`: 整体布局从三 Tab 改为四区 Pipeline；题库从纯手动故事升级为练习记录+故事混合；题目卡片 UI 增加操作按钮
- `interview-coach-chat`: 教练对话流式端点增加题目上下文参数（questionText, jdSummary, cvSummary），system prompt 围绕具体题目组织回答

## Impact

- **前端**: `interview/page.tsx` 全面重构（合并三 Tab 为 Pipeline 布局）；新增 `QuestionCard`、`PracticePanel`、`PracticeRecordList` 三个内联组件
- **API**: `/api/interview/coach/stream` 增加可选参数 `questionContext`；新增 `/api/interview/practice/save` 保存练习记录
- **类型**: 新增 `PracticeRecord`、`QuestionPracticeContext` 类型；`CoachMessage` 保持不变
- **存储**: 新增 `db.practiceRecords` IndexedDB 表；现有 `db.stories` 保留兼容
- **风险**: 流式输出如果当前有 bug，在本次修复
