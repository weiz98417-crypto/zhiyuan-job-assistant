# Spec 04: Conversation Item Projection And Safe Read Model

**Target label:** `ready-for-agent`  
**Depends on:** Spec 02, Spec 03, ADR-0013, ADR-0020

## Problem Statement

当前 Agent Chat 从 Durable Run Events、Session Messages、Gate 消息改写和页面临时状态拼装用户界面。刷新与实时流可能显示不同内容；Gate 可能产生冲突卡片；页面还可能把 raw Tool Result、工具参数、Skill 正文或原始推理暴露给求职者。用户看见的进度和最终结果因此不稳定且不可审计。

## Solution

建立持久、幂等的 **Conversation Item Projection**。它从 Durable Run Events、Run Gate 生命周期、已验证 Artifact 引用和用户 Conversation Turn 生成有序的 Conversation Item read model。Agent Conversation、过程状态轨道、Admin Evidence 与 Eval Evidence 都消费同一投影，但只在各自获授权的安全范围内展示不同 Item 类型。迁移期间 dual-write 并对比 legacy read model，最后由 UI 直接读取 Item。

## User Stories

1. 作为求职者，我希望刷新 Agent Conversation 后仍看到与实时流相同的进度、确认节点和结果，从而能放心离开再回来。
2. 作为求职者，我希望一个 Run Gate 在批准、拒绝或过期后原位更新，从而不会看到相互矛盾的确认卡。
3. 作为求职者，我希望看到可理解的过程状态和安全工具摘要，从而了解工作进度而不泄漏内部内容。
4. 作为求职者，我希望岗位发现结果、简历草稿工件和 Offer Report 以可操作的 Artifact 卡片出现，从而能继续下一步。
5. 作为求职者，我希望失败任务显示准确、安全的原因和可恢复动作，从而不会误以为已经完成。
6. 作为管理员，我希望能基于同一 Item 时间线核对用户视图和 Evidence，从而排查投影差异。
7. 作为评测人员，我希望重放同一 Event、Gate 和 Artifact fixture 得到稳定 Item 顺序，从而可以可靠回归。
8. 作为实现 Agent，我希望 UI adapter 不再自行解释 raw execution payload，从而避免分叉的业务真相。

## Implementation Decisions

- Conversation Item 的事实来源仅限 Durable Run Events、Run Gate 生命周期、verified Artifact 引用与版本以及用户 Conversation Turn；Session Messages 仅在迁移期作为兼容 read model。
- 稳定 Item 类型为 user_turn、assistant_text、run_progress、safe_tool_status、artifact_card、run_gate、task_switch_notice、run_terminal 和 user_safe_error；每类拥有 schema version、display state 与用户安全 payload。
- 每个 Item 至少持有稳定 item id、Conversation id、可选 Run id、Event cursor、Artifact ref、created 或 updated time 与 dedupe key，以保证重放和订阅幂等。
- Gate 生命周期更新必须修改原 Gate Item；相同 Event 重放不得新增 Item；Run 失败必须终止或更新“进行中”状态，不能留下误导性已完成卡片。
- 投影边界实行 allowlist。raw Tool Result、系统提示词、Skill 正文、工具参数、原始推理和未授权 Artifact 数据绝不能成为用户侧 fallback。
- Artifact card 只能引用通过 owner、version 和 stale 校验的 Artifact。assistant_text 只有在对应 Task Program 阶段允许发布时才可投影。
- 过程状态轨道、Agent Conversation、Admin Evidence 和 Eval Evidence 使用同一 Item 顺序与生命周期，但由授权 adapter 选择展示范围，禁止各自重放 raw events。
- 迁移先 dual-write、对比实时与刷新语义、再让 UI adapter read Items；legacy Session Message 的删除由统一 cutover 控制。

## Testing Decisions

- 在 Projection reducer seam 使用 Event、Gate、Artifact 和 Conversation Turn fixtures，断言 Item 类型、顺序、display state、dedupe 与用户安全 payload。
- 覆盖重复 Event、断线重连、Gate approved 或 denied、Gate 过期、Artifact stale、Run failed、Tool-only work、assistant stream 中断和 Event 缺失字段。
- 验证实时订阅与刷新读取输出相同的 Item 结果；同一 cursor 重放不得新增可见节点。
- 对用户 API、浏览器 DOM 和序列化 payload 实施泄漏测试，确保不存在 Skill 正文、工具参数、raw JSON、原始推理或未授权 Evidence。
- 使用真实 Agent Conversation 验证 task switch notice、Run terminal、Artifact card 与 Run Gate 的用户可见行为，而不依赖页面临时状态。
- 保留 108 作为 Offer follow-up 的正向 guardrail，并将 120 的 Gate/Run/Item 收敛作为 hard failure。

## Out of Scope

- 不重做纸鸢的视觉风格或为每个任务设计全新卡片。
- 不让普通用户读取 Admin 的完整 Run Evidence。
- 不改变 Durable Run Event 的审计保留策略。

## Further Notes

- 该 spec 延续既有安全投影约束：用户安全视图不是原始运行日志的格式化版本。
- Spec 05 负责 Item schema 和 dual-write 所需持久化迁移；Spec 07 决定何时停止依赖 Session Messages。
