# Proposal: b-event-dialect

## Problem Statement

worker 产生的过程语义在到达用户眼前的中途丢失：主责交接（agent_switch）事件有投影无消费，界面头部纹丝不动；交接卡与委派卡在安全投影层注册了字段、在消息渲染层没有分支，退化成一行灰字；委派进行中用户完全看不到"谁在替我研究什么"；同一事件在 SSE 与轮询两种传输模式下可见性不同。三张需要人工同步的分支表（投影白名单、渲染分支、观察者分支）已经漂移。等待期间只有一句静态文案，用户不知道进行到第几步、还差什么。

## Solution

建立一份共享的事件方言类型模块作为唯一事实源：新增语义按 AG-UI 词汇命名（subagent 开始/结束、step 开始/结束、messages 快照对账），服务端产出、投影白名单、客户端观察者、消息渲染注册全部从这一个模块导入，三张手工表归一。观察者消费 agent_switch 刷新界面主责标识；交接卡、委派过程轨道、委派结论卡获得真实渲染；执行步骤按"理解→执行→校验→回应"四段推进并携带任务判据进度；SSE 事件量化间隔降到 250ms，长预算步骤（图片识别）分段播报。

## User Stories

1. As a 求职用户, I want agent 交接时界面立即显示新主责是谁, so that 我始终知道谁在负责我的任务。
2. As a 求职用户, I want 委派研究进行中看到"正在让评估专家研究某问题"的活状态, so that 等待不焦虑。
3. As a 求职用户, I want 委派结论以要点卡形式回到对话, so that 我能扫一眼拿到关键信息。
4. As a 求职用户, I want 长任务按步骤推进显示（理解/执行/校验/回应 + 判据 2/5）, so that 我知道进行到哪、还差多少。
5. As a 求职用户, I want 图片识别这类长步骤分段播报进度, so that 三分钟的等待不显得死机。
6. As a 求职用户, I want SSE 断线降级轮询后看到的信息一致, so that 传输方式不影响我的感知。
7. As a 开发者, I want 事件类型只在一处定义并被两端共享, so that 增加一种卡片不再要改三个文件。
8. As a 开发者, I want 历史事件回放兼容, so that 已落库的旧会话照常渲染。

## Implementation Decisions

- 新建共享类型模块（服务端/客户端同构 import）：AG-UI 对齐的事件语义——`subagent.started/finished/error`（含父子归因）、`step.started/finished`（含判据计数）、`messages.snapshot`（对账）、`run.finished`（含中断结局）；现有事件名不重命名，durable 事件库回放兼容。
- 步骤事件来源 = worker loop 既有 phase 边界 + 任务程序判据进度（"判据 n/m"），不为步骤新建状态机；诚实进度，不做假进度条。
- 观察者补齐消费：agent_switch → 刷新主责标签；intent → 记录判定审计；run_directive/result_quality 透传给过程轨道。SSE 模式与轮询模式走同一分发器，消除可见性不对称。
- 渲染分支表单一事实源化：安全投影的类型白名单与消息渲染的组件注册表由同一模块导出（类型 → 安全字段 + 组件），投影放行但没有组件的类型在开发构建告警。
- 交接卡（handoff/handoff_denied）、委派过程轨道（running 态）、委派结论卡（findings/keyPoints）获得正式渲染组件。
- SSE 事件路由量化间隔 1s → 250ms（服务端轮询读，查询轻量；LISTEN 真推送明确不做，记录为已知取舍）。
- 长预算步骤分段播报：图片识别按分段发送 step 进度事件；不改变既有超时预算本身。
- 会话隔离补漏：信号提取去重键按会话分桶；主责标签状态在会话切换时依据会话归属重置。

## Testing Decisions

- 事件方言模块的类型与白名单一致性由单一断言测试锁住（每个安全类型必有组件注册或显式声明为纯状态）。
- 观察者分发器：注入合成事件序列（新旧混合）断言 UI 状态变化——外部行为测试。
- 交接/委派卡的渲染走组件测试（给定 uiPayload → 期望 DOM 要点），先例：agent-surface-projection.test、AgentChat 相关回归测试。
- 步骤进度：通过 durable 引擎测试缝断言 phase 转换发射 step 事件与判据计数。

## Out of Scope

- LISTEN/NOTIFY 真推送（明确不做，量化 250ms 已低于感知阈值）。
- 事件库的持久化格式变更。
- 分析面内的报告渲染（归 d-dual-canvas-ui）。

## Further Notes

- 与 ADR-0013/0020 一致：事件投影进用户安全面；本变更补齐的是"安全面之后的渲染"半程。
