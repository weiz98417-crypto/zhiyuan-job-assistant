## Context

`agent-unified-memory` 阶段建好了完整的基础设施：三层 Memory、Tool Registry（9 工具）、Knowledge Base（4 份结构化知识）、Context Assembler（System Prompt 分层 + 1h 缓存）、Preference 学习闭环。当前 `/explore` 独立存在，有自己的 chat stream route 和独立的 System Prompt，与 Agent 基础设施隔离。现在要把这两者合并为一个统一的 Agent 对话页。

约束：(1) DexieDB 本地持久化，(2) DeepSeek API LLM 调用，(3) 浏览器端按需推理，(4) 不可变数据模式。

## Goals / Non-Goals

**Goals:**
- 创建 `/agent` 页面，双 Tab（探索 / 执行）
- 迁移 explore 聊天 → Agent Memory（DexieDB Interaction 表）
- 统一 System Prompt 出口（context assembler）
- 执行 Tab 支持工具调用 + 结果渲染
- 两个 Tab 间共享聊天流 + Memory，纸鸢感知完整对话上下文
- 旧的 `/explore` redirect 到 `/agent?tab=explore`
- chat stream 路由复用 context assembler 的 prompt

**Non-Goals:**
- 不做流式工具调用（tool 调用走请求-响应，不在 SSE 中 call）
- 不做文件上传/图片识别
- 不做语音输入
- 不做第三方 Agent 集成（如 GitHub Copilot）
- 不引入新的外部依赖

## Decisions

### 1. 消息模型升级

旧的 Message 只有 `{ role, content }`。执行模式需要表示工具调用：

```typescript
interface AgentMessage {
  role: "user" | "assistant" | "tool";
  content: string;
  toolName?: string;
  toolResult?: string;      // tool 消息的返回结果
  mode: "explore" | "execute"; // 诞生于哪个模式
  timestamp: Date;
}
```

**为什么不沿用 Message 加 optional fields？** Message 是 explore 专用类型，加了 tool 字段会让探索 tab 的渲染逻辑复杂化。AgentMessage 是 agent 页的内部类型，与现有 Message 解耦。

### 2. Tab 共享聊天流

```
┌──────────────────────────────────────────┐
│  /agent                                  │
│                                          │
│  ┌──────────────────────────────────────┐ │
│  │ [探索] [执行]                        │ │ ← Tab 切换
│  ├──────────────────────────────────────┤ │
│  │                                      │ │
│  │   共享 messages 数组                 │ │ ← 同一个聊天流
│  │   探索发的消息执行可见，反之亦然     │ │
│  │                                      │ │
│  │   纸鸢：上次你聊到...               │ │ ← Memory 连续
│  │                                      │ │
│  ├──────────────────────────────────────┤ │
│  │  [输入框]                      [发送] │ │ ← 总是可见
│  │  [总结] [切换模式]                  │ │ ← 探索 tab 特有
│  └──────────────────────────────────────┘ │
└──────────────────────────────────────────┘
```

**为什么不分成两个独立聊天？** 用户可能在探索中聊到"帮我看下合适的岗位"，这时候切到执行 tab，纸鸢应该记得上面聊了什么，直接调 `get_recommendations`。两个独立 session 做不到这个。

**但工具调用结果只在执行 tab 可见吗？** 是的。探索 tab 的渲染器忽略 tool 消息；执行 tab 的渲染器展示 tool 卡片。但消息本身都在 messages 数组里。

### 3. 统一 Chat Stream 路由

新增 `/api/agent/chat` 替代 `/api/chat/stream`：

```
旧: /api/chat/stream → 硬编码 SYSTEM_PROMPT + DeepSeek stream
新: /api/agent/chat  → 调用 assembleContext(scenario) → DeepSeek stream
```

两种模式的行为差异：
- 探索模式：只发 user message，无工具列表，temperature 0.7
- 执行模式：system prompt 含工具描述，LLM 可返回 `<<TOOL>>name\n{params}\n<</TOOL>>` 标记，客户端执行后继续对话

**工具调用的协议**：执行模式下 LLM 可以输出：
```
<<TOOL>>search_applications
{"status": "applied", "limit": 5}
<</TOOL>>
```

客户端解析到 `<<TOOL>>` 后：
1. 暂停流解析
2. 执行工具 → 拿到结果
3. 把 `toolName` + `toolResult` 作为新 message 追加到上下文
4. 继续下一轮 LLM 调用（不带 stream，返回最终结果）

简化版：不处理多轮 tool chain。检测到 tool call → 执行 → 把结果发回 LLM 生成最终回复。单次最多一个 tool call。

### 4. 探索模式保持"轻"

探索 tab 的 system prompt 不含工具列表，不含行业知识（保留探索框架）。关键：
- System Prompt = Base Persona + EXPLORE_MODE_OVERLAY（同 context.ts 现有逻辑）
- 无工具注入
- 无知识注入（用户可能在探索阶段不需要被数据"压"）
- 聊天记录存入 AgentInteraction（source="explore"）
- 总结功能保留，写入 CareerProfile + AgentPreferenceModel（现有 `agent-unified-memory` 链路）

### 5. localStorage → DexieDB 迁移策略

| 数据 | 旧位置 | 新位置 | 迁移策略 |
|------|--------|--------|---------|
| 探索聊天历史 | localStorage `lingji-explore-chat` | DexieDB `agentInteractions` | 首次加载 /agent 时检测 localStorage 有数据 → 批量导入 DexieDB → 清除 localStorage key |
| 画像 | localStorage `lingji-ai-profile` | DexieDB `profiles` | 已在 `agent-unified-memory` 中打通，/agent 只读 DexieDB |
| 总结结果 | localStorage `lingji-explore-chat.profile` | DexieDB profiles + agentPreferences | 同上 |

迁移是渐进式：首次加载检测旧数据，导入后清除。不会丢失。

### 6. 路由策略

- 新建 `/agent` 页面，默认 tab=explore
- `/explore` → 301 redirect（Next.js `permanentRedirect`）到 `/agent?tab=explore`
- AppShell 侧边栏 "需求探索" → 改名为 "AI Agent"，链接 `/agent`
- 仪表盘上所有指向 explore 的链接改为 `/agent`

### 7. SSE 事件 → UI Phase 映射

API 路由发送类型化的 SSE 事件，客户端解析后驱动 UI 状态机：

```
SSE 事件                               UI 状态转换
────────────────────────────────────────────────────────
phase: "thinking"          →  assistant bubble 显示 ThinkingDots
phase: "executing"         →  assistant bubble 显示执行指示器（工具名 + spinner）
tool_call {name, params}   →  记录工具名，展示 "正在执行：{tool_name}"
tool_result {name, result} →  插入 tool 消息卡片到消息列表
phase: "responding"        →  assistant bubble 开始逐字流式输出
text {content}             →  追加到 streamContentRef，rAF 驱动渲染
done                       →  结束流，清理 abortRef
```

**三种 Phase 的视觉状态：**

| Phase | 视觉 | 作用 |
|-------|------|------|
| `thinking` | 三个弹跳圆点 + "思考中" | 模型正在推理，还没决定是否调工具 |
| `executing` | 旋转图标 + 工具名 + "执行中" | 工具正在运行，用户知道在做什么 |
| `responding` | 流式文本 + 闪烁光标 | 最终回复，逐字输出 |

**探索模式 vs 执行模式的差异：**

| | 探索模式 | 执行模式 |
|---|---|---|
| thinking phase | ✅ 短暂出现（模型直接回复） | ✅ 可能较长（决定是否调工具） |
| executing phase | ❌ 不出现（无工具） | ✅ 出现（当 LLM 决定调工具时） |
| responding phase | ✅ 流式输出 | ✅ 工具执行后流式输出 |

### 8. 客户端 SSE 解析策略

使用 buffer + split 策略解析 SSE 流：

```
收到的字节流 → TextDecoder.decode(stream:true)
  → 追加到 buffer
  → 按 \n\n 分割（SSE 事件分隔符）
  → 最后一个不完整片段留在 buffer
  → 每个完整片段：去掉 "data: " 前缀 → JSON.parse → dispatch
```

**为什么不逐行解析？** SSE 规范用 `\n\n` 作为事件边界。单行可能被 TCP 帧切分，用 buffer 累积 + split 是标准做法。

**为什么继续用 ref + rAF 而非直接 setState？** React 18 在 async 循环内批量合并 setState，导致所有 text 事件在一次渲染中更新，失去流式效果。ref 写在 React 视线之外，rAF 以 60fps 同步，保证逐字渲染。

### 9. System Prompt 结构化（SKILL.md 模式）

将硬编码的 System Prompt 字符串重构为独立的 `.md` skill 文件，每个 Mode 一个 skill：

```
skills/
├── zhiyuan-explore.md    → 探索模式
└── zhiyuan-execute.md    → 执行模式（含 Tool Decision Matrix）
```

**为什么是 `.md` 而不是 `.ts`？**

| 方案 | V4.0 多 Agent | 热更新 | 非技术人员可编辑 |
|------|:---:|:---:|:---:|
| `.ts` export const | ❌ 绑定 Next.js | ❌ 需重新构建 | ❌ |
| `.md` 文件 | ✅ 任何 runtime 读取 | ✅ 替换文件即生效 | ✅ |

V4.0 多 Agent 系统中，不同 agent（求职顾问、简历优化师、面试教练）各自加载不同的 skill 文件。`.md` 格式让 skill 成为**独立于运行时的资产**，和 Claude Code 自身的 SKILL.md 同构。

**Skill 文件结构（与 Claude Code SKILL.md 对齐）：**

```markdown
---
name: zhiyuan-explore
description: 纸鸢探索模式 — 以朋友身份帮用户理清职业方向
---

## Stance
...

## Steps
### Step 1: ...
### Step 2: ...

## Guardrails
...

## Transitions
...

## Output
...
```

**加载策略：** Next.js API Route 中 `fs.readFileSync` + 模块级缓存（首次加载后常驻内存），无 I/O 开销。

**Decision Matrix（仅 execute skill）：** 查表映射用户意图 → 工具名，减少 LLM 误判。

## Risks / Trade-offs

- [工具调用让延迟变高] 执行模式下如果 LLM 决定调工具，用户等待时间 = LLM 响应 + 工具执行 + 二次 LLM 调用 → 工具执行走本地 DexieDB（<10ms）不构成瓶颈，整体延迟增加 <1s
- [探索 Tab "变重"] 合并后探索 tab 的聊天可能与执行 tab 的 tool 消息混在一起 → 探索模式渲染器忽略 tool 消息，视觉上不受影响
- [localStorage 迁移失败] 用户浏览器清理策略不同，旧数据可能已丢失 → 迁移是 best-effort，失败不阻塞 Agent 功能
- [Agent 页首次加载慢] context assembler 并行查询 4 个数据源 → 已缓存 1h，后续加载 <100ms

## Open Questions

- 执行模式要不要建议引导语（比如 "接下来想做什么？"）？→ 建议做，但暂不在此 change 中
- 工具调用是否支持多轮 chain（调 tool A → 基于结果调 tool B）？→ 暂不支持，单次最多一个 tool call
