# Agent Runtime 自恢复源码研究

日期：2026-08-24

## 研究问题

本次研究聚焦两个问题：

1. DSH、Pi、Claude Code、Codex 为什么在工具失败、模型流中断或执行受限后，通常仍能继续推进任务？
2. 哪些机制可以迁移到纸鸢，而不会让 Agent 运行监控与治理反过来阻断主流程？

用户的体验描述基本准确，但更精确的说法是：这些产品并非“永远不会卡死”，而是把失败分成不同层级，先进行有界的传输重试、同一 Turn 恢复、上下文压缩、工具或参数重规划、权限升级等动作；只有遇到不可恢复条件、恢复预算耗尽、缺少用户信息或存在不可逆风险时，才把问题交还用户。

## 研究范围与固定版本

| 项目 | 官方仓库 | 固定提交 | 证据边界 |
| --- | --- | --- | --- |
| DSH | `deepseek-ai/deepseek-harness` | `b150a551b8d465e31e418e1b2eaf5e79bbb7d28e` | 核心 Runtime 源码与测试 |
| Pi | `earendil-works/pi` | `a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c` | Agent Loop、Session、Retry 源码 |
| Claude Code | `anthropics/claude-code` | `45bdfa96ca415da92e62b6ca85a1d6e29adf3c44` | 官方插件源码与官方 CHANGELOG；核心 Runtime 未开源 |
| Codex | `openai/codex` | `068c49f075cf287a1fe7d1ee36cf005efac922e7` | Rust Runtime、协议、测试源码 |

Pi 的官方仓库已经迁移到 `earendil-works/pi`，包元数据仍指向该 canonical repository。Claude Code 官方仓库明确采用 proprietary license，并未发布核心 Runtime，因此本文不会把 CHANGELOG 中披露的行为冒充源码实现。

## 总结结论

四个项目共同体现的不是一条“自动重试”规则，而是一组有层次的运行时能力：

1. **拒绝动作，不默认终止 Run。** 治理拒绝或工具失败通常变成模型可见的结构化结果，让模型换参数、换工具或换路径。
2. **错误分类后再恢复。** 网络、429、5xx、流中断适合退避重试；认证、账单、配额、确定性参数错误应快速失败或改路线。
3. **恢复必须有预算。** 重试、工具调用、子 Agent、同错误指纹和无进展轮次都需要边界，避免从“卡死”变成“无限循环”。
4. **Checkpoint 位于语义边界。** 模型请求前、有副作用工具前、完成一个 Step 后持久化，才能在进程退出后安全恢复。
5. **执行与观察解耦。** 监控、审计、Review、Eval 的异常不应改变 Run 结果；仅与正确性直接相关的策略准入、事务和读回验证留在同步主路径。
6. **真正 Resume 不只是恢复聊天记录。** Runtime 还要知道当前 Step、Attempt、最后 Checkpoint、进行中的动作、幂等键和中断 Turn 的重放策略。

## DSH

### Create 与 Resume 由 Runtime 拥有

DSH 把 Agent 和 Session 的创建、恢复、发布及回滚放在同一个 Runtime module 中。`createAgent` 先准备私有 Session，再执行 setup，成功后才发布；任一步失败都会 dispose。`resume` 通过持久化服务加载 Session，并用 AbortSignal 防止永不返回的后端永久占住身份。

- [`packages/core/agent-loop/src/index.ts#L600-L645`](https://github.com/deepseek-ai/deepseek-harness/blob/b150a551b8d465e31e418e1b2eaf5e79bbb7d28e/packages/core/agent-loop/src/index.ts#L600-L645)
- [`packages/core/agent-loop/src/index.ts#L647-L703`](https://github.com/deepseek-ai/deepseek-harness/blob/b150a551b8d465e31e418e1b2eaf5e79bbb7d28e/packages/core/agent-loop/src/index.ts#L647-L703)

这提供了很强的 locality：执行 ownership、资源清理和恢复不是由 UI 页面分别拼接。

### Retry 是 `agent/request-error` 上的恢复插件

模型请求失败时，Agent Loop 发出 `agent/request-error`；恢复插件根据 retry policy 决定是否返回 `retry`。Retry 事件先写入 Session，退避等待可被取消，次数和延迟都有策略边界。

- [`packages/core/agent-loop/src/agent.ts#L350-L389`](https://github.com/deepseek-ai/deepseek-harness/blob/b150a551b8d465e31e418e1b2eaf5e79bbb7d28e/packages/core/agent-loop/src/agent.ts#L350-L389)
- [`packages/llm/llm-retry/src/index.ts#L140-L207`](https://github.com/deepseek-ai/deepseek-harness/blob/b150a551b8d465e31e418e1b2eaf5e79bbb7d28e/packages/llm/llm-retry/src/index.ts#L140-L207)
- [`packages/llm/llm-retry/src/index.ts#L210-L225`](https://github.com/deepseek-ai/deepseek-harness/blob/b150a551b8d465e31e418e1b2eaf5e79bbb7d28e/packages/llm/llm-retry/src/index.ts#L210-L225)

### Checkpoint 绑定语义边界

独立 checkpoint policy 在模型请求前、顶层工具执行前和下一 Step 前 flush Session。持久化失败时，对模型请求和有副作用工具采用 fail-closed，避免在没有可靠记录时执行不可重放动作。

- [`packages/session/session-checkpoint-policy/src/index.ts#L1-L37`](https://github.com/deepseek-ai/deepseek-harness/blob/b150a551b8d465e31e418e1b2eaf5e79bbb7d28e/packages/session/session-checkpoint-policy/src/index.ts#L1-L37)
- [`packages/session/session-checkpoint-policy/src/index.ts#L52-L82`](https://github.com/deepseek-ai/deepseek-harness/blob/b150a551b8d465e31e418e1b2eaf5e79bbb7d28e/packages/session/session-checkpoint-policy/src/index.ts#L52-L82)

DSH 的关键启示是：恢复能力挂在一个深的 Runtime module 和 durable event log 上，而不是散落在 UI、监控与 Review 中。

## Pi

### Tool Error 回灌模型，Loop 默认继续

工具不存在、参数错误、治理 Hook 拒绝和执行异常都会变成 `isError=true` 的 Tool Result，再追加到模型 Context。模型因此可以重新规划；Runtime 不需要为所有工具维护固定 fallback 路由表。

- [`packages/agent/src/agent-loop.ts#L600-L707`](https://github.com/earendil-works/pi/blob/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/agent/src/agent-loop.ts#L600-L707)
- [`packages/agent/src/agent-loop.ts#L777-L790`](https://github.com/earendil-works/pi/blob/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/agent/src/agent-loop.ts#L777-L790)

`beforeToolCall` 的 `block` 默认只拒绝当前工具动作；只有显式 `terminate: true` 才终止。Tool batch 也只在所有结果都要求 terminate 时结束。

- [`packages/agent/src/agent-loop.ts#L582-L646`](https://github.com/earendil-works/pi/blob/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/agent/src/agent-loop.ts#L582-L646)

### Provider Retry 与 Context Overflow 分层处理

Pi 先排除 quota、billing、budget exhaustion 等不可恢复错误，再识别 overload、429、5xx、网络、DNS、timeout 和流提前结束等瞬态错误。Retry 有次数上限、指数退避且可被 Abort。

- [`packages/ai/src/utils/retry.ts#L7-L90`](https://github.com/earendil-works/pi/blob/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/ai/src/utils/retry.ts#L7-L90)
- [`packages/ai/src/utils/retry.ts#L145-L227`](https://github.com/earendil-works/pi/blob/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/ai/src/utils/retry.ts#L145-L227)
- [`packages/coding-agent/src/core/agent-session.ts#L2807-L2860`](https://github.com/earendil-works/pi/blob/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/coding-agent/src/core/agent-session.ts#L2807-L2860)

Context Overflow 不走普通 Retry，而是移除失败的 Assistant Message、压缩 Context，再继续一次；再次失败才要求用户缩减 Context 或换大窗口模型。

- [`packages/coding-agent/src/core/agent-session.ts#L2030-L2119`](https://github.com/earendil-works/pi/blob/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/coding-agent/src/core/agent-session.ts#L2030-L2119)

### Pi 的边界

Pi 的 Session 是 append-only JSONL tree，可以恢复已落盘 Context，但本次检索未发现进程崩溃后自动重放未完成 Tool Call 的通用实现。核心 Loop 也没有通用的相同 Tool+Args、相同错误指纹或无状态变化检测。Bash timeout 仍是可选参数。

- [`packages/coding-agent/src/core/session-manager.ts#L844-L854`](https://github.com/earendil-works/pi/blob/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/coding-agent/src/core/session-manager.ts#L844-L854)
- [`packages/coding-agent/src/core/tools/bash.ts#L28-L43`](https://github.com/earendil-works/pi/blob/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/coding-agent/src/core/tools/bash.ts#L28-L43)
- [`packages/agent/src/agent-loop.ts#L163-L174`](https://github.com/earendil-works/pi/blob/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/agent/src/agent-loop.ts#L163-L174)

扩展 Handler 虽然用 `try/catch` 隔离异常，但仍被串行 `await` 且没有统一 deadline。因此“catch 住监控异常”仍不够：一个永不 settle 的 Promise 依然会卡住主 Loop。

- [`packages/coding-agent/src/core/extensions/runner.ts#L801-L830`](https://github.com/earendil-works/pi/blob/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/coding-agent/src/core/extensions/runner.ts#L801-L830)

## Claude Code

### 源码边界

Claude Code 官方仓库没有发布核心 Runtime，只包含插件、文档和发行记录，许可证也是 proprietary。

- [`README.md#L48-L50`](https://github.com/anthropics/claude-code/blob/45bdfa96ca415da92e62b6ca85a1d6e29adf3c44/README.md#L48-L50)
- [`LICENSE.md#L1`](https://github.com/anthropics/claude-code/blob/45bdfa96ca415da92e62b6ca85a1d6e29adf3c44/LICENSE.md#L1)

因此下述内容分为“插件源码可证明”与“官方 CHANGELOG 披露”，不对闭源 implementation 做推断。

### 治理基础设施 Fail-open

官方 `hookify` 插件在 import 或运行异常时记录诊断并 `exit 0`，源码明确要求不能因为 Hook 自身错误阻断操作。PreToolUse 的 deny 与 Stop Event 的 block 也被分成不同决策。

- [`plugins/hookify/hooks/pretooluse.py#L25-L32`](https://github.com/anthropics/claude-code/blob/45bdfa96ca415da92e62b6ca85a1d6e29adf3c44/plugins/hookify/hooks/pretooluse.py#L25-L32)
- [`plugins/hookify/hooks/pretooluse.py#L61-L70`](https://github.com/anthropics/claude-code/blob/45bdfa96ca415da92e62b6ca85a1d6e29adf3c44/plugins/hookify/hooks/pretooluse.py#L61-L70)
- [`plugins/hookify/core/rule_engine.py#L60-L79`](https://github.com/anthropics/claude-code/blob/45bdfa96ca415da92e62b6ca85a1d6e29adf3c44/plugins/hookify/core/rule_engine.py#L60-L79)

Ralph Stop Hook 展示了另一个重要模式：未完成时可以继续推进，但必须同时具备 completion condition 和 max-iteration safety net。

- [`plugins/ralph-wiggum/hooks/stop-hook.sh#L50-L87`](https://github.com/anthropics/claude-code/blob/45bdfa96ca415da92e62b6ca85a1d6e29adf3c44/plugins/ralph-wiggum/hooks/stop-hook.sh#L50-L87)
- [`plugins/ralph-wiggum/hooks/stop-hook.sh#L130-L174`](https://github.com/anthropics/claude-code/blob/45bdfa96ca415da92e62b6ca85a1d6e29adf3c44/plugins/ralph-wiggum/hooks/stop-hook.sh#L130-L174)

### 官方披露的 Runtime 行为

官方 CHANGELOG 披露了 stream idle 恢复、429/ECONNRESET 退避、Credential Stall Guard、长 MCP Tool 转后台、确定性坏请求防无限重试、Interrupted Turn Resume，以及 Spend Limit/Out of Credits 快速失败等行为。

- [Stream idle 恢复](https://github.com/anthropics/claude-code/blob/45bdfa96ca415da92e62b6ca85a1d6e29adf3c44/CHANGELOG.md#L275-L282)
- [429 与 ECONNRESET 重试](https://github.com/anthropics/claude-code/blob/45bdfa96ca415da92e62b6ca85a1d6e29adf3c44/CHANGELOG.md#L1078-L1097)
- [Credential Stall Guard](https://github.com/anthropics/claude-code/blob/45bdfa96ca415da92e62b6ca85a1d6e29adf3c44/CHANGELOG.md#L905-L911)
- [MCP 后台化与资源预算](https://github.com/anthropics/claude-code/blob/45bdfa96ca415da92e62b6ca85a1d6e29adf3c44/CHANGELOG.md#L710-L719)
- [Interrupted Turn Resume](https://github.com/anthropics/claude-code/blob/45bdfa96ca415da92e62b6ca85a1d6e29adf3c44/CHANGELOG.md#L645-L652)
- [不可恢复账户错误快速失败](https://github.com/anthropics/claude-code/blob/45bdfa96ca415da92e62b6ca85a1d6e29adf3c44/CHANGELOG.md#L60-L65)

## Codex

### Response Stream Retry 与传输降级

Codex 将流错误恢复集中在 `responses_retry` module。普通流错误使用有界 Retry 和 backoff；连接恢复可以显示“Reconnecting”；WebSocket 重试预算耗尽后，Session 会切换到 HTTPS 并重放请求。

- [`codex-rs/core/src/responses_retry.rs#L1-L43`](https://github.com/openai/codex/blob/068c49f075cf287a1fe7d1ee36cf005efac922e7/codex-rs/core/src/responses_retry.rs#L1-L43)
- [`codex-rs/core/src/responses_retry.rs#L44-L128`](https://github.com/openai/codex/blob/068c49f075cf287a1fe7d1ee36cf005efac922e7/codex-rs/core/src/responses_retry.rs#L44-L128)
- [`codex-rs/core/tests/suite/websocket_fallback.rs#L86-L123`](https://github.com/openai/codex/blob/068c49f075cf287a1fe7d1ee36cf005efac922e7/codex-rs/core/tests/suite/websocket_fallback.rs#L86-L123)

### Interrupted Turn 以原 Turn ID 恢复

Codex 的协议明确建模 `RecoverTurnRequest`。Runtime 只在 Thread idle 时恢复中断 Turn，不创建新的 User Input，并保留已经记录的原 Turn ID。转移 ownership 前需要停止执行、flush history 并关闭 writer。

- [`codex-rs/protocol/src/turn_input.rs#L53-L62`](https://github.com/openai/codex/blob/068c49f075cf287a1fe7d1ee36cf005efac922e7/codex-rs/protocol/src/turn_input.rs#L53-L62)
- [`codex-rs/core/src/codex_thread.rs#L370-L416`](https://github.com/openai/codex/blob/068c49f075cf287a1fe7d1ee36cf005efac922e7/codex-rs/core/src/codex_thread.rs#L370-L416)

这比只恢复聊天历史更深：Runtime 知道被中断的执行身份，并提供 ownership handoff seam。

### 工具治理与升级重试集中编排

Tool Orchestrator 把审批、Sandbox 选择、第一次执行和 Sandbox 拒绝后的升级重试放在同一 module，避免每个工具 caller 重复正确顺序。

- [`codex-rs/core/src/tools/orchestrator.rs#L1-L8`](https://github.com/openai/codex/blob/068c49f075cf287a1fe7d1ee36cf005efac922e7/codex-rs/core/src/tools/orchestrator.rs#L1-L8)
- [`codex-rs/core/src/tools/orchestrator.rs#L225-L330`](https://github.com/openai/codex/blob/068c49f075cf287a1fe7d1ee36cf005efac922e7/codex-rs/core/src/tools/orchestrator.rs#L225-L330)

Codex 还具有 mid-turn compaction，使上下文压力不必直接终止任务：

- [`codex-rs/core/src/compact.rs`](https://github.com/openai/codex/blob/068c49f075cf287a1fe7d1ee36cf005efac922e7/codex-rs/core/src/compact.rs)

## 对纸鸢的架构含义

### 1. 先深化 Durable Agent Run module

当前纸鸢的主执行 ownership 在浏览器页面，durable run 更像附加台账；`resume` 只查询记录而不能继续执行。应先把运行状态、checkpoint、lease、cancel、deadline、幂等与真实 resume 集中到一个深的 Runtime module。否则 Recovery Supervisor 和监控旁路都没有稳定 seam。

### 2. 将治理决策从 Run 终态中拆开

需要明确三个不同事实：

- 当前 Action 是否允许；
- 当前 Action 是否失败；
- 整个 Run 是否不可继续。

`deny(action) ≠ terminate(run)`。治理 module 可以 fail-closed 地保护高风险动作，但治理基础设施自身的异常、超时和记录失败应 fail-open 或进入降级队列，不能劫持执行状态。

### 3. 建立 Recovery Supervisor module

Recovery Supervisor 应集中错误分类、已尝试策略、任务进度、风险和恢复预算，依次选择：同请求重试、参数修正、模型/传输 adapter 降级、安全替代工具、Context compact、回滚、澄清或最终升级用户。它应替代 client/server loop 内分叉的浅层规则，而不是再包一层 hypothetical interface。

### 4. 将工具执行深化为 Governed Tool Attempt module

同一 module 负责准入、deadline、取消、执行、stream stall、读回、幂等和结构化 observation。这样可获得 locality，并为所有 Agent 提供高 leverage 的真实 test seam。

### 5. 监控沉淀改成 Run Evidence observer

执行 module 只发布事实事件；observer 通过有界缓冲或 Outbox 持久化、脱敏、投影到 Admin，并异步触发 Review/Eval。慢、失败、乱序的 evidence adapter 不改变 Run 结果。Task contract、事务与读回验证仍属于执行正确性，不能被错误地降级为旁路监控。

## 迁移时不应照搬的部分

- 不照搬无界 Retry；它会把卡死换成成本失控。
- 不假设 Session History 等于 in-flight resume；未完成工具可能已产生部分副作用。
- 不把所有治理故障都 fail-open；业务策略拒绝应保护动作，只有治理基础设施故障才应旁路或降级。
- 不只增加最大轮数；还需要相同错误指纹、相同 Tool+Args、无状态变化、资源预算和 deadline。
- 不为每一层创建新 adapter；只在生产模型/工具、持久化、观察投影等真实变化点建立 seam。

## 推荐推进顺序

1. Durable Agent Run module
2. Governed Tool Attempt module
3. Recovery Supervisor module
4. Run Evidence observer module

第一项是前置条件。只有先让 Runtime 真正拥有 Run，后续自恢复才会成为 implementation，而不是提示词、页面状态或事后 Review 中的愿望。
