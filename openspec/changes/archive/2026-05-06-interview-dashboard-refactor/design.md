## Context

Phase 1 完成后，面试教练能力已迁移到 Agent Chat。`/interview` 页面上原有的手动教练 UI（PracticePanel、评分工具、模式选择器、出题配置）变成了冗余。但该页面仍有保留价值——它是用户查看面试准备历史数据的自然入口。

当前 `/interview` 页面包含：
- 出题配置区（JD 选择器、CV 状态、公司预设、教练模式选择、生成按钮）
- 题目列表区（QuestionList 组件）
- 练习面板区（PracticePanel 组件，进入后覆盖题目列表）
- 独立评分工具（可折叠）
- 练习记录 + STAR 故事（PracticeRecords 组件）
- 即将面试日程

## Goals / Non-Goals

**Goals:**
- 删除所有手动教练 UI（PracticePanel、评分工具、教练模式选择）
- 保留并增强数据视图（练习记录、STAR 故事、面试日程）
- 新增练习统计分析
- 每个模块增加跳转 Agent 教练模式的入口
- 出题配置区改为 Agent 预配置（选好 JD/预设 → 跳 Agent）

**Non-Goals:**
- 不移除 QuestionList 的数据获取逻辑（Agent 可能间接用到）
- 不删除后端 API（`/api/interview/*`），Phase 3 统一处理
- 不修改 PracticePanel 组件本身（可能在 Phase 3 被 Agent 子组件引用）
- 不修改数据库 schema

## Decisions

### Decision 1: 页面布局

```
┌─────────────────────────────────────────────────────┐
│  面试准备                          [+ 跳转到教练]    │
│  32 次练习 · 8 个故事 · 2 场即将面试                 │
├─────────────────────────────────────────────────────┤
│                                                     │
│  ┌─ 练习概览 ───────────────────────────────────┐  │
│  │  📈 练习趋势（简易折线/柱状图）                │  │
│  │  📊 题型分布（行为/技术/案例/文化 饼图）        │  │
│  │  🎯 弱项提示（"你的事件处理类题目均分最低"）    │  │
│  │  [去针对性练习 →]                             │  │
│  └──────────────────────────────────────────────┘  │
│                                                     │
│  ┌─ 最近练习记录 ──────────────────────────────┐  │
│  │  题目 | 模式 | 日期 | 分数 | 操作            │  │
│  │  ... (可展开、可筛选)                        │  │
│  │  [查看全部] [练习同类题目 →]                 │  │
│  └──────────────────────────────────────────────┘  │
│                                                     │
│  ┌─ STAR 故事库 ───────────────────────────────┐  │
│  │  故事卡片 × N                                │  │
│  │  [添加故事] [用故事练习 →]                   │  │
│  └──────────────────────────────────────────────┘  │
│                                                     │
│  ┌─ 面试日程 ──────────────────────────────────┐  │
│  │  日期 | 公司 | 轮次 | 准备状态               │  │
│  │  [针对性准备 →]                              │  │
│  └──────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
```

### Decision 2: 跳转 Agent 的参数传递

**选择: URL query params + Agent 自动检测**

```
跳转链接格式:
/agent?coach=true&jdId=123&mode=project-review&questionType=behavioral

Agent Chat 加载时检测 URL params:
- coach=true → 自动加载教练 System Prompt Overlay
- jdId=123 → 从 db.jds 读取 JD 上下文
- mode=project-review → 预设教练模式
```

不通过 localStorage 传参（太脆弱），用 URL params（可分享、可书签）。

### Decision 3: 练习统计分析

**选择: 客户端计算，DexieDB 聚合查询**

```typescript
// 从 db.practiceRecords 直接聚合
const stats = {
  total: records.length,
  avgScore: avg(records.map(r => r.score).filter(Boolean)),
  byCategory: groupBy(records, 'questionCategory'),
  byMode: groupBy(records, 'mode'),
  trend: records.slice(-10).map(r => ({ date: r.createdAt, score: r.score })),
};
```

不新增后端 API，所有数据已在 IndexedDB 中。

### Decision 4: 保留哪些 UI 组件

| 组件 | 决策 | 理由 |
|------|------|------|
| `QuestionList` | 保留但隐藏 | Phase 3 中可能被 Agent 的 `generate_questions` 工具引用 |
| `PracticePanel` | 保留文件但页面不引用 | Phase 3 可能作为 Agent 的子组件 |
| `PracticeRecords` | 保留并增强 | 核心数据视图 |
| Story editor modal | 保留 | STAR 管理仍是手动功能 |
| 评分工具 | 删除 | 已迁移到 Agent |
| 教练模式选择 | 删除 | 已迁移到 Agent |
| 出题配置 | 简化为预配置 + 跳转 | 保留 JD 选择器和预设，但移除出题按钮 |

## Risks / Trade-offs

- [Risk] 页面功能大幅缩减，用户可能觉得"变空"了 → 用统计看板 + 引导文案填补空白
- [Trade-off] 练习面板组件保留但不在该页面引用，可能成为 dead code → 接受此风险，Phase 3 会重新使用
- [Risk] URL params 传递敏感参数（JD 内容）太长 → 只传 ID 和 mode，不传全文
