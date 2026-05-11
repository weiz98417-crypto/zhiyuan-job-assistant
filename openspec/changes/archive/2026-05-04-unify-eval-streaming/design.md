## Context

当前项目有三条评估路径：CLI Agent（modes + Claude Code）、前端 `/evaluate` 页面（假 loading 动画 + 一次性 JSON）、Agent Chat（prompt.ts 完全不知道 modes 存在）。三者没有统一的评估引擎。截图 OCR 识别与 A-G 评估割裂。

Agent Chat 已有 ReAct 循环、工具调用展示、流式输出、会话管理、多模态输入（Claude Code 侧）——这些能力天然适合承载评估过程。市面主流 Agent 产品（ChatGPT、Claude、Kimi）的交互模式都是：用户在对话中发送内容 → Agent 调用工具 → 流式展示过程 → 回复结果 → 用户追问。

## Goals / Non-Goals

**Goals:**
- Agent Chat 成为唯一的评估交互界面，所有评估在对话中完成
- `/evaluate` 降级为纯管理页面（JD 库 + 报告库）
- 流式评估引擎统一服务 Agent Chat 的工具调用
- 截图作为评估的第一公民输入方式

**Non-Goals:**
- 不在 `/evaluate` 页面维护独立的流式消费 UI
- 不改造 CLI modes 内容
- 不删除 CLI Agent 能力

## Decisions

### Decision 1: Agent Chat 是唯一评估交互界面

**选择:** 所有 JD 评估交互在 Agent Chat 中完成。`/evaluate` 退化为管理页面。

用户三种发起方式：
```
/agent 页面:
  • 文本: "帮我评估这个JD: [粘贴内容]"
  • URL:   "评估这个链接: https://..."
  • 截图:  点击 + 按钮上传截图 → "评估这些截图"
  • 混合:  粘贴文本 + 上传截图（截图优先）
```

Agent 收到后调用 evaluate_jd 工具 → 内部走流式评估 → 对话中实时展示进度 → 完成。

**为什么不用独立的 `/evaluate` 页面：**
- Agent Chat 已有 ReAct 循环、工具可见性、流式输出、会话管理——不需要重复造
- 评估后的追问（"这个薪资合理吗？""帮我改简历"）天然在对话中延续
- 市面标准交互模式

### Decision 2: SSE 事件协议

与之前设计相同，但消费方简化为仅 Agent Chat：

```
event: phase         → { phase: "extracting_jd"|"extracting_ocr"|"detecting_archetype"|... }
event: ocr_progress  → { current, total, partialText? }
event: block_start   → { block: "a"-"g", label: string }
event: block_chunk   → { block, content }
event: block_done    → { block }
event: score         → { block, score }
event: overall_score → { score }
event: search_start  → { query, source }
event: search_result → { count, summary }
event: report_saved  → { path, num }
event: done          → {}
event: error         → { message }
```

### Decision 3: Agent 评估卡片 vs 纯文本回复

**选择:** 评估过程中，Agent 对话展示一个**实时更新的评估进度卡片**（`AgentEvalCard`）。

```
用户: 帮我评估这个JD...

纸鸢: 开始评估 🪁

┌─────────────────────────────────────────┐
│ 🔍 提取 JD                  ✓           │
│ 🏷️ Archetype 检测           ✓           │
│ 📊 A·职位概览               ✓ 4.0       │
│ 🎯 B·简历匹配               ⏳ 生成中... │
│ 💰 C·职级策略               ○           │
│ ...                                     │
└─────────────────────────────────────────┘

// 完成后
纸鸢: 评估完成！总分 4.2/5。
      • 最大亮点：你的 AI 产品经验与岗位高度匹配
      • 主要风险：该公司近期有裁员新闻
      • 建议：值得投递，面试时重点展示 X 能力
      
      [保存到 JD 库]  [加入投递追踪]  [放弃]

// 用户点击确认后
纸鸢: ✓ JD 已保存到库，已加入投递追踪。
      完整报告 → reports/042-bytedance-2026-05-03.md
```

评估完成后，用户可以继续追问，Agent 可以查报告细节、对比其他 Offer、生成简历等。

### Decision 4: Human-in-the-Loop 保存确认

**选择:** 评估完成后不自动持久化。Agent 在回复下方展示确认按钮组，用户点击后才保存。

**按钮组:**
- 「保存到 JD 库」→ 存 IndexedDB JD 库
- 「加入投递追踪」→ 写 applications.md（分数 < 3.5 时按钮旁有温和提示）
- 「放弃」→ 不持久化，数据仅在当前会话上下文保留

**理由:**
- 产品文档明确要求 Human-in-the-Loop：AI 评估建议，人决定行动
- 避免低质量评估结果污染 JD 库和追踪表
- 用户可能在评估后觉得不适合，不应强制保存
- 法规/隐私：用户的求职数据在明确授权后才落盘

**数据流:**
```
评估完成 → 结果暂存前端内存
         → Agent 展示确认按钮
         → 用户点击确认 → POST /api/report/save → 写文件 + 写 IndexedDB
         → 用户点击放弃 → 结果仅会话内保留，关闭后消失
```

### Decision 5: Phase 0 三种输入 + OCR

与之前设计相同。截图通过 `+` 按钮上传，与文本输入框共享同一发送按钮。

### Decision 5: `/evaluate` 页面改造

移除输入区、loading 视图、报告渲染视图。保留：
- `/evaluate` → 概览页（统计卡片：总 JD 数、总报告数、平均分），或直接重定向到 JD 库
- `/evaluate/jds` → JD 库（保持不变）
- `/evaluate/reports` → 报告库（保持不变）
- `/evaluate/history` → 评估历史（保持不变）

## Risks / Trade-offs

- 评估过程在 Agent Chat 中展示不如独立页面"沉浸" → 缓解：评估卡片做成可展开的，用户点击后进入全屏报告视图
- Agent Chat 上下文可能被评估的详细内容撑爆 → 缓解：评估详细报告存文件，对话中只展示摘要，详细内容通过链接跳转报告库

## Open Questions

- 评估卡片在对话中应该展开多大？默认收起到卡片高度（约 200px），点击展开全屏报告？
- `/evaluate` 首页是重定向到 `/evaluate/jds` 还是做统计概览？
