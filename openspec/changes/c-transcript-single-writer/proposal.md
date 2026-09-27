# Proposal: c-transcript-single-writer

## Problem Statement

会话记录（transcript）有两个全量覆盖式写者：worker 在执行前后整表覆写 messages，浏览器也以整表 PATCH 的方式写入状态消息与流程结果，双方都没有版本控制——迟到的客户端写入会覆盖掉 worker 刚落库的最终回复。Run 结束后的服务端刷新是整表替换而非按条合并，乐观渲染的内容在刷新瞬间可能闪没或回退且不再重试。与此同时，规划中的对话项物化表从未通电：零生产写入者、前端从不调用，是一块死掉的读模型。

## Solution

Worker 成为 transcript 的唯一写者：Run 生命周期内的全部内容（含澄清追问、最终回复、工具产生的会话项）由 worker 落库；浏览器彻底停止写入 messages 字段——会话更新接口在服务端硬性拒绝该字段，流程状态（暂停/取消/恢复提示、引导会话）改走会话的状态字段或纯 UI 瞬态。前端乐观层只存在于渲染内存，刷新与服务端投影按稳定条目标识合并而非整表替换，并以周期性消息快照对账。删除从未通电的对话项物化表及其存储实现，读模型 = 从持久化事件按需投影的既有端点。

## User Stories

1. As a 求职用户, I want 刷新页面后刚看到的回复还在原位, so that 我不用怀疑自己看错了。
2. As a 求职用户, I want 任务执行期间发出的暂停/取消指令不丢失最终回复, so that 会话记录完整可信。
3. As a 求职用户, I want 流式输出中的内容和最终落库的内容按条对齐, so that 没有内容凭空消失或顺序跳变。
4. As a 求职用户, I want 引导流程（定位确认、优秀简历入库）的进度在切换会话后仍然准确, so that 流程不会串台。
5. As a 开发者, I want 会话记录只有一个写者, so that 并发冲突这一类 bug 从结构上消失。
6. As a 开发者, I want 任何客户端都不可能再覆写 messages, so that 接口约束而不是约定保障一致性。
7. As a 开发者, I want 删除掉从未使用的物化表, so that schema 里没有死器官误导后来人。

## Implementation Decisions

- sessions 更新接口（PATCH）服务端校验：messages 字段一律拒绝（422 + 指引文案）；允许字段限缩为标题、置顶、agentState、interviewState 等非 transcript 字段。
- 暂停/取消/恢复/归属异常等状态提示改为 UI 瞬态（由 Run 状态与事件渲染），不写入 transcript；引导会话与优秀简历流程的持久状态迁移到 agentState 字段（已有列，仅收窄使用面）。
- 逐条合并：服务端投影与本地乐观层都以稳定条目标识对齐，刷新时按条 reconcile 而非 setMessages(整表)；周期性消息快照事件作为对账基准（与 b-event-dialect 的 messages 快照事件共用）。
- 删除对话项物化表、其 Postgres 存储实现与迁移残留；按需投影端点保留为唯一读模型。
- 澄清追问、恢复说明等由 worker 写入 transcript 的文案，遵守"面向用户一次、可继续"的既有产品规则（0.10.7 修复语义保持）。

## Testing Decisions

- 双写竞争测试：模拟 worker 落库与迟到的客户端状态更新并发，断言 transcript 内容不丢失（接口层测试，先例：sessions 路由测试）。
- PATCH 硬拒绝测试：携带 messages 的更新请求返回 422。
- 刷新对齐测试：构造"乐观层有条目 X + 服务端投影有条目 X（内容更新）与条目 Y"，断言合并结果。
- 删除项的回归：确认无生产代码引用被删表（编译期 + 一致性查询）。

## Out of Scope

- transcript 的版本号/CAS 机制（单写者成立后无必要）。
- 会话消息的端到端加密与导出格式。

## Further Notes

- 澄清 ADR-0020：UI 读取的"持久化对话项投影"由持久化事件的确定性按需投影满足；物化表按删除测试移除。
