# Spec 06: Layered Evaluation, Production Replay And Release Gates

**Target label:** `ready-for-agent`  
**Depends on:** Specs 01–05 and ADR-0015

## Problem Statement

既有测试能覆盖部分 Agent Runtime E2E，却不能证明 Run Admission、续跑、Task Program 和 Conversation Item 在真实组合旅程中符合领域不变量。生产会话 101–120 已暴露出“任务选对但无结果”“输入已消费仍等待”“用户界面与运行事实不一致”等问题；仅判断文本质量或当前测试通过无法阻止这些回归。

## Solution

建立按 module seam 分层的 Eval Run 体系：Admission goldens、Continuation command traces、Task Program simulations、Projection snapshots、真实 runtime E2E、浏览器短链路、跨能力长链路和生产失败回放。每次评测绑定代码、模型、提示词、工具、fixture、Program 与 Judge 版本；确定性失败一票否决，质量 Judge 只评价内容质量。所有门禁汇总为可执行的 release manifest。

## User Stories

1. 作为求职者，我希望已修复的职业定位、简历提案、面试辅导和岗位发现问题不会再次出现，从而能稳定完成求职任务。
2. 作为评测人员，我希望每个 Agent Run 失败能定位到 Admission、Continuation、Program 或 Projection seam，从而能快速归因。
3. 作为开发人员，我希望同一 production failure 可以在受控 fixture 上回放，从而不需要访问真实用户数据。
4. 作为发布负责人，我希望所有硬门禁可见且可复跑，从而不会因主观“看起来正常”发布架构切换。
5. 作为产品负责人，我希望浏览器短链路和跨任务长链路都被验证，从而确认用户实际体验而非仅有单元测试。
6. 作为安全负责人，我希望用户安全投影、身份归属、Gate 与 Artifact 读回失败不能被质量评分覆盖，从而保证系统基础安全。
7. 作为运维人员，我希望断网、worker 重启、重复请求、lease 过期和后台延迟都有回归场景，从而提前发现恢复问题。
8. 作为实现 Agent，我希望 eval manifest 明确每个 spec 的完成证据，从而不把“代码已写”误当作可发布。

## Implementation Decisions

- Eval Run 必须持久化代码版本、fixture 版本、Program 版本、模型与提示词版本、工具版本、Judge 版本、门禁结果、质量分数和失败 Evidence；历史结果不可被后续版本覆盖。
- Layer A 验证 Admission Decision；Layer B 用相同 command trace 验证 Memory 与 Postgres conformance；Layer C 验证 Program reducer；Layer D 验证 Conversation Item Projection；Layer E 使用真实 schema、worker 和受控 model 或 tool；Layer F 和 G 验证浏览器旅程；Layer H 回放生产失败。
- Release manifest 为每个 Program 和架构 module 声明所需 fixture、执行命令类别、环境、门禁、责任人和证据输出，缺失任一 required layer 即不可标记完成。
- 101–120 全部成为永久生产回放集合，按失败簇映射 Admission、Continuation、Program 或 Projection；108 作为正确 Offer follow-up 的正向 guardrail 保留。
- 每种纸鸢能力至少有一条独立浏览器短链路；职业定位、岗位发现、JD 评估、简历查询或修改、面试辅导、Offer 旅程、恢复与高风险 Gate 组成长链路集合。
- quality Judge 只能评分事实性、完整性、相关性、可操作性、风险披露和任务专属质量；owner、授权、read-back、Artifact hash、协议、状态和投影泄漏均为确定性 hard failure。
- 审核后可将脱敏线上失败提升为评测样本；原始用户材料、凭据和未批准的个人信息不得进入公共 fixture。
- 评测以最高稳定 seam 断言外部行为，不以私有 helper、内部 prompt 文本或模型逐 token 输出作为主要 oracle。

## Testing Decisions

- 为每一层编写自举测试，验证 fixture loader、版本绑定、结果持久化、失败 Evidence、manifest 缺失项和 hard-gate 聚合行为。
- 验证任意 adapter conformance 差异、缺少 verified facts、两个 active Run、consumed 输入仍等待、Gate 不收敛、Artifact 读回失败、Projection 泄漏或回放失败都会使 release manifest 失败。
- 在真实 Postgres、真实 worker、真实认证和受控外部依赖策略下运行预生产 E2E；同时验证可重复、可定位、无泄漏的 fixture 清理。
- 使用浏览器验证登录身份、Agent Conversation 关系、Run 记录、Program、Tool 或 Gate、Artifact、刷新后 Item 与终态，而不是只检查页面文案。
- 对 fault injection 覆盖断网、刷新、worker 重启、重复 request id、lease 过期、Gate 重放、Background Job 延迟和写后 read-back 失败。
- 将任一生产问题修复后的首次成功回放与后续回归纳入版本化 Eval Run，保留失败簇和责任 module 的可追溯关系。

## Out of Scope

- 不用 Judge 替代确定性测试或人工产品决策。
- 不在此 spec 中修改业务 Program 的具体功能逻辑。
- 不对真实生产用户数据进行无脱敏批量评测。

## Further Notes

- 该 spec 的 release manifest 是 Spec 07 开启统一生产切换的唯一判据之一。
- 所有术语保持 Eval Run、评测样本、质量 Judge、Run Evidence、组合求职旅程和用户安全视图的定义一致。
