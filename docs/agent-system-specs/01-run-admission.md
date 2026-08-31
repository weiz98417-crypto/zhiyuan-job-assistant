# Spec 01: Server-Owned Run Admission

**Target label:** `ready-for-agent`  
**Depends on:** ADR-0017 and the project domain glossary

## Problem Statement

当前同一 Conversation Turn 可以被浏览器、页面参数、规则分类、LLM 分类、Guided Session 和结果卡分别解释，导致 Primary Goal、Run Contract、Agent implementation 与 Conversation 关系发生漂移。求职者可能完成了职业定位、面试回答或 Offer 后续问题，却得到错误的 Task Program、无 Contract 的 `general_chat` Run，或被隐式新建 Conversation。

## Solution

建立服务端唯一权威的 **Run Admission** seam。所有 Conversation Turn 和结构化用户动作由 adapter 提交，Admission 重新加载 Agent Conversation、active Agent Run 和 Artifact 事实，产出可审计的 Admission Decision：继续当前 Run、创建新 Run、请求澄清、延迟任务切换、拒绝或创建新 Conversation。它同时选择 Task Program、构造 Run Contract，并以 shadow mode 验证与旧链路的差异。

## User Stories

1. 作为求职者，我希望“帮我定位职业方向，但不要更新画像”仍被识别为职业定位，从而得到正确的只读引导。
2. 作为求职者，我希望补充简历、批准 Gate 或回答模拟面试时继续原 Agent Run，从而不会丢失进度或重开任务。
3. 作为求职者，我希望明确提出新目标时，系统能安全暂停旧任务并在同一 Agent Conversation 中创建新 Run，从而可随时恢复旧任务。
4. 作为求职者，我希望 Offer Report 的解释、谈判建议和 HR 问询使用已有报告，而不重新评估 Offer，从而避免重复工作。
5. 作为求职者，我希望从岗位发现结果卡点击评估时保持同一身份、Artifact 归属和正确 Conversation，从而不会出现跨用户或跨会话结果。
6. 作为求职者，我希望目标或材料不充分时先收到明确澄清，而不是发生隐式写入或错误执行。
7. 作为运营人员，我希望每次路由都保留 Primary Goal、Constraints、Artifact References 和判定证据，从而能解释异常行为。
8. 作为实现 Agent，我希望所有入口使用同一个 Admission contract，从而不必在页面、API 和卡片中复制任务判断规则。

## Implementation Decisions

- Run Admission 是唯一可以创建、续跑、暂停或拒绝 Agent Run 的领域 module；所有页面、结果卡、工作台和 API 入口只是传输原始 Turn、显式 Artifact 选择和不可信来源提示的 adapter。
- Admission 重新读取 Agent Conversation、当前 active Agent Run、用户身份、Artifact owner、版本和 stale 状态；客户端的 `taskType`、`agentId`、Run Contract、allowed tools 与 `newSession` 语义均不可作为权威事实。
- 每个 Decision 必须分别表达 Primary Goal、Constraints、Artifact References、Effect Expectation、Conversation Relation、判定证据和置信度；低置信度或缺少必要材料时产生 Clarify，而非猜测执行。
- Decision 类型固定为 Continue Current Run、Start New Run、Clarify、Defer Switch、Reject 和 Start New Conversation，并为每类定义可观察的用户安全结果。
- 合法任务转换图由 Admission 应用。Artifact 只能在允许的目标 Program 间传递，并在决定前完成 owner、version 与 stale 校验。
- 任务切换只在 Run Continuation 确认安全切换点后创建新 Run；危险 Tool Attempt、未处理高风险 Run Gate 或未完成 read-back 时，只能记录 Defer Switch。
- Offer Report 的解释、谈判和 HR 问询注册为独立、只读的 Task Program；它们绑定既有 Offer Report，不作为 `offer_evaluation` 内部阶段，也不得退化为无 Contract 对话。
- 先以 shadow mode 输出新旧 Decision 对比和证据，不改变生产执行；差异必须按领域规则或 fixture 修正，不能以页面特判追平。

## Testing Decisions

- 在 Admission public seam 使用 golden fixtures，覆盖 Agent Conversation、active Run、Turn、Artifact refs 和 entry hints，断言完整 Decision 而非私有分类器调用。
- 覆盖职业定位否定写入、简历只生成提案、面试回答含 JD 关键词、Offer follow-up、非语义输入、模糊追问、显式任务切换和越权 Artifact。
- 对来自 Web、结果卡、工作台和 API 的同一用户意图执行等价性测试，确保 adapter 来源不会改变领域结论。
- 使用真实身份与 Artifact 归属边界测试 Continue、Start、Clarify、Defer 和 Reject 的外部行为及其审计证据。
- 将生产会话 101、102、104、105、108、109、110、112、117 和 119 固化为回放 fixture；任一回归均为 release hard failure。
- shadow mode 统计旧新 Decision 差异、分类原因和未解释差异，只有全部分类并通过回放后才允许交给后续 module 控制执行。

## Out of Scope

- 不引入一个只靠 LLM 的全新意图分类器。
- 不重新设计 Agent Chat 视觉界面。
- 不在本 spec 中实现 Continuation Stimulus、Task Program reducer 或 Conversation Item projection。
- 不允许浏览器继续拥有 Run Contract 或 Run 生命周期的最终决定权。

## Further Notes

- 该 spec 的稳定 Decision contract 是 Spec 02 和 Spec 03 的前置条件。
- 必须使用既有术语 Agent Conversation、Conversation Turn、Agent Run、Run Contract、Artifact 和安全切换点。
- feature flag 仅用于 shadow comparison；生产 ownership 切换由 Spec 07 统一执行。
