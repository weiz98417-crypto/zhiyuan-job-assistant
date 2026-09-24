# Spec 08: Layered Memory And Fact Ledger

**Target label:** `ready-for-agent`
**Depends on:** ADR-0028, ADR-0033, ADR-0034, and the schema ownership rules of Spec 05

## Problem Statement

求职者的长期事实、会话观察和旧记忆分别留在多套存储中。旧事实可能与新事实同时被引用，用户也无法知道一条记忆来自哪里。当前已接入 Mastra Memory 的 Postgres adapter、事实账本、混合检索和画像能力；真实数据库上的连续会话、观察记忆和权限验收仍由发布门禁确认。

## Solution

为 Agent Conversation 建立会话记忆层，为可跨任务使用的个人事实建立服务端记忆事实账本。会话层维持工作上下文与会话观察记忆，长期层记录可追溯的事实、版本、时间和记忆分区。两层通过受治理的候选写入接口连接，使求职者得到连贯且可解释的帮助，同时为后续准入、检索、纠正和清除提供唯一的持久基础。

## User Stories

1. 作为求职者，我希望较长对话仍能记住当前讨论的材料和阶段，从而不必每轮重复说明背景。
2. 作为求职者，我希望新近确认的事实替代过时事实参与回答，从而不被旧信息误导。
3. 作为求职者，我希望知道长期记忆的来源和生效时间，从而能判断它是否可信。
4. 作为求职者，我希望不同 Agent 只使用其工作所需的私人记忆，从而不让无关信息扩散到其他任务。
5. 作为求职者，我希望刷新页面或 worker 重启后会话上下文仍可恢复，从而保持同一 Agent Conversation 的连续性。
6. 作为求职者，我希望同一段会话产生的观察不会自动变成跨任务事实，从而保持对私人记忆的控制。
7. 作为运营人员，我希望事实的来源、失效关系和分区权限可追溯，从而定位错误记忆的成因。
8. 作为实现 Agent，我希望通过同一个记忆读写接口访问会话层和事实账本，从而不再依赖浏览器本地存储决定长期事实。
9. 作为安全负责人，我希望每次读写在服务端验证用户归属和记忆分区权限，从而防止跨用户或跨职责访问。
10. 作为发布负责人，我希望先验证 Mastra 的用户与 Conversation 映射，再迁入真实会话，从而能判断该依赖是否适合现有 Agent Run 模型。

## Implementation Decisions

- 会话层只采用 Mastra Memory，不整体引入 Mastra Agent 运行时。先验证 resource 与用户、thread 与 Agent Conversation 的稳定映射，以及多个 Agent Run 在同一 Conversation 中恢复、暂停和接力时的行为；不满足既定身份与续跑不变量时，按 ADR-0028 的自建会话层预案处理。
- 会话层拥有 working-memory blocks、语义召回及观察与反思两级会话观察记忆。会话观察可以形成个人记忆候选，但不能直接激活长期事实。
- 长期层由 Postgres 记忆事实账本持有 episode、entity 摘要与 fact。fact 记录事实有效时间、失效时间、来源 episode、分区、用户归属和取代关系；新证据使旧事实失效而非覆盖。entity 摘要必须能够追溯其组成事实并随事实变化重建。
- 当前已有 episode、fact、chunk、结构化画像、分区和 Mastra session 相关表及基础逻辑；本 spec 扩展并校验它们的完整性，不把现有表的存在当作功能已交付。
- 会话层、事实账本与旧存储之间只有明确的写入 owner。浏览器本地 episodic 或 semantic 数据不再是长期记忆权威；Dexie 仅可作为可丢弃的会话缓存。
- 记忆分区是服务端读写权限边界。用户归属、主责 Agent 和研究委派的有效权限必须在读写时校验；未知分区或缺失授权默认拒绝，不能退回开放的默认分区。
- 所有长期事实保留可验证的来源标识和写入决策关联。无法确认来源的旧记忆由后续迁移 spec 分级处理，不能在本 spec 中推定为用户确认。
- 记忆存储接口必须支持幂等写入、按用户及来源读回、事实失效、分区查询和列出依赖事实的派生内容，以供后续候选准入、检索和定向清除使用。

## Testing Decisions

- 在公开记忆读写 seam 上验证同一用户的事实写入、读回、失效、来源和分区授权；以可见事实及拒绝结果为断言，不绑定内部表访问顺序。
- 使用真实 Postgres 与会话层验证同一 Agent Conversation 跨多个 Agent Run、刷新和 worker 重启后的上下文连续性，以及不同 Conversation、用户与研究委派之间的隔离。
- 对已有事实账本的来源、唯一开放事实和时序变更场景增加兼容测试，并验证旧事实失效后仍可解释其历史来源。
- 验证会话观察和反思不会绕过写入准入成为活跃长期事实；浏览器缓存丢失或重复上报不得改变事实账本结果。
- 验证未知分区、越权 Agent、跨用户来源和陈旧身份均被服务端拒绝，并留下不暴露私人内容的诊断证据。
- 将 Mastra 映射、暂停续跑、会话清理和依赖升级兼容性作为本 spec 的首个可执行验收门禁。

## Out of Scope

- 不在本 spec 中决定哪些对话内容可成为活跃事实；该准入由 Spec 09 负责。
- 不在本 spec 中改变记忆排序、求职画像决策或推荐过滤；这些由 Spec 10 负责。
- 不在本 spec 中实现用户管理界面、定向清除或旧数据分级迁移。
- 不重做 Run Admission、Run Continuation 或 Task Program 的业务状态语义。

## Further Notes

- 本 spec 提供记忆领域持久化基础；通用 schema 版本、回填和 feature-flag 规则继续遵守 Spec 05。
- 记忆事实账本保留普通失效事实的历史；用户确认的记忆清除遵守 ADR-0033，必须由后续清除 spec 跨层处理。
- Mastra 会话层通过 `MEMORY_SESSION_PROVIDER=mastra` 启用，resource 映射用户、thread 映射 Conversation；默认的 Postgres adapter 作为未切换环境的兼容回退，并将执行会话快照写入 `session_memory` 的 `execution_conversation` 派生记录，绝不以 `sessions.messages_json` 作为可清除记忆的权威。发布前仍需在真实 PostgreSQL 上完成连续会话、观察记忆和清除读回验收。
