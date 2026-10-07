# Spec 26: Interview Scoring Rubric Anchoring

**Target label:** `ready-for-agent`  
**Depends on:** ADR-0042、ADR-0034、ADR-0028 条款 4、Spec 15 的 veto 代码纪律、Spec 25 的注册表挂载点；批次归属 0.16.0 · 评分车（h-interview-rubric）

## Problem Statement

面试评分的 4 维权重（`MODE_WEIGHTS`，`interview-analysis-service.ts:20-27`）只是写进 prompt 的文字（`:187`「按结构 0.3、具体 0.3…」），LLM 在 temperature 0.3 下自由打分，无锚点样例校准。而这个分数有**两条直写记忆的路径**：`persistInterviewObservation`（`interview-analysis-service.ts:434-474`）与 score_answer 工具内联的 `writeCandidateAgentMemory({ memoryType: "interview_observation", … importance: score.overall < 3 ? 0.75 : 0.55 })`（`interview-tools.ts:214-227`）——低分都加权 importance，幻觉分数在污染用户画像。复盘没有固定格式，无法沉淀可信的弱项证据。

## Solution

把 LuJie CareerKit 的 evaluation-rubric（Apache-2.0）按纸鸢方言移植为评分深模块：0-4 档锚点 + 每档判定必须引用回答原文 + 三态区分（不会/没说清/未呈现）；无引用评分经 veto 作废重评。30 个锚定校准样例进 fixtures 成为回归。分数改为延迟入账：同一弱项跨 ≥3 场持续才提炼趋势事实入私人记忆分区（ADR-0042）。

## User Stories

1. 作为求职者，我希望每个分数旁边有我自己回答的原文引用，从而知道分数怎么来的。
2. 作为求职者，我希望「没写进简历」不被当成「不会」，从而不被冤枉定性。
3. 作为求职者，我希望单场发挥失常不会立刻改写我的长期画像。
4. 作为实现 Agent，我希望评分是一个纯函数接缝（回答×题目×rubric → 档位+证据），从而用固定样例回归。
5. 作为用户，我希望弱项趋势事实在记忆治理入口可查看、可纠正、可清除。

## Implementation Decisions

- **rubric 结构**：0-4 五档（未作答/薄弱/基础/扎实/出色），不换算百分制；每档判定必须携带回答原文片段（quote 字段）；评分维度沿用现有四维（结构/具体/亮点/时间），锚点按维度×档位定义。
- **veto 纪律**：无引用评分产出规范 veto 代码 `missing_evidence_citation` 进 hardVetoes；随本 spec 扩展 `HARD_VETO_PATTERNS`（`staging-judge.ts:34-50`）词根，并沿 Spec 15 的陷阱断言固定（自由文本 veto 会被静默丢弃）。作废后重评一次；仍无引用则该题记「未评分」，不猜分。
- **三态判定**：`does_not_know` / `did_not_articulate` / `not_on_resume`；`not_on_resume` 不得表述为能力缺陷；表达风格、紧张程度不进能力判定（LuJie 条款一字保留）。
- **移植纪律**：LuJie 文本按纸鸢方言改写（对齐 CONTEXT.md 词条「评分锚点」「模拟面试主问题」「追问」），Apache-2.0 致谢进 NOTICE；rubric 文本存 Spec 25 注册表。
- **30 个锚定样例**：4 维×5 档×主力岗位族（AI 产品/算法优先），LLM 起草 + 人工校对，进 eval fixtures。回归容差：同一样本重跑档位波动 >±1 档即 fail。
- **延迟入账（候选身份）**：两条直写路径都删除——`persistInterviewObservation` 与 `interview-tools.ts:214-227` 的内联 `writeCandidateAgentMemory`；分数只进复盘报告。同一弱项（维度×岗位族）跨 ≥3 场持续 → 提炼**趋势事实候选**，按 ADR-0034/ADR-0028 条款 4 的推断类记忆语义**先入候选、经用户确认才成为活跃事实**（不直接 active），归私人记忆分区（可查看/纠正/清除，来源=面试趋势）。同步更新 `memory-policy.ts:149`（interview_coaching）与 `:167`（profile_growth）的 allowedMemoryTypes：移除 `interview_observation`、加入趋势事实的新 memoryType，否则面试教练与画像成长场景检索不到新事实。
- **复盘固定格式**：题目/回答摘要/有效证据（带引用）/主要缺口/三态判定/更好的回答结构——给提升思路不代写，信息不足输出「需要你补充：…」。

## Testing Decisions

- 锚定回归：30 样本全绿，±1 档容差。
- veto 路径：无引用评分作废且只重评一次；重评仍无引用 → 「未评分」；veto 代码不被 `HARD_VETO_PATTERNS` 丢弃的断言。
- 三态：`not_on_resume` 样例不得产出能力缺陷类表述。
- 趋势入账：2 场同弱项不入账；3 场产生候选、用户确认后成为活跃事实且分区正确、可清除；未确认候选不影响检索与推荐（ADR-0034 语义）；单场高分不产生事实。
- 旧路径删除：两条 interview_observation 直写（interview-analysis-service 与 interview-tools）零调用断言（grep + 测试双保险）；memory-policy 白名单更新后新 memoryType 可被面试教练/画像成长场景检索。

## Out of Scope

- 不动出题与追问逻辑（Spec 27）；不做语音多模态；不做多判官对比；不做评分的线上持续监控。

## Further Notes

- ADR-0042 是决策依据。样例人工校对约 1-2 天，是 0.17 回流数据质量的前置门槛——先过本 spec 门禁再开 Spec 29。
- 评分接口即测试面：锚点样例 fixtures 同时服务回归与 rubric 本身的人工验收。
