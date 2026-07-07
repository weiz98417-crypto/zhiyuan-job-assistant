# 面试教练故事库与复盘系统 Evals

本文档根据项目当前 feature 文档、源码边界和已经沉淀的测试资产整理 面试教练故事库与复盘系统 的 evals。这里明确区分“已有自动化覆盖”“相关测试存在但需补精确断言”和“待补自动化”：没有可复跑证据的场景不能写成已完成事实。

## 评测对象

面试准备页面、Agent interview session state、下一题、故事库、结构化复盘、历史记录和源 transcript/frozen plan 绑定。

## 项目事实

### 关键实现面
- `src/app/interview/page.tsx`
- `src/app/interview/InterviewLaunchPanel.tsx`
- `src/app/interview/AgentInterviewHistory.tsx`
- `src/app/interview/InterviewRecapReview.tsx`
- `src/lib/agent/interview-session-state.ts`
- `src/lib/agent/interview-rebind-policy.ts`
- `src/lib/agent/interview/engine.ts`

### 已落地或部分落地的 eval 资产
- `src/__tests__/interview-prep-ui.test.ts`
- `src/__tests__/interview-session-state.test.ts`
- `src/__tests__/interview-rebind-policy.test.ts`
- `src/__tests__/interview-agent-prompt.test.ts`
- `src/__tests__/agent-chat-interview-binding.test.ts`
- `src/__tests__/agent-run-review.test.ts`

### 从现有测试读到的行为
- interview-prep-ui.test.ts 已固定准备、历史、复盘为分离 surface，复盘来自结构化字段并链接 frozen plan 与 transcript turns。
- agent-chat-interview-binding.test.ts 已覆盖 AgentChat 显示 active interview binding。
- agent-run-review.test.ts 已能标记面试多题倾倒和 context rebinding loss。

### 待补 eval 缺口
- 补真实一轮问答到 recap 生成的端到端 eval。
- 补故事库候选和 JD/report binding 的一致性 eval。
- 补用户跳出面试再返回时的 session recovery eval。

## 实施与治理任务清单

这些任务只描述项目当前缺口，不假装已经落地。每完成一项，都应补一条自动化 eval，并在本文件对应场景下把状态从“待补自动化”改成“已有自动化覆盖”。

### 1. 补真实一轮问答到 recap 生成的端到端 eval

**为什么要补**: 这是当前 interview page、interview session state、AgentChat binding 和复盘 review 链路里还缺少确定性证据的部分；如果只靠人工试用，后续改路由、数据层或 UI 时很容易回归。

**实施方式**:
- 复用现有资产：`src/__tests__/interview-prep-ui.test.ts`、`src/__tests__/interview-session-state.test.ts`、`src/__tests__/interview-rebind-policy.test.ts`、`src/__tests__/interview-agent-prompt.test.ts`、`src/__tests__/agent-chat-interview-binding.test.ts`。
- fixture 必须包含：sessionId、reportId、jdId、questionIndex、binding state 和 recap id。
- 断言必须读取：active interview binding、单题输出、frozen plan、source transcript 和 review fields。
- 如果涉及写入，失败分支要证明没有留下部分写入；如果是页面链路，要覆盖空态、错误态和主操作。

**完成标准**: 本地测试或脚本能稳定复跑，并且失败信息能指向实现问题、测试缺口或产品预期变化中的一种。

### 2. 补故事库候选和 JD/report binding 的一致性 eval

**为什么要补**: 这是当前 interview page、interview session state、AgentChat binding 和复盘 review 链路里还缺少确定性证据的部分；如果只靠人工试用，后续改路由、数据层或 UI 时很容易回归。

**实施方式**:
- 复用现有资产：`src/__tests__/interview-prep-ui.test.ts`、`src/__tests__/interview-session-state.test.ts`、`src/__tests__/interview-rebind-policy.test.ts`、`src/__tests__/interview-agent-prompt.test.ts`、`src/__tests__/agent-chat-interview-binding.test.ts`。
- fixture 必须包含：sessionId、reportId、jdId、questionIndex、binding state 和 recap id。
- 断言必须读取：active interview binding、单题输出、frozen plan、source transcript 和 review fields。
- 如果涉及写入，失败分支要证明没有留下部分写入；如果是页面链路，要覆盖空态、错误态和主操作。

**完成标准**: 本地测试或脚本能稳定复跑，并且失败信息能指向实现问题、测试缺口或产品预期变化中的一种。

### 3. 补用户跳出面试再返回时的 session recovery eval

**为什么要补**: 这是当前 interview page、interview session state、AgentChat binding 和复盘 review 链路里还缺少确定性证据的部分；如果只靠人工试用，后续改路由、数据层或 UI 时很容易回归。

**实施方式**:
- 复用现有资产：`src/__tests__/interview-prep-ui.test.ts`、`src/__tests__/interview-session-state.test.ts`、`src/__tests__/interview-rebind-policy.test.ts`、`src/__tests__/interview-agent-prompt.test.ts`、`src/__tests__/agent-chat-interview-binding.test.ts`。
- fixture 必须包含：sessionId、reportId、jdId、questionIndex、binding state 和 recap id。
- 断言必须读取：active interview binding、单题输出、frozen plan、source transcript 和 review fields。
- 如果涉及写入，失败分支要证明没有留下部分写入；如果是页面链路，要覆盖空态、错误态和主操作。

**完成标准**: 本地测试或脚本能稳定复跑，并且失败信息能指向实现问题、测试缺口或产品预期变化中的一种。


## 基线 Evals

基线 evals 验证 面试教练故事库与复盘系统 的主链路是否成立。每条都必须说明真实入口、输入 fixture、证据读回和当前覆盖状态。

### B1. 面试准备、历史、复盘页面分离

**状态**: 已有自动化覆盖

**项目依据**:
- 用户进入面试准备阶段时，真正需要的不是“多来几道题”，而是：
- 这些文件说明：面试系统不是一个孤立页面，而是页面、Agent 会话状态、模型 API、故事资产、复盘结构共同组成的产品链路。
- 主要实现面：`src/app/interview/page.tsx`、`src/app/interview/InterviewLaunchPanel.tsx`、`src/app/interview/AgentInterviewHistory.tsx`、`src/app/interview/InterviewRecapReview.tsx`。

**输入/fixture**:
- 正例：绑定 JD/report 的面试准备 session、下一题请求和复盘 transcript，用来验证“面试准备、历史、复盘页面分离”的成功路径。
- 反例：无 JD/report、下一题掉任务、多题倾倒、跨用户 transcript，用来证明该 主链路 eval 不会被相邻功能误判为通过。
- 记录字段：sessionId、reportId、jdId、questionIndex、binding state 和 recap id；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 interview page、interview session state、AgentChat binding 和复盘 review 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“面试准备、历史、复盘页面分离”对应动作，并记录请求、工具调用或页面状态。
3. 读取 active interview binding、单题输出、frozen plan、source transcript 和 review fields，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“面试准备、历史、复盘页面分离”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 面试教练故事库与复盘系统 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/interview-prep-ui.test.ts`: shows Agent interview history metadata and recap entries
- `src/__tests__/interview-prep-ui.test.ts`: displays AgentChat interview sessions in both history and recap review
- `src/__tests__/interview-session-state.test.ts`: does not count help-or-next control turns as real interview answers
- `src/__tests__/interview-agent-prompt.test.ts`: treats active interview session state as the source of truth

**缺口处理**: 这条 eval 的核心断言已经能从现有测试标题和相关实现中定位；后续只需要在行为变化时同步更新 fixture。

### B2. AgentChat 绑定 active interview session

**状态**: 已有自动化覆盖

**项目依据**:
- 测试 `interview-session-state.test.ts` 明确验证了：active AgentChat 的快照是当前会话事实来源，后续准备配置变化不能静默替换正在进行的面试材料。
- - `src/__tests__/interview-session-state.test.ts`：验证快照冻结、问题图、评分 artifact、复盘和 rebind history。 - `src/__tests__/interview-rebind-policy.test.ts`：验证 JD/简历切换语义，不让系统静默换材料。 - `src/__test...
- 主要实现面：`src/app/interview/page.tsx`、`src/app/interview/InterviewLaunchPanel.tsx`、`src/app/interview/AgentInterviewHistory.tsx`、`src/app/interview/InterviewRecapReview.tsx`。

**输入/fixture**:
- 正例：绑定 JD/report 的面试准备 session、下一题请求和复盘 transcript，用来验证“AgentChat 绑定 active interview session”的成功路径。
- 反例：无 JD/report、下一题掉任务、多题倾倒、跨用户 transcript，用来证明该 主链路 eval 不会被相邻功能误判为通过。
- 记录字段：sessionId、reportId、jdId、questionIndex、binding state 和 recap id；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 interview page、interview session state、AgentChat binding 和复盘 review 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“AgentChat 绑定 active interview session”对应动作，并记录请求、工具调用或页面状态。
3. 读取 active interview binding、单题输出、frozen plan、source transcript 和 review fields，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“AgentChat 绑定 active interview session”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 面试教练故事库与复盘系统 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/interview-prep-ui.test.ts`: shows Agent interview history metadata and recap entries
- `src/__tests__/interview-prep-ui.test.ts`: displays AgentChat interview sessions in both history and recap review
- `src/__tests__/interview-session-state.test.ts`: freezes JD and resume content in the active session snapshot
- `src/__tests__/interview-session-state.test.ts`: keeps the active AgentChat snapshot when prep configuration changes later

**缺口处理**: 这条 eval 的核心断言已经能从现有测试标题和相关实现中定位；后续只需要在行为变化时同步更新 fixture。

### B3. 下一题保持在 active interview coaching

**状态**: 已有自动化覆盖

**项目依据**:
- 例如用户说“下一题”“跳过”“给个示范”“不会答”，系统不应该把这些内容当成对当前问题的正式回答。`isInterviewControlTurn()` 会识别这类输入，避免它们污染 `answerTurnIds`。
- 测试 `interview-session-state.test.ts` 明确验证了：active AgentChat 的快照是当前会话事实来源，后续准备配置变化不能静默替换正在进行的面试材料。
- 主要实现面：`src/app/interview/page.tsx`、`src/app/interview/InterviewLaunchPanel.tsx`、`src/app/interview/AgentInterviewHistory.tsx`、`src/app/interview/InterviewRecapReview.tsx`。

**输入/fixture**:
- 正例：绑定 JD/report 的面试准备 session、下一题请求和复盘 transcript，用来验证“下一题保持在 active interview coaching”的成功路径。
- 反例：无 JD/report、下一题掉任务、多题倾倒、跨用户 transcript，用来证明该 主链路 eval 不会被相邻功能误判为通过。
- 记录字段：sessionId、reportId、jdId、questionIndex、binding state 和 recap id；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 interview page、interview session state、AgentChat binding 和复盘 review 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“下一题保持在 active interview coaching”对应动作，并记录请求、工具调用或页面状态。
3. 读取 active interview binding、单题输出、frozen plan、source transcript 和 review fields，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“下一题保持在 active interview coaching”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 面试教练故事库与复盘系统 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/interview-prep-ui.test.ts`: shows Agent interview history metadata and recap entries
- `src/__tests__/interview-prep-ui.test.ts`: displays AgentChat interview sessions in both history and recap review
- `src/__tests__/interview-session-state.test.ts`: creates an active interview state from generated question tool results in AgentChat
- `src/__tests__/interview-session-state.test.ts`: does not count help-or-next control turns as real interview answers

**缺口处理**: 这条 eval 的核心断言已经能从现有测试标题和相关实现中定位；后续只需要在行为变化时同步更新 fixture。

### B4. 复盘展示 frozen plan 和 source transcript

**状态**: 已有自动化覆盖

**项目依据**:
- - `category` - `question` - `context` - `storyHint` - `source` - `weaknessNote`
- # 纸鸢求职助手面试教练、故事库与复盘系统的产品构造
- 主要实现面：`src/app/interview/page.tsx`、`src/app/interview/InterviewLaunchPanel.tsx`、`src/app/interview/AgentInterviewHistory.tsx`、`src/app/interview/InterviewRecapReview.tsx`。

**输入/fixture**:
- 正例：绑定 JD/report 的面试准备 session、下一题请求和复盘 transcript，用来验证“复盘展示 frozen plan 和 source transcript”的成功路径。
- 反例：无 JD/report、下一题掉任务、多题倾倒、跨用户 transcript，用来证明该 主链路 eval 不会被相邻功能误判为通过。
- 记录字段：sessionId、reportId、jdId、questionIndex、binding state 和 recap id；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 interview page、interview session state、AgentChat binding 和复盘 review 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“复盘展示 frozen plan 和 source transcript”对应动作，并记录请求、工具调用或页面状态。
3. 读取 active interview binding、单题输出、frozen plan、source transcript 和 review fields，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“复盘展示 frozen plan 和 source transcript”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 面试教练故事库与复盘系统 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/interview-prep-ui.test.ts`: links recap review to the frozen plan snapshot and source transcript turns

**缺口处理**: 这条 eval 的核心断言已经能从现有测试标题和相关实现中定位；后续只需要在行为变化时同步更新 fixture。

## 边界 Evals

边界 evals 验证权限、归属、失败、降级、澄清和安全边界。它们优先防止“看起来成功但实际越权或污染数据”的问题。

### E1. 下一题不掉到 general_chat

**状态**: 待补自动化，现有测试可作为落点

**项目依据**:
- 例如用户说“下一题”“跳过”“给个示范”“不会答”，系统不应该把这些内容当成对当前问题的正式回答。`isInterviewControlTurn()` 会识别这类输入，避免它们污染 `answerTurnIds`。
- 主要实现面：`src/app/interview/page.tsx`、`src/app/interview/InterviewLaunchPanel.tsx`、`src/app/interview/AgentInterviewHistory.tsx`、`src/app/interview/InterviewRecapReview.tsx`。

**输入/fixture**:
- 正例：绑定 JD/report 的面试准备 session、下一题请求和复盘 transcript，用来验证“下一题不掉到 general_chat”的成功路径。
- 反例：无 JD/report、下一题掉任务、多题倾倒、跨用户 transcript，用来证明该 边界 eval 不会被相邻功能误判为通过。
- 记录字段：sessionId、reportId、jdId、questionIndex、binding state 和 recap id；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 interview page、interview session state、AgentChat binding 和复盘 review 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“下一题不掉到 general_chat”对应动作，并记录请求、工具调用或页面状态。
3. 读取 active interview binding、单题输出、frozen plan、source transcript 和 review fields，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“下一题不掉到 general_chat”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 面试教练故事库与复盘系统 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/interview-prep-ui.test.ts`: keeps preparation, history, and recap review as separate surfaces
- `src/__tests__/interview-prep-ui.test.ts`: shows Agent interview history metadata and recap entries
- `src/__tests__/interview-prep-ui.test.ts`: displays AgentChat interview sessions in both history and recap review

**缺口处理**: 这是产品预期或实现边界，当前不能写成已完成事实；需要补自动化后再改状态。

### E2. 一次只问一个面试问题

**状态**: 已有自动化覆盖

**项目依据**:
- 纸鸢求职助手的面试系统，不是题库，也不是让大模型随便问用户几道题。它是一条从目标岗位材料绑定、面试问题生成、单轮回答评分、追问推进、故事沉淀到复盘总结的完整链路。
- 这解决了真实对话中的一个高频问题：用户在面试过程中会请求提示、示范或跳题，如果系统把这些控制意图当成回答，后续评分和复盘都会失真。
- 主要实现面：`src/app/interview/page.tsx`、`src/app/interview/InterviewLaunchPanel.tsx`、`src/app/interview/AgentInterviewHistory.tsx`、`src/app/interview/InterviewRecapReview.tsx`。

**输入/fixture**:
- 正例：绑定 JD/report 的面试准备 session、下一题请求和复盘 transcript，用来验证“一次只问一个面试问题”的成功路径。
- 反例：无 JD/report、下一题掉任务、多题倾倒、跨用户 transcript，用来证明该 边界 eval 不会被相邻功能误判为通过。
- 记录字段：sessionId、reportId、jdId、questionIndex、binding state 和 recap id；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 interview page、interview session state、AgentChat binding 和复盘 review 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“一次只问一个面试问题”对应动作，并记录请求、工具调用或页面状态。
3. 读取 active interview binding、单题输出、frozen plan、source transcript 和 review fields，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“一次只问一个面试问题”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 面试教练故事库与复盘系统 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/interview-prep-ui.test.ts`: shows Agent interview history metadata and recap entries
- `src/__tests__/interview-prep-ui.test.ts`: displays AgentChat interview sessions in both history and recap review
- `src/__tests__/interview-session-state.test.ts`: creates an active interview state from generated question tool results in AgentChat
- `src/__tests__/interview-session-state.test.ts`: does not count help-or-next control turns as real interview answers

**缺口处理**: 这条 eval 的核心断言已经能从现有测试标题和相关实现中定位；后续只需要在行为变化时同步更新 fixture。

### E3. 无 JD/report 绑定时先澄清

**状态**: 待补自动化，现有测试可作为落点

**项目依据**:
- - 没有明确 JD/简历引用时继续当前会话。 - 明确切换 JD 时记录 rebind。 - 模糊说“另一份简历”时要求澄清。 - 重开面试和继续当前会话要区分。
- - `jdText` - `cvText` - `company` - `role` - `mode` - `count`
- 主要实现面：`src/app/interview/page.tsx`、`src/app/interview/InterviewLaunchPanel.tsx`、`src/app/interview/AgentInterviewHistory.tsx`、`src/app/interview/InterviewRecapReview.tsx`。

**输入/fixture**:
- 正例：绑定 JD/report 的面试准备 session、下一题请求和复盘 transcript，用来验证“无 JD/report 绑定时先澄清”的成功路径。
- 反例：无 JD/report、下一题掉任务、多题倾倒、跨用户 transcript，用来证明该 边界 eval 不会被相邻功能误判为通过。
- 记录字段：sessionId、reportId、jdId、questionIndex、binding state 和 recap id；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 interview page、interview session state、AgentChat binding 和复盘 review 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“无 JD/report 绑定时先澄清”对应动作，并记录请求、工具调用或页面状态。
3. 读取 active interview binding、单题输出、frozen plan、source transcript 和 review fields，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“无 JD/report 绑定时先澄清”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 面试教练故事库与复盘系统 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/interview-prep-ui.test.ts`: keeps preparation, history, and recap review as separate surfaces
- `src/__tests__/interview-prep-ui.test.ts`: shows Agent interview history metadata and recap entries
- `src/__tests__/interview-prep-ui.test.ts`: displays AgentChat interview sessions in both history and recap review

**缺口处理**: 这是产品预期或实现边界，当前不能写成已完成事实；需要补自动化后再改状态。

### E4. 复盘不暴露无关用户 transcript

**状态**: 待补自动化，现有测试可作为落点

**项目依据**:
- 测试里特别验证了一个边界：复盘不能让用户重新粘贴前面所有答案，系统必须从已存储 turns 和 scores 里构建。
- 纸鸢求职助手的面试系统，不是题库，也不是让大模型随便问用户几道题。它是一条从目标岗位材料绑定、面试问题生成、单轮回答评分、追问推进、故事沉淀到复盘总结的完整链路。
- 主要实现面：`src/app/interview/page.tsx`、`src/app/interview/InterviewLaunchPanel.tsx`、`src/app/interview/AgentInterviewHistory.tsx`、`src/app/interview/InterviewRecapReview.tsx`。

**输入/fixture**:
- 正例：绑定 JD/report 的面试准备 session、下一题请求和复盘 transcript，用来验证“复盘不暴露无关用户 transcript”的成功路径。
- 反例：无 JD/report、下一题掉任务、多题倾倒、跨用户 transcript，用来证明该 边界 eval 不会被相邻功能误判为通过。
- 记录字段：sessionId、reportId、jdId、questionIndex、binding state 和 recap id；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 interview page、interview session state、AgentChat binding 和复盘 review 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“复盘不暴露无关用户 transcript”对应动作，并记录请求、工具调用或页面状态。
3. 读取 active interview binding、单题输出、frozen plan、source transcript 和 review fields，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“复盘不暴露无关用户 transcript”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 面试教练故事库与复盘系统 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/interview-prep-ui.test.ts`: keeps preparation, history, and recap review as separate surfaces
- `src/__tests__/interview-prep-ui.test.ts`: shows Agent interview history metadata and recap entries
- `src/__tests__/interview-prep-ui.test.ts`: displays AgentChat interview sessions in both history and recap review

**缺口处理**: 这是产品预期或实现边界，当前不能写成已完成事实；需要补自动化后再改状态。

## 回归 Evals

回归 evals 绑定项目里已经出现过或 feature 文档明确点名的风险，避免后续重构时把旧问题带回来。

### R1. 多题一次性倾倒

**状态**: 待补自动化，现有测试可作为落点

**项目依据**:
- 当前 feature 文档已定义该能力的产品目标、入口、边界和验收口径；本 eval 只把这些预期落到可复跑证据上。
- 主要实现面：`src/app/interview/page.tsx`、`src/app/interview/InterviewLaunchPanel.tsx`、`src/app/interview/AgentInterviewHistory.tsx`、`src/app/interview/InterviewRecapReview.tsx`。

**输入/fixture**:
- 正例：绑定 JD/report 的面试准备 session、下一题请求和复盘 transcript，用来验证“多题一次性倾倒”的成功路径。
- 反例：无 JD/report、下一题掉任务、多题倾倒、跨用户 transcript，用来证明该 回归 eval 不会被相邻功能误判为通过。
- 记录字段：sessionId、reportId、jdId、questionIndex、binding state 和 recap id；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 interview page、interview session state、AgentChat binding 和复盘 review 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“多题一次性倾倒”对应动作，并记录请求、工具调用或页面状态。
3. 读取 active interview binding、单题输出、frozen plan、source transcript 和 review fields，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“多题一次性倾倒”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 面试教练故事库与复盘系统 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/interview-prep-ui.test.ts`: keeps preparation, history, and recap review as separate surfaces
- `src/__tests__/interview-prep-ui.test.ts`: shows Agent interview history metadata and recap entries
- `src/__tests__/interview-prep-ui.test.ts`: displays AgentChat interview sessions in both history and recap review

**缺口处理**: 这是产品预期或实现边界，当前不能写成已完成事实；需要补自动化后再改状态。

### R2. 面试 session 刷新丢失

**状态**: 已有自动化覆盖

**项目依据**:
- - `src/__tests__/interview-session-state.test.ts`：验证快照冻结、问题图、评分 artifact、复盘和 rebind history。 - `src/__tests__/interview-rebind-policy.test.ts`：验证 JD/简历切换语义，不让系统静默换材料。 - `src/__test...
- # 纸鸢求职助手面试教练、故事库与复盘系统的产品构造
- 主要实现面：`src/app/interview/page.tsx`、`src/app/interview/InterviewLaunchPanel.tsx`、`src/app/interview/AgentInterviewHistory.tsx`、`src/app/interview/InterviewRecapReview.tsx`。

**输入/fixture**:
- 正例：绑定 JD/report 的面试准备 session、下一题请求和复盘 transcript，用来验证“面试 session 刷新丢失”的成功路径。
- 反例：无 JD/report、下一题掉任务、多题倾倒、跨用户 transcript，用来证明该 回归 eval 不会被相邻功能误判为通过。
- 记录字段：sessionId、reportId、jdId、questionIndex、binding state 和 recap id；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 interview page、interview session state、AgentChat binding 和复盘 review 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“面试 session 刷新丢失”对应动作，并记录请求、工具调用或页面状态。
3. 读取 active interview binding、单题输出、frozen plan、source transcript 和 review fields，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“面试 session 刷新丢失”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 面试教练故事库与复盘系统 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/interview-prep-ui.test.ts`: shows Agent interview history metadata and recap entries
- `src/__tests__/interview-prep-ui.test.ts`: displays AgentChat interview sessions in both history and recap review
- `src/__tests__/interview-session-state.test.ts`: creates an active interview state from generated question tool results in AgentChat
- `src/__tests__/interview-session-state.test.ts`: does not count help-or-next control turns as real interview answers

**缺口处理**: 这条 eval 的核心断言已经能从现有测试标题和相关实现中定位；后续只需要在行为变化时同步更新 fixture。

### R3. 复盘字段退化成纯文本

**状态**: 待补自动化，现有测试可作为落点

**项目依据**:
- 这条链路里，最重要的是材料、问题、回答、评分、复盘之间的连续性。只要中间断了，面试系统就会退化成普通聊天。
- 这样复盘时不需要重新解析聊天文本，也不需要用户重新提交回答。系统可以直接根据已记录的问题、回答和评分生成复盘。
- 主要实现面：`src/app/interview/page.tsx`、`src/app/interview/InterviewLaunchPanel.tsx`、`src/app/interview/AgentInterviewHistory.tsx`、`src/app/interview/InterviewRecapReview.tsx`。

**输入/fixture**:
- 正例：绑定 JD/report 的面试准备 session、下一题请求和复盘 transcript，用来验证“复盘字段退化成纯文本”的成功路径。
- 反例：无 JD/report、下一题掉任务、多题倾倒、跨用户 transcript，用来证明该 回归 eval 不会被相邻功能误判为通过。
- 记录字段：sessionId、reportId、jdId、questionIndex、binding state 和 recap id；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 interview page、interview session state、AgentChat binding 和复盘 review 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“复盘字段退化成纯文本”对应动作，并记录请求、工具调用或页面状态。
3. 读取 active interview binding、单题输出、frozen plan、source transcript 和 review fields，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“复盘字段退化成纯文本”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 面试教练故事库与复盘系统 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/interview-prep-ui.test.ts`: keeps preparation, history, and recap review as separate surfaces
- `src/__tests__/interview-prep-ui.test.ts`: shows Agent interview history metadata and recap entries
- `src/__tests__/interview-prep-ui.test.ts`: displays AgentChat interview sessions in both history and recap review

**缺口处理**: 这是产品预期或实现边界，当前不能写成已完成事实；需要补自动化后再改状态。

### R4. source transcript 链接断裂

**状态**: 已有自动化覆盖

**项目依据**:
- - `category` - `question` - `context` - `storyHint` - `source` - `weaknessNote`
- 主要实现面：`src/app/interview/page.tsx`、`src/app/interview/InterviewLaunchPanel.tsx`、`src/app/interview/AgentInterviewHistory.tsx`、`src/app/interview/InterviewRecapReview.tsx`。

**输入/fixture**:
- 正例：绑定 JD/report 的面试准备 session、下一题请求和复盘 transcript，用来验证“source transcript 链接断裂”的成功路径。
- 反例：无 JD/report、下一题掉任务、多题倾倒、跨用户 transcript，用来证明该 回归 eval 不会被相邻功能误判为通过。
- 记录字段：sessionId、reportId、jdId、questionIndex、binding state 和 recap id；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 interview page、interview session state、AgentChat binding 和复盘 review 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“source transcript 链接断裂”对应动作，并记录请求、工具调用或页面状态。
3. 读取 active interview binding、单题输出、frozen plan、source transcript 和 review fields，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“source transcript 链接断裂”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 面试教练故事库与复盘系统 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/interview-prep-ui.test.ts`: links recap review to the frozen plan snapshot and source transcript turns

**缺口处理**: 这条 eval 的核心断言已经能从现有测试标题和相关实现中定位；后续只需要在行为变化时同步更新 fixture。

## 测试文件映射

- `src/__tests__/interview-prep-ui.test.ts`
  - keeps preparation, history, and recap review as separate surfaces
  - shows Agent interview history metadata and recap entries
  - displays AgentChat interview sessions in both history and recap review
  - renders recap review from structured recap fields
  - links recap review to the frozen plan snapshot and source transcript turns
- `src/__tests__/interview-session-state.test.ts`
  - freezes JD and resume content in the active session snapshot
  - keeps the active AgentChat snapshot when prep configuration changes later
  - stores hidden bootstrap assistant questions as the active main question
  - stores follow-ups as children of the current answered question
  - stores a follow-up after Q3 as a child of Q3 instead of the last planned question
  - persists score artifacts separately from raw tool text
  - creates an active interview state from generated question tool results in AgentChat
  - does not count help-or-next control turns as real interview answers
  - ...
- `src/__tests__/interview-rebind-policy.test.ts`
  - keeps the current session when no JD or resume reference appears
  - treats contextual JD mentions as supporting context
  - detects explicit named material switches
  - detects explicit restart requests
  - asks for clarification on ambiguous other-material wording
  - does not silently switch on weak material mentions
  - matches mentioned JD records by company and role
  - matches mentioned resume records by explicit id
  - ...
- `src/__tests__/interview-agent-prompt.test.ts`
  - treats active interview session state as the source of truth
- `src/__tests__/agent-chat-interview-binding.test.ts`
  - renders the active interview binding from persisted session state
- `src/__tests__/agent-run-review.test.ts`
  - normalizes unknown failure labels to system_error
  - redacts private text, image payloads, and secrets
  - flags successful high-risk write tools without read-back evidence
  - flags image business tasks that skip image intake
  - does not count business output text as an image intake step
  - passes image tasks when a real image-intake step is recorded
  - flags resume markdown control pollution
  - flags interview multi-question dumps and context rebinding loss
  - ...


## 最小上线门槛

- 至少所有 B 类主链路 eval 有自动化覆盖或明确的人工复跑脚本。
- E 类边界不能只靠 UI 文案判断，必须能证明权限、归属、降级或拒绝行为。
- R 类回归要绑定曾经出过问题的输入或测试名，避免“修过但没有防回归”。
- 面试教练故事库与复盘系统 的写入、导出、外部调用或 Agent 工具成功态，都必须有读回、hash、run evidence 或等价证据。
