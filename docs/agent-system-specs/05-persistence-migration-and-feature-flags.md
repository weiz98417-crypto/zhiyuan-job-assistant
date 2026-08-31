# Spec 05: Persistence Migration And Feature-Flag Governance

**Target label:** `ready-for-agent`  
**Depends on:** Specs 01–04 and ADR-0022

## Problem Statement

四个目标 module 需要新的持久事实、版本化 schema、迁移期 dual-write 和 feature flag，但若各模块自行新增表、开关和回退逻辑，就会再次形成平行状态语义。缺少明确删除条件还会让 legacy browser loop、Session Message 事实源和 adapter 业务逻辑长期共存，增加发布风险。

## Solution

定义一个由架构 module ownership 驱动的持久化迁移与 feature-flag 治理方案。新增 schema 均具有版本、索引、约束、回退和兼容读取策略；开关只用于渐进实现、shadow 比较和预生产验证，不用于长期生产分叉。每项 dual-write、read-switch 和删除均由可验证的进入、比较和退出条件控制。

## User Stories

1. 作为求职者，我希望架构升级期间既有 Agent Conversation 和简历工件仍可读取，从而不会因迁移丢失求职记录。
2. 作为求职者，我希望同一任务在迁移期不会被新旧路径重复执行，从而避免重复扫描、导出或写入。
3. 作为运营人员，我希望每个 feature flag 的目的、用户范围和删除条件可见，从而能判断发布是否安全。
4. 作为运维人员，我希望数据库迁移、回填和回退都有明确顺序，从而能在异常时恢复服务而不破坏事实。
5. 作为评测人员，我希望 shadow 与 dual-write 差异可记录、分类和对比，从而不会让数据漂移静默进入生产。
6. 作为实现 Agent，我希望新 schema 对应明确 module owner，从而不在 store adapter 或页面补充业务状态。
7. 作为安全负责人，我希望 Artifact、Gate 和 Conversation Item 的 owner、version 与审计约束在数据库层得到保护，从而降低跨用户和陈旧引用风险。

## Implementation Decisions

- 所有新增持久模型围绕已确认领域对象建模：Admission Decision evidence、Continuation Stimulus、Program stage 与 verified facts、Conversation Item，以及支持它们的 version、dedupe、owner 和 cursor 字段。
- 每项 schema migration 必须是可重复运行的、显式版本化的，并为请求幂等、Conversation active Run、Artifact owner 与 version、Gate scope、Event 或 Item dedupe 建立必要约束和索引。
- 数据回填只能生成有来源证据的兼容记录；无法可靠重建的历史状态必须标记 legacy，而不得伪造新的 Program 或 Item 事实。
- feature flag 按目的区分 Admission shadow、Continuation kernel、Program vertical slice、Item dual-write、Item read switch 和 unified production cutover。每个开关记录 owner、cohort、观测指标、回退语义、最晚删除阶段。
- dual-write 必须具备确定性 comparison key、差异分类与告警；新读路径未通过等价性门禁前不得对普通用户成为事实源。
- 迁移期禁止新旧路径双重产生业务副作用。一个 Agent Run 在任意时刻只能由一个权威执行路径拥有，且同一 Agent Conversation 仍最多一个 active Run。
- store adapter 只实现 schema persistence、事务与查询。任何 Program stage、Gate 或 paused 语义应回到其所属 module，禁止作为临时 migration 分支留在 adapter。
- 设计可恢复的读回退与数据备份步骤，但不允许把回退当成长期模式；满足统一门禁后按 Spec 07 删除旧开关和 legacy 路径。

## Testing Decisions

- 在空库、当前生产形状数据库和含 legacy 历史记录的样本库上验证 migration、回填、约束、索引和降级读取行为。
- 对所有写 command 执行重复提交与并发测试，断言不会出现第二个 Stimulus、第二个 active Run、重复 Item 或重复业务副作用。
- 为 dual-write 建立固定 comparison fixtures，覆盖 Event、Gate、Artifact、paused Run、Program stage 和 refresh read model，并对未解释差异失败。
- 在 feature flag seam 测试 cohort 隔离、开关组合合法性、roll-forward 与受控 rollback；禁止没有删除条件或观测指标的开关进入生产。
- 使用真实权限边界验证 user、owner、Artifact version、Gate scope 和 Conversation scope 约束；不以页面隐藏代替数据库或服务端检查。
- 真实 Postgres 环境中的 migration、rollback rehearsal 和恢复读写结果必须纳入预生产 release gate。

## Out of Scope

- 不在本 spec 中重新定义四个 module 的业务 interface。
- 不将所有历史 Session Messages 转换为高保真 Conversation Item。
- 不按单独 module 向普通用户逐步切换新生产语义。

## Further Notes

- 此 spec 是各模块实现的共同基础，但生产 behavior 的启用顺序仍由 Spec 07 管理。
- 每个 feature flag 的删除条件必须与其对应的 evaluation、production replay 和稳定窗口绑定。
