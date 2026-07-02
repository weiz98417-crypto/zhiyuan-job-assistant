# 纸鸢求职助手 Agent Chat、会话状态与前端呈现系统的产品构造

纸鸢求职助手的 Agent Chat，不是一个普通聊天框。它是整个 AI 求职助手的运行前台：用户在这里发起 JD 评估、简历查询、简历修改、画像更新、面试准备、Offer 评估、文件导出等任务；系统在这里展示模型回答、工具调用、流式状态、工具卡片、会话列表、跨页面任务入口和安全提示。

所以 `AgentChat总入口`、`Agent会话管理`、`跨页面Agent状态保持`、`前端可读性与工具卡片` 不应该拆成四个独立系统。它们共同组成一条产品链路：用户在 Agent 页面发起任务，前端把消息、图片、会话、任务锁、SSE 事件和工具结果组织成一个可继续的求职工作流。

## 1. 产品定位

Agent Chat 的核心产品目标是：把复杂的 AI 任务变成用户可理解、可中断、可恢复、可验证的前端体验。

它要解决的问题包括：

- 用户不需要知道该调用哪个工具，前端负责把消息交给 Agent 运行链路。
- 长任务必须有流式反馈，不能让用户盯着空白页面。
- 工具调用结果要以卡片或结构化信息呈现，而不是只显示一大段 JSON。
- 会话要能保存、切换、删除、置顶和恢复。
- 从 JD 库、Offer 页面、面试入口跳到 Agent 时，要保留目标对象。
- 面试、图片识别、简历提案等长任务要有状态锁，避免用户一句话把任务切飞。
- Markdown、表格、长链接、代码块不能撑破页面。
- Agent 不能在没有工具结果或读回证据时伪造“已完成”。

这使得 Agent Chat 成为纸鸢的 AI 操作台：

```text
用户消息 / 图片 / 页面跳转参数
  -> 当前会话和任务状态
  -> Agent 运行
  -> SSE 事件
  -> 工具结果与卡片
  -> 会话持久化
  -> 后续页面和任务继续读取
```

## 2. 为什么不能只做聊天 UI

如果只做普通聊天 UI，纸鸢的很多产品能力都会变得不可信。

第一，普通聊天没有任务边界。用户问“我现在的简历是什么”和“帮我保存这段简历”是两类完全不同的动作，一个只读，一个高风险写入。前端必须承接任务契约结果，不能只把模型文字展示出来。

第二，普通聊天没有工具证据。JD 评估、Offer 保存、PDF 导出、简历提案都需要工具执行和 read-back。没有工具消息和卡片，用户看不到系统到底有没有真的做事。

第三，普通聊天没有跨页面上下文。用户从 JD 库点击“去 Agent 评估”，Agent 页面要知道 `jdId`，并让工具读取对应 JD，而不是要求用户重新粘贴。

第四，普通聊天没有长期会话状态。面试过程中的问题图、复盘、简历提案、图片澄清，都需要继续当前任务。普通 messages 不足以表达这些状态。

所以当前 Agent Chat 是一个任务前台，不是一个简单聊天窗口。

## 3. 页面入口与代码边界

核心项目事实如下：

| 能力 | 项目文件 | 产品含义 |
|---|---|---|
| Agent 页面 | `src/app/agent/page.tsx` | 承载会话列表、消息发送、SSE 处理、跨页面入口和运行提示 |
| 聊天组件 | `src/components/agent/AgentChat.tsx` | 展示用户消息、助手消息、工具消息、输入区、图片和绑定状态 |
| 会话列表 | `src/components/agent/SessionList.tsx` | 会话搜索、选择、置顶、删除等 |
| Markdown 渲染 | `src/components/MarkdownRenderer.tsx` | 控制表格、代码块、长文本的前端可读性 |
| Agent 上下文 | `src/lib/agent/context.ts` | 组装服务端 Agent 需要的动态上下文 |
| 引导任务状态 | `src/lib/agent/guided-session-state.ts` | 管理当前活跃任务、切换确认、图片澄清等 |
| SSE 事件类型 | `src/lib/agent/loop/types.ts` | 定义前端能收到的 phase、tool、score、done 等事件 |

这些文件共同说明：Agent Chat 的真实边界是“前端运行体验 + 会话状态 + 工具结果呈现”，而不是一个单独的聊天组件。

## 4. 会话结构

Agent 页面围绕 `ChatSession` 工作。一个会话不仅有 messages，还可能带有：

- `agentState`
- `interviewState`
- `guidedSession`
- `memoryDigest`
- 当前 Agent run 信息
- 最近可回滚的简历提案

这意味着会话保存的不只是聊天内容，还保存任务上下文。

例如面试状态会带有 `planSnapshot`，Agent 页面和 `AgentChat.tsx` 会展示 active interview binding，让用户知道当前面试绑定的是哪份 JD、哪份简历、哪家公司和岗位。

这类状态不能被拆到“跨页面状态系统”里单独讲，因为它本来就是 Agent 会话的一部分。

## 5. SSE 事件如何进入前端

`src/lib/agent/loop/types.ts` 定义了 Agent 运行过程中的 SSE 事件。前端会处理多类事件：

| 事件 | 产品含义 |
|---|---|
| `phase` | 告诉用户当前进入哪个执行阶段 |
| `thinking_content` | 展示模型思考中的可见片段 |
| `tool_call` | 工具即将执行 |
| `tool_result` | 工具执行成功并返回结果 |
| `tool_error` | 工具失败 |
| `text` | 助手流式正文 |
| `tool_calls` | 模型请求的工具调用列表 |
| `intent` | 当前路由到哪个 Agent |
| `agent_switch` | Agent 切换 |
| `block_start` / `block_chunk` / `block_done` | JD 评估 A-G 板块流式生成 |
| `score` / `overall_score` | 评分结果 |
| `persist_done` | 报告保存完成并带回读结果 |
| `done` | 本轮结束 |

这些事件让用户看到任务进度，而不是等待一个黑箱回答。

## 6. 工具消息与工具卡片

Agent 页面会把 `tool_result` 事件转成 tool message，并把 `uiPayload`、`data`、`success` 等信息持久化到当前会话。

工具消息的产品价值是：

- 用户能看到系统实际调用了什么工具。
- 前端可以按 `uiPayload.type` 展示不同卡片。
- 后续会话恢复时仍能看到工具结果。
- 任务契约可以根据工具结果判断能不能声称完成。

例如：

- JD 评估工具返回报告编号、公司、岗位、分数和 read-back 信息。
- Offer 评估工具返回报告编号、Offer 编号、评分、结论和红旗。
- 文件导出工具返回文件大小、hash、下载地址和 read-back。
- 面试问题生成工具返回问题集合，并更新面试状态。

所以工具卡片不是视觉装饰，而是 AI 产品可信度的证据层。

## 7. 前端可读性

AI 输出经常包含长表格、长链接、代码块、Markdown 列表和中英文混排。如果前端不控制布局，页面会横向溢出，用户甚至看不到输入框。

`MarkdownRenderer.tsx` 对此做了明确处理：

- 外层 `max-w-full overflow-hidden`。
- 表格外层 `overflow-x-auto`。
- 单元格和段落使用 `overflow-wrap:anywhere`。
- 代码块使用横向滚动容器。
- `AgentChat.tsx` 消息区使用 `overflow-y-auto overflow-x-hidden`。
- 消息气泡使用 `max-w-[90%] min-w-0 overflow-hidden`。

`agent-chat-overflow.test.ts` 直接检查这些类名，说明这是一个被回归测试保护的产品问题，不是 CSS 细节。

## 8. 会话列表

`SessionList.tsx` 负责会话选择、搜索和列表呈现。Agent 页面还处理：

- 新建会话。
- 切换会话前保存当前 messages。
- 删除会话后的 undo toast。
- 删除当前会话后切到其他会话或创建新会话。
- 置顶会话。
- 会话标题基于第一条用户消息生成。

这些能力的产品意义是：用户的求职任务是连续的，不能每次打开 Agent 都像新对话。

## 9. 跨页面入口

Agent 页面会读取 URL 参数来承接其他页面的任务。

典型入口包括：

```text
/agent?jdId=...&intent=evaluate
/agent?offerId=...&intent=...
/agent?offerReportId=...&intent=...
```

当 `jdId` 存在时，页面会自动发送类似：

```text
请结合我的简历评估 JD 库里的这份职位。先调用 get_recent_jd_context 读取 jdId=...
```

当 `offerId` 或 `offerReportId` 存在时，页面会把用户带入 Offer 解释、谈判或 HR 问题链路。

这说明“跨页面 Agent 状态保持”不是独立系统，而是 Agent 页面根据 URL、会话和工具上下文进行的任务承接。

## 10. 引导任务状态

`guided-session-state.ts` 用来避免长任务被用户的短回复打断。

它支持的任务类型包括：

- `profile_update`
- `career_positioning_guidance`
- `resume_query`
- `resume_edit`
- `jd_evaluation`
- `offer_evaluation`
- `reference_resume_save`
- `interview_coaching`
- `file_export`

一个 guided session 会记录：

- `taskId`
- `taskType`
- `agentId`
- `status`
- `phase`
- `expectedInput`
- `allowedNextIntents`
- `allowedTools`
- `startedAt`
- `lastUpdatedAt`
- `exitConditions`
- 图片路由和澄清信息

它的产品作用是：当系统正在等待用户补充图片意图、确认保存参考简历、继续面试或完成高风险写入时，下一条用户消息不会被误路由到另一个任务。

## 11. 任务切换确认

如果当前有活跃任务，用户突然说另一个任务，系统不会直接切换。`getGuidedSwitchDecision()` 会判断是否需要确认。

例如：

```text
当前正在做画像定位
用户突然说“评估这张 JD 图”
```

如果图片澄清明确指向 JD 评估，系统可以切换；如果只是模糊表达，就要保持当前任务或要求确认。

这个能力解释了用户之前遇到的“我只是问当前简历，为什么被阻断”的问题：正确的产品边界应该区分只读查询和高风险写入，不能把所有简历相关问题都当成保存动作。

## 12. 面试绑定展示

`AgentChat.tsx` 中有 `InterviewBindingBar`。它根据持久化的面试状态展示当前绑定材料。

产品上，这能避免一个很大的误解：用户在 Agent 里继续面试时，需要知道当前问答还是不是围绕刚才那份 JD 和简历。

测试 `agent-chat-interview-binding.test.ts` 验证了：

- `AgentChat.tsx` 中存在 `InterviewBindingBar`。
- `src/app/agent/page.tsx` 会读取并传递持久化会话状态。

这说明面试绑定不是 UI 彩蛋，而是状态可信的一部分。

## 13. 服务端上下文组装

`src/lib/agent/context.ts` 负责组装 Agent 运行需要的上下文。测试 `agent-context-server.test.ts` 验证了服务端上下文不会使用客户端 profile storage，而是从服务端可用数据源组装：

- recent interactions
- pending decisions
- role preferences
- pipeline summary
- tools prompt

这保证 Agent 在服务端运行时不会依赖浏览器本地状态，从而减少数据错乱和用户隔离风险。

## 14. 用户链路

完整链路如下：

```text
用户进入 /agent 或从其他页面跳转
  -> 页面加载会话列表和当前会话
  -> 用户输入文本或图片
  -> 页面解析当前 guided session / interview state / URL 参数
  -> Agent 运行开始，前端接收 SSE
  -> 工具调用以 tool message 和 uiPayload 写入会话
  -> 任务契约判断是否能声称完成
  -> 会话保存，标题、记忆摘要、任务状态同步更新
  -> 用户后续可继续同一任务或切换会话
```

## 15. 失败模式

| 失败点 | 典型表现 | 正确处理 |
|---|---|---|
| Agent loop 无助手输出也无工具结果 | 空跑 | 标记失败，不能写成完成 |
| 工具失败 | `tool_error` | 在会话里显示失败并保留错误信息 |
| 输出过长 | 页面横向溢出 | MarkdownRenderer 和聊天容器限制宽度 |
| 用户切换会话 | 当前消息丢失 | 切换前保存当前 messages |
| 长任务中途改意图 | 错误调用另一个工具 | guided session 要求确认或保持锁定 |
| 从页面跳转缺少 id | Agent 不知道目标对象 | 要求用户补充，不编造上下文 |
| 面试状态丢失 | 后续追问不知材料 | 使用 interviewState 和绑定栏展示 |

## 16. 测试与证据

相关测试包括：

- `src/__tests__/agent-chat-overflow.test.ts`：验证长 Markdown、表格、代码块不会撑破页面。
- `src/__tests__/agent-context-server.test.ts`：验证服务端 Agent context 不读取客户端 profile storage。
- `src/__tests__/agent-chat-interview-binding.test.ts`：验证 AgentChat 能展示 active interview binding。

这些测试说明：Agent Chat 的产品质量不只看模型能不能答，而要看前端能不能稳定承接长任务、工具证据和会话恢复。

## 17. 产品总结

Agent Chat 的真实结构是：

```text
入口层：/agent、URL 参数、文本、图片
会话层：ChatSession、messages、agentState、interviewState
运行层：SSE 事件、tool_call、tool_result、done
呈现层：MarkdownRenderer、工具卡片、绑定栏、运行提示
状态层：guidedSession、任务切换确认、会话保存
证据层：read-back、工具结果、契约完成条件
```

它的产品价值是把 AI 能力变成可用产品体验：用户看到的不只是模型回答，而是一个能执行任务、保留状态、展示证据、避免误写入的求职 Agent 工作台。
