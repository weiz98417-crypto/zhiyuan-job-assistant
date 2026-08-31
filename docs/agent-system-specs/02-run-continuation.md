# Spec 02: Run Continuation And Stimulus Inbox

**Target label:** `ready-for-agent`  
**Depends on:** Spec 01, ADR-0018, ADR-0021

## Problem Statement

Conversation Turn、Run Gate 决策、后台作业结果和人工恢复目前通过不同通道续跑。Memory 与 Postgres adapter 也各自解释 waiting、paused、checkpoint 与幂等语义，已出现输入被消费后仍停留在 `waiting_user`、paused Run 行为不一致、Gate 已批准但用户界面没有终态的生产问题。用户会看到任务似乎卡死，或在切换任务后无法安全恢复。

## Solution

建立 **Run Continuation** kernel：将所有能推动 Agent Run 的输入记录为有序、持久的 **Continuation Stimulus**，用一个确定性状态转换接口完成记录、消费、checkpoint 推进、唤醒和事件写入。Memory 与 Postgres 仅实现持久化 adapter，并通过同一 command trace conformance suite。Run Admission 的任务切换决定由该 kernel 在安全切换点落实。

## User Stories

1. 作为求职者，我希望补充信息后等待用户的 Agent Run 能继续同一任务，从而不重复提交材料。
2. 作为求职者，我希望批准或拒绝 Run Gate 后看到对应任务和确认节点同时更新，从而知道决定已生效。
3. 作为求职者，我希望后台岗位扫描结束后自动续跑相关 Agent Run，从而无需反复刷新页面。
4. 作为求职者，我希望网络中断、浏览器刷新或 worker 重启后任务从安全位置恢复，从而不丢失上下文。
5. 作为求职者，我希望在安全切换点发起新目标时，旧任务明确显示为暂停且可以恢复。
6. 作为求职者，我希望高风险动作尚未完成时不会被静默中断，从而不会遗留不确定副作用。
7. 作为运营人员，我希望重复请求、旧 worker 和不匹配 Gate 都留下可审计拒绝原因，从而能排查续跑异常。
8. 作为实现 Agent，我希望同一 command trace 在 Memory 和 Postgres 上得到相同结果，从而不再修复 adapter 漂移。

## Implementation Decisions

- Continuation Stimulus 的统一类型包含 Conversation Turn、Run Gate approved 或 denied、Background Job 结果和 Manual recovery 或 resume command；其记录、消费和触发执行完成必须分别持久化。
- Stimulus 生命周期固定为 recorded、pending、consumed 和 rejected。HTTP 已响应不等于 consumed；rejected 必须保留与 Run、Gate、Artifact 或 checkpoint 不兼容的原因。
- continuation command 在单个原子边界中完成 request id 幂等、Run 合法性验证、Stimulus 写入、必要状态转换、wake time 和 outbox 或 notify；worker 消费在另一原子边界中完成 fencing、owner、checkpoint、cursor、状态和 Event Log 更新。
- Run Continuation 拥有所有业务状态语义；store adapter 不得再各自决定 paused、waiting、Gate 或任务切换行为。
- 任务切换遵循“安全点自动暂停、危险点先处理当前动作”：只有没有结果不确定的 Tool Attempt、未处理高风险 Run Gate 和待 read-back 副作用时，旧 Run 才可转为 paused 并创建新 Run。
- 同一 Agent Conversation 最多一个 active Agent Run。Defer Switch 只保存待处理目标和用户安全说明，不能绕过该不变量。
- Gate decision 必须只恢复 scope hash 相符的动作；后台作业结果必须只恢复引用同一 job id 的 Tool Attempt；terminal Run 不接受新的业务推进。
- 为所有状态和 cursor 赋予 schema 或 semantic 版本，以支持迁移中的可解释拒绝、恢复和回放。

## Testing Decisions

- 在 Run Continuation command seam 对 Memory 和 Postgres 执行相同 trace，比对 Run snapshot、Event 序列、Stimulus 生命周期、Gate、checkpoint、cursor 与 wake 或 notify 结果。
- 至少覆盖 `waiting_user` 加 Turn、approved Gate、denied Gate、paused 加 manual resume、paused 加普通 Turn、重复 request id、旧 fencing token、后台作业完成和 terminal Run 输入。
- 覆盖安全切换和高风险 Gate、不可安全中断 Tool Attempt、已提交但未读回副作用三类禁止切换情况。
- 将生产会话 111、118 和 120 固化为回放：Turn consumed 后不得残留同一等待条件，题号与回答 checkpoint 必须连续，Gate、Run 与 Conversation Item 终态必须收敛。
- 使用真实 worker 与持久化边界验证断网、重复提交、lease 过期、worker 重启和 delayed Background Job 的外部恢复行为。
- 测试只断言命令可见效果、持久状态和事件，不绑定内部 store 或 reducer 的具体实现。

## Out of Scope

- 不在本 spec 中定义具体 Task Program 的阶段图。
- 不在 browser 内实现新的恢复状态机。
- 不改变 Run Gate 的产品风险策略，只保证其持久化和续跑语义一致。

## Further Notes

- 该 spec 消除“页面消息列表可推断执行进度”的旧假设；Run Context 必须从持久 checkpoint 和事实构建。
- Spec 03 的 Program reducer 通过本 spec 的 checkpoint 和 verified facts 推进。
- 生产切换前必须零 adapter conformance 差异。
