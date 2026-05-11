## Context

当前系统有两层面试能力：

| 层 | 位置 | 能力 |
|---|------|------|
| 现有 `/interview` 页面 | 手动 UI | 出题（调用 API）、教练面板（手动模式切换 + 写回答）、评分（粘贴文字 → API） |
| 现有 `/agent` 页面 | Agent Chat | 通用求职对话、JD 评估（内嵌）、工具调用、会话管理、信号提取 |

Agent Chat 基础设施已具备：`agentLoopClient`（流式 tool loop）、`SessionList`（多会话管理）、`AgentMemory`（信号提取 + profile 更新）、`ToolResultCard`（工具结果渲染）。

**核心洞察**：面试教练本质上是一个「专用 System Prompt + 两个工具（出题/评分）+ 对话」的场景。这与 Agent Chat 的基础设施完全匹配。

## Goals / Non-Goals

**Goals:**
- 在 Agent Chat 内提供面试教练体验，复用 100% 的流式对话和会话管理能力
- 教练对话写入 Agent Memory，与 Profile 信号系统打通
- 六种面试模式（VISION V1.5 定义）作为 System Prompt 的一部分
- 新增 `generate_interview_questions` 和 `score_interview_answer` 两个工具

**Non-Goals:**
- 不删除 `/interview` 页面（Phase 2 处理）
- 不修改 `agentLoopClient` 核心逻辑
- 不改变现有 Agent Chat 的 UI 布局
- 不支持语音面试（这属于 VISION V2.5.2，多 Agent 之后的事）

## Decisions

### Decision 1: 教练模式如何触发

**选择: Suggestion Chip + 自然语言双入口**

```
方式 A: 用户点击 suggestion chip "模拟面试"
  → 发送预设消息 "帮我做一次模拟面试"
  → Agent 检测到 intent → 加载教练 prompt

方式 B: 用户自然输入 "我想练习面试" / "准备一下字节的产品面"
  → Agent 检测到面试 coaching intent
  → 自动加载教练 prompt
```

不新增 UI toggle/模式切换按钮，避免给 Agent Chat 增加复杂度。

Intent 检测规则（客户端轻量正则）：
- 关键词：`面试` + (`练习`|`模拟`|`准备`|`教练`|`训练`)
- 关键词：`准备.*面` / `面.*怎么答` / `帮我出.*题`

### Decision 2: 教练 System Prompt 结构

**选择: 分层 Prompt = 基础 Agent Prompt + 教练 Overlay**

```
[现有 Agent System Prompt]
  - 你是谁、工具列表、行为规范

+ [面试教练 Overlay]  ← 仅在教练模式激活
  - 六种面试模式定义（项目复盘/行为问答/情景应对/结构化/创始人/国企）
  - 当前 JD 上下文（如果用户选了）
  - 当前 CV 上下文（从 localStorage 读取）
  - 出题策略和追问策略
  - 评分标准和维度权重
```

Overlay 文件放在 `frontend/src/lib/agent/interview-coach-prompt.ts`，集中管理。

### Decision 3: 工具实现方式

**选择: 服务端 API + tool handler 注册**

```
工具调用流程:
  Agent Loop → tool_call: { name: "generate_interview_questions", args: {...} }
  → agentLoopClient 拦截 tool_call 事件
  → POST /api/agent/tools/interview/generate-questions
  → 返回 { questions: [...] }
  → tool_result 事件 → Agent 继续生成对话文本
```

工具注册在 `frontend/src/lib/agent/tools/interview-tools.ts`：

```typescript
export const INTERVIEW_TOOLS = [
  {
    name: "generate_interview_questions",
    description: "基于 JD 和 CV 生成个性化面试题目",
    parameters: {
      jdText: string,      // JD 正文（可选，无则通用出题）
      cvText: string,      // CV 正文（可选）
      company: string,     // 目标公司
      role: string,        // 目标职位
      mode: CoachMode,     // 六种模式之一
      count: number,       // 题目数量，默认 8
    }
  },
  {
    name: "score_interview_answer",
    description: "对用户的面试回答进行四维度评分",
    parameters: {
      question: string,    // 原题
      answer: string,      // 用户回答
      mode: CoachMode,     // 面试模式（影响权重）
      context: string,     // JD/CV 上下文
    }
  }
];
```

### Decision 4: 对话记忆归属

**选择: 教练对话存入同一 Agent 会话**

教练对话和普通 Agent 对话在同一个会话中，不创建独立的"面试会话"。

理由：
- Agent 在后续对话中可以引用教练对话中的发现（"你之前练习时提到过..."）
- Profile 信号提取统一处理，不区分来源
- 简化会话管理，不需要"面试专属会话"概念

如果用户想隔离面试练习，可以手动新建会话。

### Decision 5: Suggestion Chips 扩展

在 `DEFAULT_SUGGESTIONS` 中新增面试相关 chips：

```typescript
{ text: "模拟面试", icon: "🎯", query: "帮我做一次模拟面试练习" },
{ text: "准备字节面试", icon: "🏢", query: "我准备面试字节跳动的产品岗位，帮我出些题" },
```

## Architecture

```
┌────────────────────────────────────────────────────────┐
│                   Agent Chat (/agent)                   │
├────────────────────────────────────────────────────────┤
│                                                        │
│  ┌─────────────┐  ┌───────────────────────────────┐   │
│  │ SessionList  │  │  AgentChat                     │   │
│  │             │  │                                │   │
│  │ 会话1 (普通) │  │  ┌──────────────────────────┐  │   │
│  │ 会话2 (面试) │  │  │  Messages                 │  │   │
│  │ 会话3 (JD)  │  │  │  • user: "模拟面试"       │  │   │
│  │             │  │  │  • assistant: 教练响应     │  │   │
│  │             │  │  │  • tool: generate_questions│  │   │
│  │             │  │  │  • user: "我的回答是..."   │  │   │
│  │             │  │  │  • tool: score_answer      │  │   │
│  │             │  │  └──────────────────────────┘  │   │
│  │             │  │                                │   │
│  │             │  │  ┌─ SuggestionChips ─────────┐ │   │
│  │             │  │  │ 🎯 模拟面试  📝 评估JD    │ │   │
│  │             │  │  │ 💼 帮我分析  📊 投递状态  │ │   │
│  │             │  │  └──────────────────────────┘ │   │
│  └─────────────┘  └───────────────────────────────┘   │
│                                                        │
│  ┌──────────────────────────────────────────────────┐ │
│  │  System Prompt (动态组装)                         │ │
│  │  ┌────────────┐  ┌─────────────────────────┐    │ │
│  │  │ Base Prompt │  │ Interview Coach Overlay │    │ │
│  │  │ (always)    │  │ (when intent=coaching)  │    │ │
│  │  └────────────┘  └─────────────────────────┘    │ │
│  └──────────────────────────────────────────────────┘ │
│                                                        │
│  ┌──────────────────────────────────────────────────┐ │
│  │  Agent Memory / Signal Extraction                 │ │
│  │  • 教练对话中的技能提及 → profile_signals         │ │
│  │  • 评分结果 → 弱项分析                            │ │
│  │  • 对话结束 → triggerProfileUpdate               │ │
│  └──────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────┘
```

## Risks / Trade-offs

- [Risk] 面试教练 System Prompt 叠加可能使 token 消耗显著增加 → 用轻量 Overlay（精简六种模式描述，不全文展开）
- [Risk] 教练模式和非教练模式在同一会话中混合，Agent 可能"忘记"自己在教练模式 → System Prompt 中显式标记当前模式状态
- [Trade-off] 不新建独立面试会话 → 用户如果想隔离练习，需要手动新建 → 接受此 trade-off，通过 suggestion chip 引导
