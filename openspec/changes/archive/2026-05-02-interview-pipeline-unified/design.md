## Context

当前 interview/page.tsx 使用三 Tab 架构（出题/教练/题库），每个 Tab 独立运行，无数据流连接。用户无法从生成的题目进入练习、练习结果无法保存到题库、教练不知道在回答哪道题。

已有基础设施：
- `/api/interview/generate` — 基于 JD+CV 生成题目
- `/api/interview/coach/stream` — 多轮流式教练对话（SSE）
- `/api/interview/score` — 回答评分
- `db.jds` — JD 存储（IndexedDB）
- `db.stories` — STAR 故事存储（IndexedDB）
- `db.practiceRecords` — 需新建表

## Goals / Non-Goals

**Goals (Phase 1 — 本次):**
- 合并三 Tab 为单页 Pipeline 布局（配置区→题目列表→练习面板→已练列表）
- 题目卡片 → 练习面板的数据贯通（点击 [练习] 传入题目上下文）
- 教练 API 接收题目+JD+CV 上下文，输出围绕具体题目的回答指导
- 练习完成后保存 Q&A 对到题库（新表 `practiceRecords`）
- 题库展示练习状态（已练习/未练习）+ 评分 + 标签
- 流式输出正常运作

**Non-Goals (Phase 2 — 后续):**
- 全真模拟面试会话管理
- 语音输入/输出
- 计时器
- 会话报告

## Decisions

### 1. 页面布局：四区 Pipeline 单页

```
┌─ ① 配置区 ───────────────────────────────────┐
│  [JD选择器 ▼] [CV已就绪 ✓] [预设: 通用]        │
│  [生成面试题目]  (生成后配置区可折叠)            │
├─ ② 题目列表 ───────────────────────────────────┤
│  ┌ Q1 ─────┐ ┌ Q2 ─────┐ ┌ Q3 ─────┐         │
│  │ [技术]   │ │ [行为]   │ │ [案例]   │         │
│  │ 问: ...  │ │ 问: ...  │ │ 问: ...  │         │
│  │ [练习→] │ │ [练习→] │ │ [练习→] │         │
│  └─────────┘ └─────────┘ └─────────┘         │
├─ ③ 练习面板 (替换题目列表区，有返回按钮) ────────┤
│  ← 返回题目列表   当前：Q1 说说你对微服务的理解    │
│  ┌ 对话区 ──────────────────────────────────┐  │
│  │ [流式输出教练回答]                         │  │
│  │ [追问按钮]                                │  │
│  └──────────────────────────────────────────┘  │
│  [输入框] [发送]   [💾 保存到题库]              │
├─ ④ 已练列表 (底部，可折叠) ────────────────────┤
│  Q1 ✓ 4.2分 | Q3 ✓ 3.8分 | 其余待练习          │
│  [查看全部练习记录]                             │
└────────────────────────────────────────────────┘
```

选择理由：用户研究显示面试准备的自然流程是"选出题→逐一练习→保存回顾"，Pipeline 布局匹配这个心智模型。Tab 切换打断思考流，且无法表达"进度"。

### 2. 题目→练习的连接方式

题目卡片点击 [练习] 后：
1. 题目列表区收起/替换为练习面板（带返回箭头）
2. 练习面板顶部显示当前题目文本 + 分类标签
3. 教练 system prompt 包含：题目文本、考察意图、JD 摘要、CV 摘要
4. 用户可以在练习面板中直接发送第一条消息（预填提示："请开始回答这道题"）

不做独立的教练页面/路由，保持在同一页面内切换，避免丢失上下文。

### 3. 教练 API 增强

`POST /api/interview/coach/stream` 新增可选字段：

```ts
questionContext?: {
  question: string;       // 正在练习的题目
  context: string;        // 考察意图
  storyHint: string;      // 准备提示
  jdSummary: string;      // JD 摘要（前 500 字）
  cvSummary: string;      // CV 摘要（前 500 字）
}
```

System prompt 调整：当有 questionContext 时，围绕"如何回答这道具体题目"组织指导；没有时保持现有的"根据经历组织回答"模式。

**为什么复用现有端点而非新建**：流式基础设施和解析逻辑已就绪，questionContext 为可选字段向后兼容。

### 4. 练习记录数据模型

```ts
interface PracticeRecord {
  id?: number;
  question: string;        // 题目文本
  questionCategory: string; // 分类
  answer: string;          // 最终回答（最后一次 assistant 回复的全文）
  score?: number;          // 评分（可选，用户可手动触发评分）
  jdCompany?: string;      // 关联的公司
  jdRole?: string;         // 关联的职位
  tags: string[];          // 自动标签（分类+关键词）
  createdAt: Date;
}
```

存储在 IndexedDB 新表 `db.practiceRecords`。与 `db.stories`（手动 STAR 故事）共存，题库 Tab 改为展示两者的统一视图。

### 5. 题库改造

题库不再只是手动 STAR 故事。新题库展示：
- **练习记录**（从 practiceRecords 加载）：显示题目、回答摘要、评分、练习时间
- **手动故事**（从 stories 加载，保留兼容）：现有 STAR 故事继续可用

搜索和筛选作用于两者。练习记录可展开查看完整回答、重新练习、删除。

### 6. 组件拆分

`interview/page.tsx` 当前 ~800 行，Pipeline 改造后会更长。拆分为：

- `interview/page.tsx` — 主页面，管理全局状态和 Pipeline 阶段切换
- `interview/QuestionList.tsx` — 题目卡片网格 + 筛选
- `interview/PracticePanel.tsx` — 练习对话面板（复用现有 coach chat UI）
- `interview/PracticeRecords.tsx` — 已练列表 + 展开详情

## Risks / Trade-offs

- [Risk] 单页内容过多，滚动冗长 → 配置区和已练列表默认折叠，练习面板展开时隐藏题目列表
- [Risk] 已练习题目重复练习浪费 token → 题目卡片显示"已练习 ✓"标记，但允许重练
- [Risk] 流式输出解析 bug → 在本次改造中集中修复 SSE 解析逻辑，增加错误兜底
- [Risk] 旧 stories 表与 practiceRecords 表共存混乱 → 题库统一视图，明确标注来源

## Migration Plan

1. 新增 `PracticeRecord` 类型和 `db.practiceRecords` 表
2. 创建 `/api/interview/coach/stream` 增加 questionContext 参数（向后兼容）
3. 重构 `interview/page.tsx` 为 Pipeline 布局
4. 拆分子组件
5. 旧 `interview-coach-chat` 和 `interview-prep-ui` delta spec 归档
6. 无需数据迁移（现有 stories 共存）
