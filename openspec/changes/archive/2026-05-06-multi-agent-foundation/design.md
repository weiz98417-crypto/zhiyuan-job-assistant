## Context

Phase 1 验证了"场景化 Agent 模式"的可行性——面试教练作为 Agent Chat 的一个专用模式工作良好。Phase 3 将这一模式系统化：从「一个 Agent 多个模式」升级为「Orchestrator + 多个独立子 Agent」的架构。

当前 Agent Chat 架构：
```
User Message → Agent Page → buildAgentSystemPrompt() → agentLoopClient() → DeepSeek API
                              ↑ 单一 prompt                ↑ 单一 tool loop
```

目标架构：
```
User Message → Orchestrator → Intent Classification
                                   ↓
                    ┌──────────────┼──────────────┐
                    ↓              ↓              ↓
              Interview Agent  Eval Agent    General Agent
              (专用prompt)    (专用prompt)    (通用prompt)
              (2 tools)      (3 tools)      (10+ tools)
                    ↓              ↓              ↓
                    └──────────────┼──────────────┘
                                   ↓
                           Shared Memory
```

## Goals / Non-Goals

**Goals:**
- 实现轻量意图路由，将用户消息分发到正确的子 Agent
- 子 Agent 有独立的 System Prompt 和 Tool Set
- 所有 Agent 共享一个 Memory 层（Career DNA）
- Phase 1 面试教练迁移为独立子 Agent（零损失）
- 架构可扩展——新增子 Agent 只需注册，不改核心代码

**Non-Goals:**
- 不支持 Agent 间直接通信（链式调用）——V1 只做树状调度
- 不实现 Agent 的热插拔或动态工具注册——都需要代码变更
- 不涉及语音面试、谈判助手、全流程自动化（这些是独立的后续 changes）
- 不修改 DeepSeek API 调用层——只在 prompt 和 tool 层做编排
- 不引入 LangGraph 等重型框架——保持自建轻量方案

## Decisions

### Decision 1: 编排模式

**选择: 客户端意图检测 + 服务端 Agent 执行**

```
┌─ Client ─────────────────────┐  ┌─ Server ───────────────────┐
│  user message                 │  │                            │
│      ↓                        │  │  POST /api/agent/orchestrate│
│  classifyIntent(text)  ───────┼─→│      ↓                     │
│  (轻量正则 + 关键词)           │  │  resolveAgent(intent)       │
│      ↓                        │  │      ↓                     │
│  agentId + context            │  │  loadPrompt(agentId)       │
│      ↓                        │  │  loadTools(agentId)        │
│  agentLoopClient(             │  │      ↓                     │
│    agentPrompt,               │  │  execute with DeepSeek     │
│    agentTools,                │  │      ↓                     │
│    messages                   │  │  SSE stream response       │
│  )  ←─────────────────────────│──│  (agent_id + phase + text) │
└───────────────────────────────┘  └──────────────────────────────┘
```

**为什么不全部放服务端？**
- 当前 `agentLoopClient` 在客户端处理 SSE 流式解析，工作良好
- 客户端有 DexieDB 用于 Memory 读写
- 服务端只负责 API 路由 + LLM 调用，保持薄层
- 这样可以渐进迁移，不需要重写整个 pipeline

### Decision 2: Agent Registry 设计

**选择: TypeScript 静态注册 + 运行时查询**

```typescript
// frontend/src/lib/agent/registry/index.ts

interface AgentDefinition {
  id: string;
  name: string;           // 中文显示名
  description: string;    // 能力描述
  intentPatterns: RegExp[]; // 触发该 Agent 的用户意图
  systemPrompt: () => string; // 动态 prompt 生成器
  tools: ToolDefinition[];    // 工具列表
  model?: string;           // 可选模型覆盖
  priority: number;         // 优先级（多匹配时取最高）
}

const AGENT_REGISTRY: AgentDefinition[] = [
  {
    id: "interview",
    name: "面试教练",
    description: "出题、模拟面试、回答评分",
    intentPatterns: [
      /面试.*(练习|模拟|准备|教练|训练)/,
      /(准备|练习|模拟).*面试/,
      /帮我.*出.*(题|面试)/,
      /怎么.*(答|说|面)/,
    ],
    systemPrompt: () => buildInterviewCoachPrompt(),
    tools: INTERVIEW_TOOLS,
    priority: 10,
  },
  {
    id: "evaluate",
    name: "JD 评估",
    description: "评估职位匹配度、公司分析",
    intentPatterns: [
      /^(帮我|请|麻烦).*(评估|分析).*(JD|职位|岗位|这个)/,
      /这个.*(岗位|职位|JD).*(怎么样|如何|好不好)/,
    ],
    systemPrompt: () => buildEvalPrompt(),
    tools: EVAL_TOOLS,
    priority: 10,
  },
  {
    id: "general",
    name: "通用助手",
    description: "求职咨询、状态查询、简历建议",
    intentPatterns: [/.*/],  // 默认匹配
    systemPrompt: () => buildAgentSystemPrompt(),
    tools: DEFAULT_TOOLS,
    priority: 1,
  },
];

export function classifyIntent(content: string): AgentDefinition {
  const matches = AGENT_REGISTRY
    .filter(a => a.intentPatterns.some(p => p.test(content)))
    .sort((a, b) => b.priority - a.priority);
  return matches[0]; // 优先级最高的匹配
}
```

### Decision 3: 子 Agent 的会话隔离 vs 共享

**选择: 共享会话 + Agent 标签**

```
同一个会话内的消息:
┌──────────────────────────────────────┐
│ 会话: "准备字节面试"                   │
├──────────────────────────────────────┤
│ [user] "帮我评估这个JD"               │
│ [eval-agent] "好的，这个JD..."        │
│ [user] "帮我出几道面试题"             │
│ [interview-agent] "根据JD，我出了..." │
│ [user] "我的回答是..."               │
│ [interview-agent] "评分如下..."       │
└──────────────────────────────────────┘
```

所有消息在同一会话中，通过 `agent_id` 字段区分来源。Memory 共享读取，各 Agent 都能获取完整会话上下文。

**为什么不分会话？**
- 用户心智模型是"我在跟纸鸢聊天"，不是"我在跟不同的专家聊"
- Career DNA 是所有 Agent 的基础上下文，分离会话会增加同步复杂度
- 子 Agent 之间不需要通信（V1），但需要共享对话历史

### Decision 4: Phase 1 面试教练如何迁移

**迁移路径：**

```
Phase 1 (当前计划):
  agent/page.tsx
  ├── sendMessage()
  │   ├── 检测面试 intent → 设置 isCoachMode
  │   ├── buildAgentSystemPrompt() + coachOverlay
  │   └── agentLoopClient(systemPrompt, tools, messages)

Phase 3 (迁移后):
  agent/page.tsx
  ├── sendMessage()
  │   ├── classifyIntent(content) → AgentDefinition
  │   ├── agentLoopClient(
  │   │     agentDefinition.systemPrompt(),  ← 包含 coach prompt
  │   │     agentDefinition.tools,            ← 包含面试工具
  │   │     messages
  │   │   )
  │   └── saveMessage({ agent_id: agentDefinition.id })
```

Phase 1 的 `interview-coach-prompt.ts` 被 `registry/` 中的 Interview Agent 直接引用，不需要重写。面试工具定义同样直接迁移。

### Decision 5: UI 如何展示当前 Agent

**选择: 轻量指示器，不破坏现有聊天布局**

```
┌────────────────────────────────────────────┐
│  纸鸢 Agent  [🎯 面试教练]  ← 当前模式标签  │
│  ─────────────────────────────────────── │
│  消息流 (不变)                             │
│  ┌──────────────────────────────────────┐ │
│  │ 纸鸢: 好的，我来帮你准备面试...        │ │
│  │ ...                                  │ │
│  └──────────────────────────────────────┘ │
│                                            │
│  ┌─ SuggestionChips ──────────────────┐  │
│  │ (根据当前 Agent 动态变化)            │  │
│  │ Interview Agent: 🎯 换一道题        │  │
│  │                  📊 看看我的弱项     │  │
│  │ Eval Agent:      📋 评估另一个JD    │  │
│  │                  🏢 分析这家公司     │  │
│  └────────────────────────────────────┘  │
└────────────────────────────────────────────┘
```

- Agent 标签：Header 区域的小 chip，显示当前激活的子 Agent
- Suggestion Chips：每个子 Agent 有自己的 suggestion 列表
- 用户可以自然语言随时切换（"帮我评估这个JD" → 自动切到 Eval Agent）

## Architecture Diagrams

### 完整数据流

```
┌──────────┐    ┌──────────────┐    ┌───────────────┐    ┌──────────┐
│  User    │    │  Orchestrator│    │  Agent        │    │  DeepSeek │
│  Input   │    │  (Client)    │    │  Registry     │    │  API      │
└────┬─────┘    └──────┬───────┘    └───────┬───────┘    └────┬─────┘
     │                 │                    │                  │
     │  "帮我准备面试"  │                    │                  │
     │────────────────→│                    │                  │
     │                 │                    │                  │
     │                 │  classifyIntent()  │                  │
     │                 │───────────────────→│                  │
     │                 │                    │                  │
     │                 │  "interview" agent │                  │
     │                 │←───────────────────│                  │
     │                 │                    │                  │
     │                 │  getPrompt("interview")               │
     │                 │──────────────────────────────────────→│
     │                 │                    │                  │
     │                 │  SSE: agent=interview, text="..."     │
     │                 │←─────────────────────────────────────│
     │                 │                    │                  │
     │  "好的，我..."   │                    │                  │
     │←────────────────│                    │                  │
     │                 │                    │                  │
     │                 │  saveToMemory(     │                  │
     │                 │    agent_id="interview",              │
     │                 │    messages        │                  │
     │                 │  )                 │                  │
     │                 │                    │                  │
```

### Agent 优先级路由

```
User: "帮我评估这个JD然后出几道面试题"
      ↓
classifyIntent(text)
      ↓ matches
┌─────────────────────────────┐
│ eval agent (priority=10)    │ ← "评估.*JD" 匹配
│ interview agent (prio=10)   │ ← "出.*面试题" 匹配
│ general agent (prio=1)      │ ← 兜底
└─────────────────────────────┘
      ↓ 同优先级取第一个
→ Eval Agent 处理评估部分
  (后续用户消息 "帮我出题" 会重新路由到 Interview Agent)
```

## Risks / Trade-offs

- [Risk] 客户端正则意图分类可能不够准确 → Intent 检测始终允许用户显式指定（"用面试教练模式"），且用户可在 UI 看到当前 Agent 并可手动切换
- [Risk] 子 Agent 间上下文传递可能丢失关键信息 → Shared Memory 作为中间层，所有 Agent 写入关键发现，后续 Agent 可读取
- [Risk] 注册中心可能膨胀 → 严格限制首批只有 4 个 Agent，新增 Agent 必须有明确的用户场景
- [Trade-off] 不做 Agent 间链式调用（Interview Agent 调用 Eval Agent） → V1 接受此限制，用户可通过自然语言切换
- [Trade-off] 不引入 LangGraph → 初期更灵活，但状态管理需要自己维护。如果后续复杂度超出预期，可以在 V2 引入
