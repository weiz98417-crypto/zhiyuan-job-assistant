## Context

当前面试练习的流式输出存在两个层面的问题：

1. **SSE 流式层面**：`coach/stream/route.ts` 自维护了一套完整的 SSE 解析+正则提取逻辑，与 `stream-utils.ts` 的 `createStructuredStream` 功能重复但格式更严苛（`<<SECTION_>>##` 需要 label 行），格式偏差直接导致静默失败。

2. **交互流程层面**：`PracticePanel` 的 auto-bootstrap useEffect 在用户还没输入回答时就自动发消息给 AI，导致整个对话逻辑混乱——AI 在分析题目而用户还没开始回答，保存时又把 AI 消息当成了 answer。

已有三个 completed change（`fix-interview-pipeline-core`、`interview-pipeline-unified`、`v15-ai-foundation`）都修过这个链路，但都是修补式修复，没有解决根本架构问题。

## Goals / Non-Goals

**Goals:**
- 统一 SSE 流式架构：coach/stream 复用 `stream-utils.ts` 的 `createStructuredStream`，只保留 coach 特有的 followUps/riskWarnings 提取逻辑
- 放宽 AI 输出格式：从 `<<SECTION_key>>## label` 简化为 `<<SECTION_key>>`（与 evaluate/jd 一致）
- 增加 raw fallback：结构化提取为空时，将 AI 原始输出直接展示
- 修复练习对话 UX：用户先输入回答 → AI 评分/指导（去掉 auto-bootstrap）
- 修复保存逻辑：只保存用户的回答内容作为 answer

**Non-Goals:**
- 不改变大厂预设、出题逻辑、QuestionList 组件
- 不改变 StarStory 编辑器、独立评分工具
- 不增加新的 API 端点

## Decisions

### 1. 统一使用 `<<TAG>>...<</TAG>>` 格式

**选择**：用 `<<SECTION>>\n内容\n<</SECTION>>` 替代 `<<SECTION_key>>## label\n内容\n<</SECTION_key>>`

**理由**：
- 与 evaluate/jd 路由的 `<<SUMMARY>>...<</SUMMARY>>` 格式一致
- 减少 AI 格式偏差的概率（少了 `##` + label 的约束）
- label 信息改为在 system prompt 中要求 AI 用 markdown heading（如 `### 背景`）在内容中自行标注

**替代方案**：继续用 `<<SECTION_key>>## label` 但放宽正则（如允许 label 换行）→ 正则只会更复杂，不解决根本问题

### 2. 流式架构重构

**选择**：服务端 coach/stream 改用 `createStructuredStream` 的底层 fetch+chunk 循环模式，只在上层加 coach 特有的 followUps/riskWarnings 正则提取

**架构变化**：
```
之前:
  coach/stream/route.ts (完整独立实现: fetch + 行缓冲 + emitPendingSections + tryExtractFollowUps)

之后:
  stream-utils.ts `createStructuredStream` (共享: fetch + 行缓冲 + tryExtractSections)
  coach/stream/route.ts (仅扩展: tryExtractFollowUps + raw fallback + questionContext prompt)
```

**客户端**：`parseSSEStream` 保持不变（行缓冲 SSE 解析逻辑正确），增加 raw section 处理

### 3. Raw Fallback 机制

**选择**：在 stream close 前检查是否有任何 section 被发出。如果没有，将整个 buffer 作为 `raw` section 发出。

```
服务端伪代码:
  let sectionsEmitted = 0;
  // ... during streaming: tryExtractSections → emit + count
  // ... on stream close:
  if (sectionsEmitted === 0 && buffer.trim()) {
    emit section { key: "raw", label: "AI 分析", content: buffer }
  }
  emit done
```

**理由**：用户至少能看到 AI 输出了什么，方便诊断和迭代。不会让 AI 的完整输出静默丢失。

### 4. 练习对话流程重构

**选择**：去掉 auto-bootstrap useEffect

**之前**：
```
用户点[练习此题] → PracticePanel 渲染 → useEffect 自动发送引导消息 → AI 分析题目
```

**之后**：
```
用户点[练习此题] → PracticePanel 渲染
  → 显示题目卡片（考察意图 + 准备提示）
  → 提示文字："请在下方输入你对于这道题的回答"
  → 用户输入回答 → 点发送
  → POST /api/interview/coach/stream（携带用户的回答作为 user message）
  → AI 对用户回答进行结构化反馈（按 sections 输出）
  → 追问按钮出现
  → 用户可以继续对话或保存
```

**理由**：
- 用户先回答再获得反馈是自然的练习流程
- 去掉 auto-bootstrap 减少了非用户触发的 API 调用
- 用户的第一条消息就是自己的回答，保存逻辑自然正确

**首次练习 vs 重新练习**：
- 首次练习：题目卡片 + 输入框 + "输入你的回答"
- 重新练习（isRePractice=true）：保留已有消息历史，用户可以直接改进回答

### 5. 保存逻辑修复

**选择**：`handleSave` 只保存用户消息中的内容作为 answer

```
const answer = messages
  .filter(m => m.role === "user")
  .slice(-1)[0]?.content || "";  // 取最后一条用户消息
```

**理由**：之前拼接所有 assistant 消息是明显的逻辑错误——AI 的分析指导不是用户的回答。

## Risks / Trade-offs

- **[风险] 放宽格式后 AI 可能输出更难解析的自由文本** → 缓解：system prompt 仍然要求用 `<<SECTION>>` 格式 + markdown heading，只是不再要求 `##` + 严格正则。raw fallback 兜底。
- **[风险] `createStructuredStream` 需要扩展以支持 coach 特有的 multi-message 场景** → 缓解：当前版本只支持 system + user 单轮，coach 需要多轮对话，需要传 messages 数组而非单个 userMessage
- **[权衡] 去掉 auto-bootstrap 后首次练习多了一步（用户需要手动输入）** → 接受，因为正确的交互流程比少点一次更重要
