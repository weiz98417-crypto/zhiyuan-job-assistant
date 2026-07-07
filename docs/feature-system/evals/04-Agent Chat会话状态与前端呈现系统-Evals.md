# Agent Chat会话状态与前端呈现系统 Evals

本文档根据项目当前 feature 文档、源码边界和已经沉淀的测试资产整理 Agent Chat会话状态与前端呈现系统 的 evals。这里明确区分“已有自动化覆盖”“相关测试存在但需补精确断言”和“待补自动化”：没有可复跑证据的场景不能写成已完成事实。

## 评测对象

Agent Chat 消息、SSE、工具卡片、run 恢复、上下文压缩、面试绑定和跨页面任务承接。

## 项目事实

### 关键实现面
- `src/components/agent/AgentChat.tsx`
- `src/components/agent/SessionList.tsx`
- `src/lib/agent/context.ts`
- `src/lib/agent/run-ledger.ts`
- `src/lib/agent/run-recovery-message.ts`
- `src/lib/stream-utils.ts`

### 已落地或部分落地的 eval 资产
- `src/__tests__/agent-chat-overflow.test.ts`
- `src/__tests__/agent-context-server.test.ts`
- `src/__tests__/agent-chat-interview-binding.test.ts`
- `src/__tests__/agent-run-recovery-message.test.ts`
- `src/__tests__/agent-image-loop.test.ts`
- `src/__tests__/agent-chat-job-discovery-ui.test.ts`

### 从现有测试读到的行为
- agent-chat-overflow.test.ts 已固定长 Markdown 不造成页面横向滚动。
- agent-context-server.test.ts 已固定服务端上下文不能读取浏览器 IndexedDB。
- agent-image-loop.test.ts 已覆盖图片-only 回合、symbol-only 阻断、压缩提示和 session memory digest 节流。

### 待补 eval 缺口
- 补工具 uiPayload 渲染结构的页面级 eval。
- 补会话列表 session restore 的端到端 eval。
- 补 SSE tool card 与 run ledger 证据一致性的 eval。

## 实施与治理任务清单

这些任务只描述项目当前缺口，不假装已经落地。每完成一项，都应补一条自动化 eval，并在本文件对应场景下把状态从“待补自动化”改成“已有自动化覆盖”。

### 1. 补工具 uiPayload 渲染结构的页面级 eval

**为什么要补**: 这是当前 AgentChat、SSE 解析、active run 恢复和结构化 uiPayload 卡片 链路里还缺少确定性证据的部分；如果只靠人工试用，后续改路由、数据层或 UI 时很容易回归。

**实施方式**:
- 复用现有资产：`src/__tests__/agent-chat-overflow.test.ts`、`src/__tests__/agent-context-server.test.ts`、`src/__tests__/agent-chat-interview-binding.test.ts`、`src/__tests__/agent-run-recovery-message.test.ts`、`src/__tests__/agent-image-loop.test.ts`。
- fixture 必须包含：sessionId、runId、stepId、event type、message cap 和 active binding。
- 断言必须读取：AgentChat DOM 状态、SSE buffer 输出、run ledger 和恢复消息。
- 如果涉及写入，失败分支要证明没有留下部分写入；如果是页面链路，要覆盖空态、错误态和主操作。

**完成标准**: 本地测试或脚本能稳定复跑，并且失败信息能指向实现问题、测试缺口或产品预期变化中的一种。

### 2. 补会话列表 session restore 的端到端 eval

**为什么要补**: 这是当前 AgentChat、SSE 解析、active run 恢复和结构化 uiPayload 卡片 链路里还缺少确定性证据的部分；如果只靠人工试用，后续改路由、数据层或 UI 时很容易回归。

**实施方式**:
- 复用现有资产：`src/__tests__/agent-chat-overflow.test.ts`、`src/__tests__/agent-context-server.test.ts`、`src/__tests__/agent-chat-interview-binding.test.ts`、`src/__tests__/agent-run-recovery-message.test.ts`、`src/__tests__/agent-image-loop.test.ts`。
- fixture 必须包含：sessionId、runId、stepId、event type、message cap 和 active binding。
- 断言必须读取：AgentChat DOM 状态、SSE buffer 输出、run ledger 和恢复消息。
- 如果涉及写入，失败分支要证明没有留下部分写入；如果是页面链路，要覆盖空态、错误态和主操作。

**完成标准**: 本地测试或脚本能稳定复跑，并且失败信息能指向实现问题、测试缺口或产品预期变化中的一种。

### 3. 补 SSE tool card 与 run ledger 证据一致性的 eval

**为什么要补**: 这是当前 AgentChat、SSE 解析、active run 恢复和结构化 uiPayload 卡片 链路里还缺少确定性证据的部分；如果只靠人工试用，后续改路由、数据层或 UI 时很容易回归。

**实施方式**:
- 复用现有资产：`src/__tests__/agent-chat-overflow.test.ts`、`src/__tests__/agent-context-server.test.ts`、`src/__tests__/agent-chat-interview-binding.test.ts`、`src/__tests__/agent-run-recovery-message.test.ts`、`src/__tests__/agent-image-loop.test.ts`。
- fixture 必须包含：sessionId、runId、stepId、event type、message cap 和 active binding。
- 断言必须读取：AgentChat DOM 状态、SSE buffer 输出、run ledger 和恢复消息。
- 如果涉及写入，失败分支要证明没有留下部分写入；如果是页面链路，要覆盖空态、错误态和主操作。

**完成标准**: 本地测试或脚本能稳定复跑，并且失败信息能指向实现问题、测试缺口或产品预期变化中的一种。


## 基线 Evals

基线 evals 验证 Agent Chat会话状态与前端呈现系统 的主链路是否成立。每条都必须说明真实入口、输入 fixture、证据读回和当前覆盖状态。

### B1. 长任务 tool result 以结构化卡片展示

**状态**: 相关测试存在，需补精确断言

**项目依据**:
- - 用户不需要知道该调用哪个工具，前端负责把消息交给 Agent 运行链路。 - 长任务必须有流式反馈，不能让用户盯着空白页面。 - 工具调用结果要以卡片或结构化信息呈现，而不是只显示一大段 JSON。 - 会话要能保存、切换、删除、置顶和恢复。 - 从 JD 库、Offer 页面、面试入口跳到 Agent 时，要保留目标对象。 - 面试、图片识别、简历提案...
- 纸鸢求职助手的 Agent Chat，不是一个普通聊天框。它是整个 AI 求职助手的运行前台：用户在这里发起 JD 评估、简历查询、简历修改、画像更新、面试准备、Offer 评估、文件导出等任务；系统在这里展示模型回答、工具调用、流式状态、工具卡片、会话列表、跨页面任务入口和安全提示。
- 主要实现面：`src/components/agent/AgentChat.tsx`、`src/components/agent/SessionList.tsx`、`src/lib/agent/context.ts`、`src/lib/agent/run-ledger.ts`。

**输入/fixture**:
- 正例：带 runId/stepId/uiPayload 的长任务、面试绑定和图片-only 回合，用来验证“长任务 tool result 以结构化卡片展示”的成功路径。
- 反例：长 Markdown、symbol-only 输入、SSE 分片、上下文压缩边界，用来证明该 主链路 eval 不会被相邻功能误判为通过。
- 记录字段：sessionId、runId、stepId、event type、message cap 和 active binding；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 AgentChat、SSE 解析、active run 恢复和结构化 uiPayload 卡片 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“长任务 tool result 以结构化卡片展示”对应动作，并记录请求、工具调用或页面状态。
3. 读取 AgentChat DOM 状态、SSE buffer 输出、run ledger 和恢复消息，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“长任务 tool result 以结构化卡片展示”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 Agent Chat会话状态与前端呈现系统 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/agent-chat-overflow.test.ts`: keeps long markdown output from creating page-level horizontal scroll
- `src/__tests__/agent-context-server.test.ts`: does not touch browser IndexedDB stores when a server user id is provided
- `src/__tests__/agent-chat-interview-binding.test.ts`: renders the active interview binding from persisted session state

**缺口处理**: 现有测试覆盖了同一功能面，但还没有把这条场景的输入、边界和断言单独固定。

### B2. 刷新后恢复 active run 状态

**状态**: 已有自动化覆盖

**项目依据**:
- - 用户不需要知道该调用哪个工具，前端负责把消息交给 Agent 运行链路。 - 长任务必须有流式反馈，不能让用户盯着空白页面。 - 工具调用结果要以卡片或结构化信息呈现，而不是只显示一大段 JSON。 - 会话要能保存、切换、删除、置顶和恢复。 - 从 JD 库、Offer 页面、面试入口跳到 Agent 时，要保留目标对象。 - 面试、图片识别、简历提案...
- 例如面试状态会带有 `planSnapshot`，Agent 页面和 `AgentChat.tsx` 会展示 active interview binding，让用户知道当前面试绑定的是哪份 JD、哪份简历、哪家公司和岗位。
- 主要实现面：`src/components/agent/AgentChat.tsx`、`src/components/agent/SessionList.tsx`、`src/lib/agent/context.ts`、`src/lib/agent/run-ledger.ts`。

**输入/fixture**:
- 正例：带 runId/stepId/uiPayload 的长任务、面试绑定和图片-only 回合，用来验证“刷新后恢复 active run 状态”的成功路径。
- 反例：长 Markdown、symbol-only 输入、SSE 分片、上下文压缩边界，用来证明该 主链路 eval 不会被相邻功能误判为通过。
- 记录字段：sessionId、runId、stepId、event type、message cap 和 active binding；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 AgentChat、SSE 解析、active run 恢复和结构化 uiPayload 卡片 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“刷新后恢复 active run 状态”对应动作，并记录请求、工具调用或页面状态。
3. 读取 AgentChat DOM 状态、SSE buffer 输出、run ledger 和恢复消息，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“刷新后恢复 active run 状态”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 Agent Chat会话状态与前端呈现系统 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/agent-run-recovery-message.test.ts`: updates the existing recovery status message for the same run instead of appending duplicates
- `src/__tests__/agent-run-recovery-message.test.ts`: describes running recovery as a status check, not a repeated execution

**缺口处理**: 这条 eval 的核心断言已经能从现有测试标题和相关实现中定位；后续只需要在行为变化时同步更新 fixture。

### B3. AgentChat 展示 active interview binding

**状态**: 已有自动化覆盖

**项目依据**:
- 例如面试状态会带有 `planSnapshot`，Agent 页面和 `AgentChat.tsx` 会展示 active interview binding，让用户知道当前面试绑定的是哪份 JD、哪份简历、哪家公司和岗位。
- - `src/__tests__/agent-chat-overflow.test.ts`：验证长 Markdown、表格、代码块不会撑破页面。 - `src/__tests__/agent-context-server.test.ts`：验证服务端 Agent context 不读取客户端 profile storage。 - `src/__tests__...
- 主要实现面：`src/components/agent/AgentChat.tsx`、`src/components/agent/SessionList.tsx`、`src/lib/agent/context.ts`、`src/lib/agent/run-ledger.ts`。

**输入/fixture**:
- 正例：带 runId/stepId/uiPayload 的长任务、面试绑定和图片-only 回合，用来验证“AgentChat 展示 active interview binding”的成功路径。
- 反例：长 Markdown、symbol-only 输入、SSE 分片、上下文压缩边界，用来证明该 主链路 eval 不会被相邻功能误判为通过。
- 记录字段：sessionId、runId、stepId、event type、message cap 和 active binding；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 AgentChat、SSE 解析、active run 恢复和结构化 uiPayload 卡片 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“AgentChat 展示 active interview binding”对应动作，并记录请求、工具调用或页面状态。
3. 读取 AgentChat DOM 状态、SSE buffer 输出、run ledger 和恢复消息，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“AgentChat 展示 active interview binding”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 Agent Chat会话状态与前端呈现系统 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/agent-chat-interview-binding.test.ts`: renders the active interview binding from persisted session state

**缺口处理**: 这条 eval 的核心断言已经能从现有测试标题和相关实现中定位；后续只需要在行为变化时同步更新 fixture。

### B4. SSE line buffer 稳定解析 data 行

**状态**: 相关测试存在，需补精确断言

**项目依据**:
- 所以 `AgentChat总入口`、`Agent会话管理`、`跨页面Agent状态保持`、`前端可读性与工具卡片` 不应该拆成四个独立系统。它们共同组成一条产品链路：用户在 Agent 页面发起任务，前端把消息、图片、会话、任务锁、SSE 事件和工具结果组织成一个可继续的求职工作流。
- `src/lib/agent/loop/types.ts` 定义了 Agent 运行过程中的 SSE 事件。前端会处理多类事件：
- 主要实现面：`src/components/agent/AgentChat.tsx`、`src/components/agent/SessionList.tsx`、`src/lib/agent/context.ts`、`src/lib/agent/run-ledger.ts`。

**输入/fixture**:
- 正例：带 runId/stepId/uiPayload 的长任务、面试绑定和图片-only 回合，用来验证“SSE line buffer 稳定解析 data 行”的成功路径。
- 反例：长 Markdown、symbol-only 输入、SSE 分片、上下文压缩边界，用来证明该 主链路 eval 不会被相邻功能误判为通过。
- 记录字段：sessionId、runId、stepId、event type、message cap 和 active binding；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 AgentChat、SSE 解析、active run 恢复和结构化 uiPayload 卡片 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“SSE line buffer 稳定解析 data 行”对应动作，并记录请求、工具调用或页面状态。
3. 读取 AgentChat DOM 状态、SSE buffer 输出、run ledger 和恢复消息，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“SSE line buffer 稳定解析 data 行”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 Agent Chat会话状态与前端呈现系统 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/agent-chat-overflow.test.ts`: keeps long markdown output from creating page-level horizontal scroll
- `src/__tests__/agent-context-server.test.ts`: does not touch browser IndexedDB stores when a server user id is provided
- `src/__tests__/agent-chat-interview-binding.test.ts`: renders the active interview binding from persisted session state

**缺口处理**: 现有测试覆盖了同一功能面，但还没有把这条场景的输入、边界和断言单独固定。

## 边界 Evals

边界 evals 验证权限、归属、失败、降级、澄清和安全边界。它们优先防止“看起来成功但实际越权或污染数据”的问题。

### E1. 长 Markdown、表格、代码块不撑破页面

**状态**: 待补自动化，现有测试可作为落点

**项目依据**:
- - 用户不需要知道该调用哪个工具，前端负责把消息交给 Agent 运行链路。 - 长任务必须有流式反馈，不能让用户盯着空白页面。 - 工具调用结果要以卡片或结构化信息呈现，而不是只显示一大段 JSON。 - 会话要能保存、切换、删除、置顶和恢复。 - 从 JD 库、Offer 页面、面试入口跳到 Agent 时，要保留目标对象。 - 面试、图片识别、简历提案...
- - `src/__tests__/agent-chat-overflow.test.ts`：验证长 Markdown、表格、代码块不会撑破页面。 - `src/__tests__/agent-context-server.test.ts`：验证服务端 Agent context 不读取客户端 profile storage。 - `src/__tests__...
- 主要实现面：`src/components/agent/AgentChat.tsx`、`src/components/agent/SessionList.tsx`、`src/lib/agent/context.ts`、`src/lib/agent/run-ledger.ts`。

**输入/fixture**:
- 正例：带 runId/stepId/uiPayload 的长任务、面试绑定和图片-only 回合，用来验证“长 Markdown、表格、代码块不撑破页面”的成功路径。
- 反例：长 Markdown、symbol-only 输入、SSE 分片、上下文压缩边界，用来证明该 边界 eval 不会被相邻功能误判为通过。
- 记录字段：sessionId、runId、stepId、event type、message cap 和 active binding；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 AgentChat、SSE 解析、active run 恢复和结构化 uiPayload 卡片 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“长 Markdown、表格、代码块不撑破页面”对应动作，并记录请求、工具调用或页面状态。
3. 读取 AgentChat DOM 状态、SSE buffer 输出、run ledger 和恢复消息，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“长 Markdown、表格、代码块不撑破页面”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 Agent Chat会话状态与前端呈现系统 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/agent-chat-overflow.test.ts`: keeps long markdown output from creating page-level horizontal scroll
- `src/__tests__/agent-context-server.test.ts`: does not touch browser IndexedDB stores when a server user id is provided
- `src/__tests__/agent-chat-interview-binding.test.ts`: renders the active interview binding from persisted session state

**缺口处理**: 这是产品预期或实现边界，当前不能写成已完成事实；需要补自动化后再改状态。

### E2. 图片-only 回合先识别不走普通聊天

**状态**: 已有自动化覆盖

**项目依据**:
- 第四，普通聊天没有长期会话状态。面试过程中的问题图、复盘、简历提案、图片澄清，都需要继续当前任务。普通 messages 不足以表达这些状态。
- 纸鸢求职助手的 Agent Chat，不是一个普通聊天框。它是整个 AI 求职助手的运行前台：用户在这里发起 JD 评估、简历查询、简历修改、画像更新、面试准备、Offer 评估、文件导出等任务；系统在这里展示模型回答、工具调用、流式状态、工具卡片、会话列表、跨页面任务入口和安全提示。
- 主要实现面：`src/components/agent/AgentChat.tsx`、`src/components/agent/SessionList.tsx`、`src/lib/agent/context.ts`、`src/lib/agent/run-ledger.ts`。

**输入/fixture**:
- 正例：带 runId/stepId/uiPayload 的长任务、面试绑定和图片-only 回合，用来验证“图片-only 回合先识别不走普通聊天”的成功路径。
- 反例：长 Markdown、symbol-only 输入、SSE 分片、上下文压缩边界，用来证明该 边界 eval 不会被相邻功能误判为通过。
- 记录字段：sessionId、runId、stepId、event type、message cap 和 active binding；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 AgentChat、SSE 解析、active run 恢复和结构化 uiPayload 卡片 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“图片-only 回合先识别不走普通聊天”对应动作，并记录请求、工具调用或页面状态。
3. 读取 AgentChat DOM 状态、SSE buffer 输出、run ledger 和恢复消息，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“图片-only 回合先识别不走普通聊天”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 Agent Chat会话状态与前端呈现系统 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/agent-image-loop.test.ts`: short-circuits image-only turns before generic chat

**缺口处理**: 这条 eval 的核心断言已经能从现有测试标题和相关实现中定位；后续只需要在行为变化时同步更新 fixture。

### E3. symbol-only 输入要求澄清

**状态**: 待补自动化，现有测试可作为落点

**项目依据**:
- 如果图片澄清明确指向 JD 评估，系统可以切换；如果只是模糊表达，就要保持当前任务或要求确认。
- 第三，普通聊天没有跨页面上下文。用户从 JD 库点击“去 Agent 评估”，Agent 页面要知道 `jdId`，并让工具读取对应 JD，而不是要求用户重新粘贴。
- 主要实现面：`src/components/agent/AgentChat.tsx`、`src/components/agent/SessionList.tsx`、`src/lib/agent/context.ts`、`src/lib/agent/run-ledger.ts`。

**输入/fixture**:
- 正例：带 runId/stepId/uiPayload 的长任务、面试绑定和图片-only 回合，用来验证“symbol-only 输入要求澄清”的成功路径。
- 反例：长 Markdown、symbol-only 输入、SSE 分片、上下文压缩边界，用来证明该 边界 eval 不会被相邻功能误判为通过。
- 记录字段：sessionId、runId、stepId、event type、message cap 和 active binding；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 AgentChat、SSE 解析、active run 恢复和结构化 uiPayload 卡片 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“symbol-only 输入要求澄清”对应动作，并记录请求、工具调用或页面状态。
3. 读取 AgentChat DOM 状态、SSE buffer 输出、run ledger 和恢复消息，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“symbol-only 输入要求澄清”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 Agent Chat会话状态与前端呈现系统 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/agent-chat-overflow.test.ts`: keeps long markdown output from creating page-level horizontal scroll
- `src/__tests__/agent-context-server.test.ts`: does not touch browser IndexedDB stores when a server user id is provided
- `src/__tests__/agent-chat-interview-binding.test.ts`: renders the active interview binding from persisted session state

**缺口处理**: 这是产品预期或实现边界，当前不能写成已完成事实；需要补自动化后再改状态。

### E4. 上下文压缩提示只在实际压缩时出现

**状态**: 待补自动化，现有测试可作为落点

**项目依据**:
- 第三，普通聊天没有跨页面上下文。用户从 JD 库点击“去 Agent 评估”，Agent 页面要知道 `jdId`，并让工具读取对应 JD，而不是要求用户重新粘贴。
- 这意味着会话保存的不只是聊天内容，还保存任务上下文。
- 主要实现面：`src/components/agent/AgentChat.tsx`、`src/components/agent/SessionList.tsx`、`src/lib/agent/context.ts`、`src/lib/agent/run-ledger.ts`。

**输入/fixture**:
- 正例：带 runId/stepId/uiPayload 的长任务、面试绑定和图片-only 回合，用来验证“上下文压缩提示只在实际压缩时出现”的成功路径。
- 反例：长 Markdown、symbol-only 输入、SSE 分片、上下文压缩边界，用来证明该 边界 eval 不会被相邻功能误判为通过。
- 记录字段：sessionId、runId、stepId、event type、message cap 和 active binding；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 AgentChat、SSE 解析、active run 恢复和结构化 uiPayload 卡片 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“上下文压缩提示只在实际压缩时出现”对应动作，并记录请求、工具调用或页面状态。
3. 读取 AgentChat DOM 状态、SSE buffer 输出、run ledger 和恢复消息，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“上下文压缩提示只在实际压缩时出现”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 Agent Chat会话状态与前端呈现系统 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/agent-chat-overflow.test.ts`: keeps long markdown output from creating page-level horizontal scroll
- `src/__tests__/agent-context-server.test.ts`: does not touch browser IndexedDB stores when a server user id is provided
- `src/__tests__/agent-chat-interview-binding.test.ts`: renders the active interview binding from persisted session state

**缺口处理**: 这是产品预期或实现边界，当前不能写成已完成事实；需要补自动化后再改状态。

## 回归 Evals

回归 evals 绑定项目里已经出现过或 feature 文档明确点名的风险，避免后续重构时把旧问题带回来。

### R1. recovery message 重复追加

**状态**: 已有自动化覆盖

**项目依据**:
- Agent 页面会把 `tool_result` 事件转成 tool message，并把 `uiPayload`、`data`、`success` 等信息持久化到当前会话。
- 主要实现面：`src/components/agent/AgentChat.tsx`、`src/components/agent/SessionList.tsx`、`src/lib/agent/context.ts`、`src/lib/agent/run-ledger.ts`。

**输入/fixture**:
- 正例：带 runId/stepId/uiPayload 的长任务、面试绑定和图片-only 回合，用来验证“recovery message 重复追加”的成功路径。
- 反例：长 Markdown、symbol-only 输入、SSE 分片、上下文压缩边界，用来证明该 回归 eval 不会被相邻功能误判为通过。
- 记录字段：sessionId、runId、stepId、event type、message cap 和 active binding；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 AgentChat、SSE 解析、active run 恢复和结构化 uiPayload 卡片 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“recovery message 重复追加”对应动作，并记录请求、工具调用或页面状态。
3. 读取 AgentChat DOM 状态、SSE buffer 输出、run ledger 和恢复消息，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“recovery message 重复追加”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 Agent Chat会话状态与前端呈现系统 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/agent-run-recovery-message.test.ts`: updates the existing recovery status message for the same run instead of appending duplicates

**缺口处理**: 这条 eval 的核心断言已经能从现有测试标题和相关实现中定位；后续只需要在行为变化时同步更新 fixture。

### R2. 面试下一题丢失 JD/report binding

**状态**: 已有自动化覆盖

**项目依据**:
- 例如面试状态会带有 `planSnapshot`，Agent 页面和 `AgentChat.tsx` 会展示 active interview binding，让用户知道当前面试绑定的是哪份 JD、哪份简历、哪家公司和岗位。
- 纸鸢求职助手的 Agent Chat，不是一个普通聊天框。它是整个 AI 求职助手的运行前台：用户在这里发起 JD 评估、简历查询、简历修改、画像更新、面试准备、Offer 评估、文件导出等任务；系统在这里展示模型回答、工具调用、流式状态、工具卡片、会话列表、跨页面任务入口和安全提示。
- 主要实现面：`src/components/agent/AgentChat.tsx`、`src/components/agent/SessionList.tsx`、`src/lib/agent/context.ts`、`src/lib/agent/run-ledger.ts`。

**输入/fixture**:
- 正例：带 runId/stepId/uiPayload 的长任务、面试绑定和图片-only 回合，用来验证“面试下一题丢失 JD/report binding”的成功路径。
- 反例：长 Markdown、symbol-only 输入、SSE 分片、上下文压缩边界，用来证明该 回归 eval 不会被相邻功能误判为通过。
- 记录字段：sessionId、runId、stepId、event type、message cap 和 active binding；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 AgentChat、SSE 解析、active run 恢复和结构化 uiPayload 卡片 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“面试下一题丢失 JD/report binding”对应动作，并记录请求、工具调用或页面状态。
3. 读取 AgentChat DOM 状态、SSE buffer 输出、run ledger 和恢复消息，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“面试下一题丢失 JD/report binding”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 Agent Chat会话状态与前端呈现系统 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/agent-chat-interview-binding.test.ts`: renders the active interview binding from persisted session state

**缺口处理**: 这条 eval 的核心断言已经能从现有测试标题和相关实现中定位；后续只需要在行为变化时同步更新 fixture。

### R3. 上一轮用户文本污染图片-only 回合

**状态**: 已有自动化覆盖

**项目依据**:
- 所以 `AgentChat总入口`、`Agent会话管理`、`跨页面Agent状态保持`、`前端可读性与工具卡片` 不应该拆成四个独立系统。它们共同组成一条产品链路：用户在 Agent 页面发起任务，前端把消息、图片、会话、任务锁、SSE 事件和工具结果组织成一个可继续的求职工作流。
- - 用户不需要知道该调用哪个工具，前端负责把消息交给 Agent 运行链路。 - 长任务必须有流式反馈，不能让用户盯着空白页面。 - 工具调用结果要以卡片或结构化信息呈现，而不是只显示一大段 JSON。 - 会话要能保存、切换、删除、置顶和恢复。 - 从 JD 库、Offer 页面、面试入口跳到 Agent 时，要保留目标对象。 - 面试、图片识别、简历提案...
- 主要实现面：`src/components/agent/AgentChat.tsx`、`src/components/agent/SessionList.tsx`、`src/lib/agent/context.ts`、`src/lib/agent/run-ledger.ts`。

**输入/fixture**:
- 正例：带 runId/stepId/uiPayload 的长任务、面试绑定和图片-only 回合，用来验证“上一轮用户文本污染图片-only 回合”的成功路径。
- 反例：长 Markdown、symbol-only 输入、SSE 分片、上下文压缩边界，用来证明该 回归 eval 不会被相邻功能误判为通过。
- 记录字段：sessionId、runId、stepId、event type、message cap 和 active binding；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 AgentChat、SSE 解析、active run 恢复和结构化 uiPayload 卡片 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“上一轮用户文本污染图片-only 回合”对应动作，并记录请求、工具调用或页面状态。
3. 读取 AgentChat DOM 状态、SSE buffer 输出、run ledger 和恢复消息，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“上一轮用户文本污染图片-only 回合”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 Agent Chat会话状态与前端呈现系统 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/agent-image-loop.test.ts`: short-circuits image-only turns before generic chat

**缺口处理**: 这条 eval 的核心断言已经能从现有测试标题和相关实现中定位；后续只需要在行为变化时同步更新 fixture。

### R4. 请求达到 message cap 时误报压缩

**状态**: 已有自动化覆盖

**项目依据**:
- Agent 页面会把 `tool_result` 事件转成 tool message，并把 `uiPayload`、`data`、`success` 等信息持久化到当前会话。
- 主要实现面：`src/components/agent/AgentChat.tsx`、`src/components/agent/SessionList.tsx`、`src/lib/agent/context.ts`、`src/lib/agent/run-ledger.ts`。

**输入/fixture**:
- 正例：带 runId/stepId/uiPayload 的长任务、面试绑定和图片-only 回合，用来验证“请求达到 message cap 时误报压缩”的成功路径。
- 反例：长 Markdown、symbol-only 输入、SSE 分片、上下文压缩边界，用来证明该 回归 eval 不会被相邻功能误判为通过。
- 记录字段：sessionId、runId、stepId、event type、message cap 和 active binding；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 AgentChat、SSE 解析、active run 恢复和结构化 uiPayload 卡片 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“请求达到 message cap 时误报压缩”对应动作，并记录请求、工具调用或页面状态。
3. 读取 AgentChat DOM 状态、SSE buffer 输出、run ledger 和恢复消息，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“请求达到 message cap 时误报压缩”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 Agent Chat会话状态与前端呈现系统 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/agent-image-loop.test.ts`: does not show compression just because the outbound request hits the message cap

**缺口处理**: 这条 eval 的核心断言已经能从现有测试标题和相关实现中定位；后续只需要在行为变化时同步更新 fixture。

## 测试文件映射

- `src/__tests__/agent-chat-overflow.test.ts`
  - keeps long markdown output from creating page-level horizontal scroll
- `src/__tests__/agent-context-server.test.ts`
  - does not touch browser IndexedDB stores when a server user id is provided
- `src/__tests__/agent-chat-interview-binding.test.ts`
  - renders the active interview binding from persisted session state
- `src/__tests__/agent-run-recovery-message.test.ts`
  - updates the existing recovery status message for the same run instead of appending duplicates
  - describes running recovery as a status check, not a repeated execution
- `src/__tests__/agent-image-loop.test.ts`
  - short-circuits image-only turns before generic chat
  - does not reuse stale prior user text as the active instruction for image-only turns
  - does not inject latest user images when JD text is already present
  - blocks evaluation tools when the latest user turn is symbol-only
  - announces context compression before oversized context is rewritten
  - does not show compression just because the outbound request hits the message cap
  - keeps session memory digest gated until the fifth user message
  - announces session memory digest only for the first generated digest
- `src/__tests__/agent-chat-job-discovery-ui.test.ts`
  - renders structured job discovery payloads as dedicated cards


## 最小上线门槛

- 至少所有 B 类主链路 eval 有自动化覆盖或明确的人工复跑脚本。
- E 类边界不能只靠 UI 文案判断，必须能证明权限、归属、降级或拒绝行为。
- R 类回归要绑定曾经出过问题的输入或测试名，避免“修过但没有防回归”。
- Agent Chat会话状态与前端呈现系统 的写入、导出、外部调用或 Agent 工具成功态，都必须有读回、hash、run evidence 或等价证据。
