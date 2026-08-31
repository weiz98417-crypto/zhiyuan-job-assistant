# Spec 07: Unified Production Cutover And Legacy Removal

**Target label:** `ready-for-agent`  
**Depends on:** Specs 01–06 and ADR-0022

## Problem Statement

架构方案要求代码渐进实现，却不能将四个 module 的生产行为长期分批暴露。若 Run Admission、Run Continuation、Task Program 或 Conversation Item 只切换一部分，浏览器、legacy loop、store adapter 和 Session Messages 会继续拥有互相冲突的事实。反过来，大爆炸开发又会放大实现和回退风险。当前缺少把“完成 implementation”转化为“一次可信生产切换并删除旧路径”的明确运行手册与验收标准。

## Solution

制定统一的生产切换和 legacy removal plan。各 module 先在 feature flags 后完成 shadow、conformance、Program 纵切和 Item dual-write；只有 Spec 06 的全部确定性门禁、预生产 E2E 和稳定窗口通过后，才一次性把生产请求切至 Admission、Continuation、Task Program 与 Conversation Item read model。使用短时可回退开关和 canary 监控，稳定后删除旧 ownership、旧读模型和过时分支。

## User Stories

1. 作为求职者，我希望切换期间任务行为一致，从而不会因自己所在 cohort 同时遇到新旧任务语义。
2. 作为求职者，我希望已在运行的 Agent Run 不会被切换破坏，从而能够安全完成、暂停或恢复。
3. 作为发布负责人，我希望有清晰的 go/no-go 门禁和回退动作，从而能在异常时快速保护用户。
4. 作为运营人员，我希望 canary 指标能揭示 Run 创建、等待用户停留、Gate 恢复、Program 失败和投影差异，从而及时发现风险。
5. 作为开发人员，我希望切换稳定后旧路径被实际删除，从而不再维护两套状态语义。
6. 作为安全负责人，我希望切换与回退都不绕过 owner、Gate、Artifact 或用户安全投影约束，从而不会为运维便利牺牲安全。
7. 作为实现 Agent，我希望每项 legacy 删除都有可证明的替代 ownership 和回归证据，从而避免删除仍被依赖的能力。

## Implementation Decisions

- Phase 0 冻结意图、Task 执行和 Gate 恢复的局部补丁，只允许无争议 UI、认证或无关修复；将生产回放、短链路和长链路固化为可重复基线。
- Phase 1 至 4 依次完成 Admission shadow、Continuation kernel、Task Program 纵切与 Conversation Item dual-write。实现可分阶段合并，但普通用户生产行为不得在四个 module 之间形成长期混合 ownership。
- Phase 5 在真实认证、Postgres、worker、部署配置和外部依赖策略的预生产环境运行完整 release manifest、101–120 回放和 fault injection，并对所有差异完成分类。
- Phase 6 使用一次部署统一启用 Admission、Continuation、Task Program 和 Conversation Item read model。canary 仅用于风险观测与紧急回退，不表示按 module 逐步发布不同运行时语义。
- 生产切换的必要条件包括：Admission goldens 全通过；Memory/Postgres 零 conformance 差异；所有确定性 Program 有完整 verified facts；每个明确目标有 durable Run；无双 active Run；Gate、Stimulus 与 Item 收敛；Artifact 读回正确；实时和刷新 Item 一致；101–120、短链路和核心长链路全通过；无 raw payload fallback。
- 回退必须恢复到上一个完整、受支持的生产组合，并保存切换期新事实、Event Log 和 Evidence 以便诊断；不允许通过绕过 Run Admission、直接修改 Session Message 或关闭审计来“止血”。
- Phase 7 在稳定窗口结束后删除浏览器 Run 编排、客户端生产 execution loop、重复 adapter 状态语义、事后多份 Contract 判分、Session Message 事实源、页面 Gate 改写、hidden bootstrap prompt、raw payload 卡片分支以及已迁移任务的旧特判。
- 每项删除必须先明确由哪个新 module 接管、哪些 Program 或旅程覆盖、哪些 feature flag 移除，并在删除后重跑 release manifest。

## Testing Decisions

- 在生产等价环境演练完整切换、canary、回退和再次前进，验证在任意步骤不会产生双执行、双 active Run、重复 Item 或丢失 Artifact。
- 通过可观测指标测试 canary 的门限、告警和 dashboard：Run 创建率、waiting_user 停留时长、Gate 恢复率、Program 失败、投影差异、异常 Tool Attempt 和恢复成功率。
- 在切换前后重放同一 Admission、Continuation、Program 和 Projection fixtures，断言领域语义、状态和用户安全视图不变。
- 使用浏览器长链路验证部署期间的刷新、断网、Run 暂停和恢复、高风险 Gate 与 Artifact 接力，覆盖实际用户会跨过的版本边界。
- 每个 legacy 删除后执行静态入口检查与端到端回归，证明不存在可到达的旧 ownership 或以 fallback 名义保留的生产路径。
- 任何 hard gate、预生产 fault injection 或 canary 指标异常都阻止扩大流量并触发既定回退或保持策略。

## Out of Scope

- 不以大爆炸方式在一个未经验证的提交中实现四个 module。
- 不永久维持 legacy 与新架构双轨。
- 不在此 spec 中改变产品定价、视觉设计或非 Agent 业务功能。

## Further Notes

- “生产一次切换”指最终用户运行时 ownership 一次收敛，不限制代码和文档分阶段合并。
- 此 spec 完成后，Architecture Solution 与 ADR 的 legacy removal 条目必须同步标注实际切换日期、稳定窗口和删除证据。
