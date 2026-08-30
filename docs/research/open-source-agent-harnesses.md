# 开源 Agent Harness 与状态 UI 研究

日期：2026-08-26
目的：为纸鸢 Agent 的「内部事件不泄漏、流式消息不出空泡、状态可理解、UI 可升级」提供一手源码依据。

本文只引用官方 GitHub 仓库、仓库内源码/协议/许可证。代码链接均固定到研究时的 commit；“DeepSeek harness”在本文中指官方仓库 `deepseek-ai/deepseek-harness`（简称 DSH），不是 DeepSeek 模型 API 的普通调用示例。

## 结论先行

三个项目解决的是不同层面的问题，不能用一个组件替代另一个：

| 项目 | 最值得借鉴的部分 | 对纸鸢的直接含义 |
| --- | --- | --- |
| OpenAI Codex | 把 `turn / item / notification` 做成显式协议；流式增量和最终 item 分离；UI 自己决定哪些事件落到 transcript | 不要把所有 SSE 事件都转成 `role: tool` 或 `role: assistant` 消息；先做事件归类，再做用户视图投影 |
| DeepSeek Harness | durable session event → conversation node → UI slot 的三层投影；节点可以是 `hidden`，没有可见内容时不渲染；工具通过 provider-neutral 的 `presentCall/presentResult` 提供安全 UI 意图 | 工具内部结果、Skill 指令和原始参数不能直接进入聊天；应由 UI-safe projection 产生摘要/卡片 |
| thinking-orbs | 以语义状态而非“正在加载”驱动视觉；Canvas、共享时钟、可见性暂停、reduced-motion、ARIA | 用 `working/searching/solving/...` 等少量稳定状态替换散乱的文字提示；状态组件只展示状态，不展示内部 prompt/result |

推荐的纸鸢边界：

```text
Runtime event log (internal, durable)
        │  audience + schema validation
        ├── model context / evidence (never rendered directly)
        ├── user-safe progress state (orb + short label)
        └── user-visible message/artifact (assistant text or structured card)
```

现有代码中 `src/app/agent/page.tsx` 仍有“有 `uiPayload` 则卡片、否则回退到 `event.result` 文本”的逻辑（约 1662-1705 行）。这正是需要收紧的边界：没有安全投影时应显示统一降级状态，而不是原始工具/Skill 文本。

## 固定版本与许可证

| 项目 | 官方仓库 | 固定 commit | 许可证证据 |
| --- | --- | --- | --- |
| Codex | [openai/codex](https://github.com/openai/codex) | `a26f1806a4f4b8cfec2ea1be129963815a61e58c` | [LICENSE](https://github.com/openai/codex/blob/a26f1806a4f4b8cfec2ea1be129963815a61e58c/LICENSE) Apache-2.0；[NOTICE](https://github.com/openai/codex/blob/a26f1806a4f4b8cfec2ea1be129963815a61e58c/NOTICE) 另列 Ratatui MIT 来源 |
| DeepSeek Harness | [deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness) | `b150a551b8d465e31e418e1b2eaf5e79bbb7d28e` | [LICENSE](https://github.com/deepseek-ai/deepseek-harness/blob/b150a551b8d465e31e418e1b2eaf5e79bbb7d28e/LICENSE) MIT |
| thinking-orbs | [Jakubantalik/thinking-orbs](https://github.com/Jakubantalik/thinking-orbs) | `de85557ca220332586d070d8788c0e1d6e877a0d` | [LICENSE](https://github.com/Jakubantalik/thinking-orbs/blob/de85557ca220332586d070d8788c0e1d6e877a0d/LICENSE) MIT；`package.json` 为 `thinking-orbs` 0.3.1 |

许可证边界：

- 可以在满足许可证条件的前提下复用 Codex/DSH/thinking-orbs 的代码或实现思路。Codex 的 Apache-2.0 要求保留许可证、版权/NOTICE，并对修改文件作显著修改说明；不能把 OpenAI/Codex 名称当作纸鸢品牌授权。
- DSH 与 thinking-orbs 的 MIT 允许复制、修改、商用，但分发副本/实质代码仍应保留版权和许可文本。
- 本项目优先采用“借鉴协议/模式、依赖包复用视觉组件、重写业务投影”的方式。只有确实复制源码时，才在项目的第三方声明中加入对应许可证和来源 commit；不要把整套 DSH/Codex 代码直接搬入生产目录。

## OpenAI Codex：协议分层与空内容处理

### 1. 显式的 Thread Item 类型

Codex app-server v2 把用户消息、Agent 消息、Plan、Reasoning、命令执行、文件变更、MCP Tool、Dynamic Tool、协作 Agent 等定义为不同的 `ThreadItem`，而不是都当作聊天文本。见：

- [`codex-rs/app-server-protocol/src/protocol/v2/item.rs`](https://github.com/openai/codex/blob/a26f1806a4f4b8cfec2ea1be129963815a61e58c/codex-rs/app-server-protocol/src/protocol/v2/item.rs#L226-L434)
- [生成的 `ItemStartedNotification` schema](https://github.com/openai/codex/blob/a26f1806a4f4b8cfec2ea1be129963815a61e58c/codex-rs/app-server-protocol/schema/json/v2/ItemStartedNotification.json)
- [生成的 `TurnCompletedNotification` schema](https://github.com/openai/codex/blob/a26f1806a4f4b8cfec2ea1be129963815a61e58c/codex-rs/app-server-protocol/schema/json/v2/TurnCompletedNotification.json)

这提供了一个关键原则：**事件类型决定可见性和渲染组件，不能由通用消息组件猜测**。工具参数/结果属于 Tool item，最终回答属于 AgentMessage，Reasoning 是独立 item；它们可以共享 turn，但不能共享一个“万能气泡”渲染器。

### 2. 增量事件与完成事件分离

协议分别定义 `AgentMessageDeltaNotification`、`ReasoningSummaryTextDeltaNotification`、`ReasoningTextDeltaNotification`，并以 `ItemStarted`/`ItemCompleted` 和 `TurnCompleted` 结束生命周期：

- [`event_mapping.rs`](https://github.com/openai/codex/blob/a26f1806a4f4b8cfec2ea1be129963815a61e58c/codex-rs/app-server-protocol/src/protocol/event_mapping.rs#L1-L220)
- [`AgentMessageDeltaNotification.json`](https://github.com/openai/codex/blob/a26f1806a4f4b8cfec2ea1be129963815a61e58c/codex-rs/app-server-protocol/schema/json/v2/AgentMessageDeltaNotification.json)
- [`ReasoningSummaryTextDeltaNotification.json`](https://github.com/openai/codex/blob/a26f1806a4f4b8cfec2ea1be129963815a61e58c/codex-rs/app-server-protocol/schema/json/v2/ReasoningSummaryTextDeltaNotification.json)
- [`ReasoningTextDeltaNotification.json`](https://github.com/openai/codex/blob/a26f1806a4f4b8cfec2ea1be129963815a61e58c/codex-rs/app-server-protocol/schema/json/v2/ReasoningTextDeltaNotification.json)

TUI 处理器也按事件分流：Agent message delta 更新回答流，Plan delta 更新计划，Reasoning summary 更新可见摘要，而 raw reasoning 只有在显式配置 `show_raw_agent_reasoning` 时才处理：

- [`codex-rs/tui/src/chatwidget/protocol.rs`](https://github.com/openai/codex/blob/a26f1806a4f4b8cfec2ea1be129963815a61e58c/codex-rs/tui/src/chatwidget/protocol.rs#L72-L105)

对纸鸢的启示是：`thinking_content` 不应默认写入 `messages`。它应进入短生命周期的 status store，或者进入独立的可折叠 reasoning item；只有经过 policy 的摘要才允许进入用户 transcript。

### 3. 空流、空泡和流尾是显式处理的

Codex 在完成 AgentMessage 时只有非空 message 才补进流；最终可见 Markdown 为空时，不记录最终 Agent Markdown。流式尾部若没有可渲染行，会清除 active tail，而不是留下空 cell：

- [`codex-rs/tui/src/chatwidget/streaming.rs`](https://github.com/openai/codex/blob/a26f1806a4f4b8cfec2ea1be129963815a61e58c/codex-rs/tui/src/chatwidget/streaming.rs#L127-L139)
- 同文件的完成投影和可见性判断：[L314-L339](https://github.com/openai/codex/blob/a26f1806a4f4b8cfec2ea1be129963815a61e58c/codex-rs/tui/src/chatwidget/streaming.rs#L314-L339)、[L451-L465](https://github.com/openai/codex/blob/a26f1806a4f4b8cfec2ea1be129963815a61e58c/codex-rs/tui/src/chatwidget/streaming.rs#L451-L465)、[L507-L575](https://github.com/openai/codex/blob/a26f1806a4f4b8cfec2ea1be129963815a61e58c/codex-rs/tui/src/chatwidget/streaming.rs#L507-L575)

这正对应纸鸢的“空气泡”问题。应当把以下规则放到共享投影层，而不是每个 JSX 分支临时判断：

```text
trimmed assistant text === ''
  && no visible artifact
  && no user action required
  => do not create/update a visible assistant bubble
```

### 4. 可复用的交互模式

- `TurnStatus` 是 `completed / interrupted / failed / inProgress`，适合映射纸鸢的运行状态，而不是把“加载中”当成消息文本：[`turn.rs`](https://github.com/openai/codex/blob/a26f1806a4f4b8cfec2ea1be129963815a61e58c/codex-rs/app-server-protocol/src/protocol/v2/turn.rs#L1-L80)。
- Reasoning 是独立可折叠行；TUI 只在配置允许时消费 raw reasoning，默认消费摘要：[`protocol.rs`](https://github.com/openai/codex/blob/a26f1806a4f4b8cfec2ea1be129963815a61e58c/codex-rs/tui/src/chatwidget/protocol.rs#L78-L92)。
- `ThreadItem` 有 `itemsView: notLoaded / summary / full`，说明历史/调试详情应有不同数据视图，不能把完整原始 payload 默认下发到聊天 UI：[`TurnItemsView` schema](https://github.com/openai/codex/blob/a26f1806a4f4b8cfec2ea1be129963815a61e58c/codex-rs/app-server-protocol/schema/json/v2/TurnCompletedNotification.json#L3900-L3940)。

Codex 的这些能力主要来自协议和 Rust TUI，不是一个可直接安装到 Next.js 的 React 组件。纸鸢应抄“事件/投影边界”和空内容规则，不能把 Rust TUI 结构当作前端组件架构。

## DeepSeek Harness：从 durable event 到安全 UI node

### 1. 三层投影：事件、Conversation Node、UI Slot

DSH 的核心注释明确：`ConversationSnapshot / ConversationNode` 是逻辑层提供给 UI 的唯一数据形状。Conversation assembler 根据 Definition 匹配事件、保存状态、构造 view node；如果节点当前不可见，可以返回 `null` 或带 `visibility: hidden` 的 node：

- [`packages/client/runtime/src/client/sessions/conversation.ts`](https://github.com/deepseek-ai/deepseek-harness/blob/b150a551b8d465e31e418e1b2eaf5e79bbb7d28e/packages/client/runtime/src/client/sessions/conversation.ts#L1-L20)
- [`packages/client/runtime/src/client/conversation/event-registry.ts`](https://github.com/deepseek-ai/deepseek-harness/blob/b150a551b8d465e31e418e1b2eaf5e79bbb7d28e/packages/client/runtime/src/client/conversation/event-registry.ts#L1-L65)
- [`packages/client/runtime/src/client/sessions/conversation-assembler.ts`](https://github.com/deepseek-ai/deepseek-harness/blob/b150a551b8d465e31e418e1b2eaf5e79bbb7d28e/packages/client/runtime/src/client/sessions/conversation-assembler.ts#L267-L310)
- [`packages/client/ui-conversation/src/client/chat/ChatNodeSeat.tsx`](https://github.com/deepseek-ai/deepseek-harness/blob/b150a551b8d465e31e418e1b2eaf5e79bbb7d28e/packages/client/ui-conversation/src/client/chat/ChatNodeSeat.tsx#L18-L58)

这层隔离是解决“Skill 内部文本全量出现在聊天”的最直接模式：Skill/Tool event 先进入 runtime state；只有注册的 conversation Definition 才能把它变成用户可见节点。未注册/不安全的内部事件不应直接走 fallback message。

### 2. Assistant node 只有可见内容才 materialize

DSH 的 Assistant Definition 用 `hasVisibleContent` 判断：tool-call block 不算可见正文，text/reasoning 需要 `trim() !== ''`；构建 view node 时，未 settle 且没有 visible content 的状态只有在已有 hidden node 时才保留，否则返回 `null`。可见性通过 `visibility: 'visible' | 'hidden'` 传给 UI：

- [`packages/client/ui-conversation/src/client/conversation-nodes/assistant.ts`](https://github.com/deepseek-ai/deepseek-harness/blob/b150a551b8d465e31e418e1b2eaf5e79bbb7d28e/packages/client/ui-conversation/src/client/conversation-nodes/assistant.ts#L53-L70)
- 同文件的 node projection：[L217-L241](https://github.com/deepseek-ai/deepseek-harness/blob/b150a551b8d465e31e418e1b2eaf5e79bbb7d28e/packages/client/ui-conversation/src/client/conversation-nodes/assistant.ts#L217-L241)、[L297-L308](https://github.com/deepseek-ai/deepseek-harness/blob/b150a551b8d465e31e418e1b2eaf5e79bbb7d28e/packages/client/ui-conversation/src/client/conversation-nodes/assistant.ts#L297-L308)

这比在 `MessageBubble` 里写 `if (!content) return null` 更稳：它在消息形成之前就阻止空 node 进入排序、间距、动画和持久化投影，能避免空泡、分隔线和“只剩工具调用却有 Assistant 标题”的组合缺陷。

### 3. Reasoning、工具调用、正文使用不同组件

`AssistantMarkdown` 明确将工具调用头交给 ChatView 的 tool-row grouping；若一个 assistant node 只有 tool-call heads 或为空，则不绘制 assistant shell。Reasoning 使用独立的 `ReasoningRow` disclosure，运行时只展示最新一行摘要，展开后才显示完整 reasoning：

- [`AssistantMarkdown.tsx`](https://github.com/deepseek-ai/deepseek-harness/blob/b150a551b8d465e31e418e1b2eaf5e79bbb7d28e/packages/client/ui-conversation/src/client/chat/AssistantMarkdown.tsx#L1-L30)
- [`AssistantMarkdown.tsx` 的空 shell 判断与 block 分流](https://github.com/deepseek-ai/deepseek-harness/blob/b150a551b8d465e31e418e1b2eaf5e79bbb7d28e/packages/client/ui-conversation/src/client/chat/AssistantMarkdown.tsx#L35-L115)
- [`ReasoningRow.tsx`](https://github.com/deepseek-ai/deepseek-harness/blob/b150a551b8d465e31e418e1b2eaf5e79bbb7d28e/packages/client/ui-conversation/src/client/chat/ReasoningRow.tsx#L1-L72)

对纸鸢的对应设计：

- `assistant/text`：正常 Markdown 气泡或结果摘要；
- `agent/progress`：ThinkingOrb + 一行状态，不进入 message list；
- `tool/call`：工具状态行/卡片，不显示内部参数全文；
- `tool/result`：仅使用 `uiPayload` 的安全字段渲染结构化卡片；
- `skill/load`：只产生“已启用某能力”状态，绝不把 Skill body 当 assistant content；
- `reasoning`：默认短摘要，可选择展开；原始 reasoning/提示词仅进入受控调试面板。

### 4. 工具 Presentation Intent：把模型结果和 UI 结果分离

DSH 在 `@deepseek-ai/dsh-tools` 中定义 provider-neutral `ToolCallView`/`ToolResultView`。工具可以声明 generic、terminal、diff、search、read、web 等 UI intent，并携带标题、路径、摘要、截断标记、退出码等结构化字段；UI 不需要解析模型文本猜测工具类型：

- [`packages/core/tools/src/presentation.ts`](https://github.com/deepseek-ai/deepseek-harness/blob/b150a551b8d465e31e418e1b2eaf5e79bbb7d28e/packages/core/tools/src/presentation.ts#L1-L125)
- `ToolResultView` 及各 card 类型：[L120-L190](https://github.com/deepseek-ai/deepseek-harness/blob/b150a551b8d465e31e418e1b2eaf5e79bbb7d28e/packages/core/tools/src/presentation.ts#L120-L190)

但 DSH 的 generic view 注释仍允许“没有 presentation 时渲染 raw result content”。这对开发者工具可接受，对纸鸢的 Skill/业务工具不够安全。纸鸢应采用更严格的变体：

```ts
type UserSafeToolView =
  | { kind: 'progress'; label: string; state: ToolState }
  | { kind: 'card'; card: SafeCardPayload }
  | { kind: 'error'; message: string; recoverable: boolean }
  | { kind: 'silent'; reason: 'internal' | 'no_user_value' }
```

缺少 `UserSafeToolView` 时显示统一的“已完成后台步骤”或不显示，而不是 fallback 到 `result`、`data`、Skill markdown 或原始 JSON。

### 5. DSH 对长期稳定交互的启示

DSH 的 archived Agent Notes 记录了几种已落地的稳定化手段，虽然它们是 TUI/Web 具体实现，仍可作为验收标准：

- 工具卡使用固定 `Tool / <name>` 状态头，详情放进可折叠 body，不把标题、参数和状态挤在一个气泡中：[tool-card-header](https://github.com/deepseek-ai/deepseek-harness/blob/b150a551b8d465e31e418e1b2eaf5e79bbb7d28e/.agents/notes/archived/feature/2026-07-27-tui-tool-card-header.md)。
- 工具卡、上下文卡、助手步骤拥有独立隐藏/折叠策略；hidden mode 下一个 turn 只保留一个 assistant header：[consolidated TUI presentation](https://github.com/deepseek-ai/deepseek-harness/blob/b150a551b8d465e31e418e1b2eaf5e79bbb7d28e/.agents/notes/archived/architecture/2026-07-28-consolidated-tui-presentation.md)、[hidden assistant fold](https://github.com/deepseek-ai/deepseek-harness/blob/b150a551b8d465e31e418e1b2eaf5e79bbb7d28e/.agents/notes/archived/feature/2026-07-29-tui-hidden-mode-assistant-fold.md)。
- 空 session 在历史仍加载时保留 Hero/Composer，避免先显示毛坯空白区再跳变：[blank session note](https://github.com/deepseek-ai/deepseek-harness/blob/b150a551b8d465e31e418e1b2eaf5e79bbb7d28e/.agents/notes/archived/bug-fix/2026-07-31-hero-visible-while-blank-session-opens.md)。
- 持久化 `assistant/chunk` 是单一事实源，删除重复 live mirror，避免两个流让 UI 重复插入消息：[remove stream chunk mirror](https://github.com/deepseek-ai/deepseek-harness/blob/b150a551b8d465e31e418e1b2eaf5e79bbb7d28e/.agents/notes/archived/simplification/2026-07-02-remove-stream-chunk-mirror.md)。

这些模式都指向同一个修复方向：**不要让消息组件同时承担事件接收、工具解释、状态动画和历史持久化。**

## thinking-orbs：语义状态视觉化

### 1. 状态不是一个 spinner

`ThinkingOrb` 提供九个语义 state：`working`、`searching`、`solving`、`listening`、`connecting`、`weaving`、`composing`、`breathing`、`shaping`，每个 state 映射到不同的动画模式；组件的 `aria-label` 也按 state 提供默认文案：

- [`README.md`](https://github.com/Jakubantalik/thinking-orbs/blob/de85557ca220332586d070d8788c0e1d6e877a0d/README.md#states)
- [`src/ThinkingOrb.tsx`](https://github.com/Jakubantalik/thinking-orbs/blob/de85557ca220332586d070d8788c0e1d6e877a0d/src/ThinkingOrb.tsx#L10-L33)
- [机器可读状态规范](https://github.com/Jakubantalik/thinking-orbs/blob/de85557ca220332586d070d8788c0e1d6e877a0d/spec/orbs-spec.json#L1-L80)

纸鸢不需要暴露九个状态给用户。建议先收敛为：

| 纸鸢运行语义 | Orb state | 用户短文案 |
| --- | --- | --- |
| understanding / analyzing | `solving` | 正在理解你的目标 |
| searching / fetching | `searching` | 正在查找相关信息 |
| tool execution | `working` | 正在处理材料 |
| verifying / read-back | `connecting` | 正在核对结果 |
| waiting user / approval | `listening` | 等你确认下一步 |
| completed / failed | 不显示 orb | 显示结果或可恢复错误 |

映射表是产品协议的一部分；不要把工具名或 Skill 名直接作为视觉状态名。

### 2. 轻量实现和无障碍边界

组件使用普通 2D Canvas，不依赖 WebGL/filter；DPR 上限为 2；`prefers-reduced-motion` 下绘制确定性的静态帧；离屏由 `IntersectionObserver` 暂停，tab 隐藏由 `visibilitychange` 暂停；canvas 使用 `role="img"` 和默认/自定义 `aria-label`：

- [`src/ThinkingOrb.tsx`](https://github.com/Jakubantalik/thinking-orbs/blob/de85557ca220332586d070d8788c0e1d6e877a0d/src/ThinkingOrb.tsx#L35-L116)
- [`README.md` 的 Accessibility & performance](https://github.com/Jakubantalik/thinking-orbs/blob/de85557ca220332586d070d8788c0e1d6e877a0d/README.md#accessibility--performance)

可以直接安装 MIT 包用于视觉升级，但应把它包在自己的 `AgentActivityIndicator` 中：统一状态枚举、中文文案、尺寸 token、主题和测试，不让业务组件散落 `ThinkingOrb state="..."` 字符串。

## 对纸鸢的具体落地建议

### A. 先定义四类输出，不再让 `AgentMessage[]` 包揽全部

当前 `AgentMessage` 同时承载 assistant 文本、tool result、状态提示和调试数据，是空泡与内部泄漏的根因之一。建议引入逻辑层投影（命名可调整）：

```ts
type AgentSurfaceEvent =
  | { type: 'progress'; phase: AgentPhase; label: string; orbState?: OrbState }
  | { type: 'assistant_delta'; messageId: string; delta: string }
  | { type: 'assistant_final'; messageId: string; content: string; artifacts?: ArtifactRef[] }
  | { type: 'tool_status'; callId: string; name: string; state: ToolState; label: string }
  | { type: 'tool_card'; callId: string; view: UserSafeToolView }
  | { type: 'approval'; requestId: string; summary: string }
  | { type: 'run_error'; message: string; recoverable: boolean }
```

规则：

1. `progress/tool_status` 进入 activity store，不生成聊天气泡。
2. `assistant_delta` 只更新同一个 `messageId` 的流式 shell；delta 全为空或最终正文为空时销毁 shell。
3. `tool_card` 只接受经过 schema 校验的 `UserSafeToolView`；`rawData` 只进 evidence/admin store。
4. `approval` 是用户操作节点，不要伪装成 assistant 文本。
5. `run_error` 使用安全摘要，内部错误/提示词进入服务端日志或管理员证据。

### B. 工具/Skill 三管线应改成四管线

已有方向是 `llmSummary + uiPayload + rawData`。结合 DSH 和 Codex，建议再显式加入受众和渲染策略：

```ts
{
  llmSummary: string,        // 回给模型，可能含执行细节
  uiPayload: SafeCardPayload | null,
  rawData: unknown,          // evidence/admin only
  visibility: 'silent' | 'progress' | 'card' | 'assistant',
  safeFallback: string        // 没有卡片时的用户文案
}
```

`visibility` 由工具合同声明，不能由页面根据 `result` 是否为空猜测。Skill body、系统 prompt、工具参数、内部 `data` 默认 `silent`；需要展示的字段必须白名单映射到 `uiPayload`。

### C. 空泡验收规则

为每条流式链路增加确定性测试：

- 只有 `phase/tool_call`，没有正文：不产生 assistant bubble，只显示 Orb/工具状态。
- 只有 tool-call heads，最终无可见内容：不产生空 assistant shell。
- `text` delta 全是空白/控制标记：不插入或持久化可见消息。
- 流中断后已有正文：保留正文并加 interrupted 状态；没有正文：显示单一错误/重试状态，不显示空泡。
- Skill load 返回长内部 markdown：聊天只显示短状态，原文不可通过普通用户 DOM/网络 response projection 读取。
- tool result 没有 `uiPayload`：显示安全 fallback 或静默，禁止 `event.result` 直出。

### D. UI 升级的最小垂直切片

用户选择 React + Ant Design 方向时，建议先只改 `/agent`：

1. 用 AntD `Card/Tag/Progress/Alert/Drawer/Modal` 做状态、审批、结果详情基础件；保留纸鸢暖色 token，不套默认 AntD 蓝色主题。
2. 用 `thinking-orbs` 或等价封装替换纯文字 `thinkingContent`/长状态条。
3. 将工具卡统一为“状态头 + 安全摘要 + 可展开结构化详情”，原始 JSON 放受控 Debug Drawer。
4. 让 transcript 只渲染 `assistant_final` 和 `tool_card`，activity store 单独渲染 Orb/进行中步骤。
5. 用 React Testing Library/Playwright 对空泡、Skill 泄漏、工具无 payload、刷新恢复和中断续接做协议级 E2E；视觉快照只作为辅助，不替代 DOM 可见性断言。

## 不应直接照搬的部分

- Codex raw reasoning 开关面向开发者/TUI，不代表普通用户应该看到模型内部思考或系统提示词。
- DSH generic card 的 raw-result fallback 适合通用开发者 harness；纸鸢处理简历/JD/Offer 时必须 fail-closed，避免内部数据泄漏。
- `thinking-orbs` 是视觉状态组件，不是 Agent 状态机；它不能决定 run 是否完成，也不能代替 durable runtime event。
- “一个 turn 一个 assistant header”是展示折叠策略，不应修改纸鸢的 durable message 或模型上下文。
- 许可证允许复用不等于可以抹掉来源；复制 Codex/DSH/thinking-orbs 的实质代码时必须保留对应许可证/版权/NOTICE，并记录来源 commit。

## 建议的下一步顺序

1. 先在服务端定义 `AgentSurfaceEvent` 和 `UserSafeToolView` schema，并在 SSE/持久化边界校验。
2. 再把 `/agent` 从 `event.result` fallback 改成安全投影，补齐上述空泡/泄漏回归测试。
3. 把 activity store 与 transcript store 分开，接入 `AgentActivityIndicator`（Orb 状态映射）。
4. 最后引入 AntD 基础件和结果卡视觉规范；不要先做全站组件替换。
