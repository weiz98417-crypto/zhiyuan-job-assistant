# Proposal: d2-assistant-ui-swap

## Problem Statement

0.11.0-A/B/C 把语义层（路由、事件方言、transcript 单写者）全部收敛后，聊天界面壳仍是一块约 2700 行、无测试覆盖的自研巨石（AgentChat.tsx）：滚动、输入框、消息流渲染、流式更新、键盘与可达性这些通用问题全部自研自养，而这类问题正是成熟开源聊天组件库已经解决并持续打磨的部分。用户在决策轮明确选择：候选 6（assistant-ui 整体换芯）直接做，不看快赢替代。

## Solution

引入 `@assistant-ui/react`（0.15.x，MIT，peer 支持 React 19），以 ExternalStoreRuntime 模式对接自研的 Run 观察 store：消息源 = 服务端投影 + 本地乐观合并层（C 的 mergeServerTranscript 语义），运行状态 = Run 状态。Thread（消息流）、Composer（输入框）、ToolUI（领域卡片挂载）、ApprovalCard（Run Gate 审批形态）替换 AgentChat 的对应部分；页面壳（头部/旅程栏/分析面/活动轨道）、领域卡片逻辑全部保留。消息编辑/重生成/分支不提供回调（durable Run 不可变）。旧 AgentChat 组件在换芯验证后退役删除。

## User Stories

1. As a 求职用户, I want 消息流在流式输出、刷新合并、工具卡场景下都平滑无闪烁, so that 对话过程观感可信。
2. As a 求职用户, I want 审批卡有统一的交互形态（批准/拒绝/状态流转）, so that 高风险操作敢于确认。
3. As a 求职用户, I want 输入框自动伸缩、Enter 发送、Shift+Enter 换行, so that 输入体验不硌手。
4. As a 求职用户, I want 长对话自动滚动到底、我上翻时不被强行拉回, so that 阅读不被打断。
5. As a 求职用户, I want 领域卡片（岗位卡/报告卡/委派卡/交接横幅）在新消息流里保持原有信息与操作, so that 换壳不丢功能。
6. As a 开发者, I want 滚动/输入/可达性/键盘这些通用问题由维护中的库承担, so that 自研代码只剩领域卡片和业务编排。
7. As a 开发者, I want 旧 AgentChat 在换芯验证后删除, so that 仓库里只有一条聊天实现路径。

## Implementation Decisions

- 依赖：`@assistant-ui/react@^0.15`（peer react ^18||^19 兼容确认；自带 radix-ui/zustand/zod 依赖树）。装包前记录依赖快照；与 React 19.2 + Next 16 做一次 import 级兼容验证后再全面接线。
- 运行时：ExternalStoreRuntime 能力开关式适配——`messages`（由 mergeServerTranscript 合并后的对话项转换，ThreadMessageLike 映射在 convertMessage 中定义）、`isRunning`（streaming && phase 活跃）、`onNew`（提交 Turn 到 durable Run 创建流程）、`onCancel`（现有取消）。不提供 `onEdit`/`onReload`/分支回调。
- 事件→消息转换：过程语义（step/subagent/agent_switch/persist_done）按 0.11.0-B 的方言模块映射为线程消息的 data parts 或独立条目；工具卡经 ToolUI 按安全投影类型注册（delegation/handoff/报告卡等既有组件直接挂）。
- Run Gate 审批：ApprovalCard 形态接入，保留既有 reconcileRunGateMessages 的状态修正逻辑与决策回调。
- 样式：assistant-ui 的组件消费 0.11.0-D 的纸鸢令牌（--color-* / --radius-* / --font-*），copy-in 定制组件进入仓库（shadcn 模式），不改库内文件。
- 保留不动：页面壳、旅程栏、分析面（AnalystCanvas）、AgentActivityTrack、SuggestionChips、SessionList。
- 退役：旧 AgentChat.tsx 及其专属测试在以下条件全绿后删除——新壳渲染等价走查（样张 v2 场景清单）、PE2E 13 条全解冻全绿、连贯性验收集通过。
- 语义冻结：换芯期间不改动 A/B/C 已落地的服务端行为与事件方言；发现的问题按"新壳适配语义"处理，反向不改。

## Testing Decisions

- 组件外部行为测试：给定合并后消息（含工具卡/审批卡/委派卡）→ 断言渲染要点与回调触发（先例：AgentChat 既有回归测试）。
- 交互测试：审批通过/拒绝触发正确回调；Enter 发送；流式中禁用态正确。
- 回归门禁：PE2E 13 条全解冻全绿 + 连贯性验收集（澄清 Run 渲染、agent_switch 标签刷新、委派轨道、零闪烁、亚秒回执）作为 0.11.0 最终发布门禁。
- 先例：agent-session-safe-api.test（路由层行为）、agent-collaboration.test（工具行为）、transcript-merge.test（纯函数）。

## Out of Scope

- 消息编辑/重生成/分支史。
- Mastra 会话层（独立发布）。
- admin 后台组件重写（仅 antd 主题对齐）。
- 意图判定模型质量迭代。

## Further Notes

- 依赖树含 assistant-cloud 传递依赖（MIT）；安装后核对许可证与体积，若传递依赖异常则在 PR 中说明并锁定版本。
- 分支史摩擦为已知上游问题（assistant-ui #3161）；本方案不启用分支，不受影响。
