# Spec 15: LLM Quality Scorers Behind The Staging Judge

**Target label:** `ready-for-agent`  
**Depends on:** ADR-0015、Spec 14、Spec 06 的门禁聚合与 fixtures、model-gateway 现状；批次归属 0.13.0（A1）

## Problem Statement

「质量 Judge」接缝后只有确定性 rubric 适配器（`src/lib/agent/staging-judge.ts`），它只能校验结构与协议事实，无法判断简历优化是否编造经历、JD 摘要是否忠于原文。求职场景中"编造工作经历/技能"是信任红线，当前发布门禁对此不设防。同时 eval 持久化函数（`persistDeterministicJourneyEval`、`persistAgentEvalLayerResults`）定义后零调用方，Eval Run 聚合存在"定义了但没人写"的空转；`hardVetoes` 会经 `HARD_VETO_PATTERNS` 正则过滤（staging-judge.ts:34-50），自由文本 veto 有被静默丢弃、发布照常放行的风险。

## Solution

自写最小 LLM 评分器（faithfulness、幻觉、relevancy、factuality），判官调用经 model-gateway（deepseek）并仅覆盖 eval 样本集；prompt 底稿抄 autoevals（MIT）对应实现，不引入其运行时依赖（npm 版不支持注入自定义客户端，绕网关的路线已否决）。简历优化产物接 faithfulness + 幻觉检测并作为 hardVetoes 阻断发布；JD 评估摘要接 relevancy + factuality 记录级。评分器在 eval 编排层异步合成进既有门禁聚合。顺手接线或删除零调用的 eval 持久化函数。

## User Stories

1. 作为求职者，我希望优化后的简历不编造我从未有过的经历或技能，从而敢于直接使用。
2. 作为求职者，我希望 JD 摘要忠于原文，从而不被夸大的匹配结论误导。
3. 作为发布负责人，我希望幻觉用例在发布门禁处被拒绝，而不是上线后被用户发现。
4. 作为评测人员，我希望每次发版的质量分数可回归、可对比，从而观察提示词与模型改动的影响。
5. 作为实现 Agent，我希望新增评分器只是 Judge 接缝的一个适配器，从而不必改动门禁聚合逻辑。

## Implementation Decisions

- 评分器是 StagingJudge 接缝的新适配器：自写最小实现，输入 `StagingJudgeInput`，结果并入既有 `dimensions` / `hardVetoes` / `releaseAllowed`；不新增第二套门禁。
- 合成点：`judgeStagingOutput` 保持纯同步不变；评分器异步产出后在 eval 编排层（`scripts/run-agent-eval.mjs` 与 eval 测试层）并入输入再聚合——判官适配器不藏进同步函数签名里。
- veto 约定：LLM 评分器只产出规范 veto 代码（`fabricated_experience`、`unsupported_claim`），不输出自由文本；随本 spec 扩展 `HARD_VETO_PATTERNS`（staging-judge.ts:34-36）增加 `unsupported.?claim` 词根（staging-judge 语义变更，已确认），否则 `unsupported_claim` 会被既有过滤器静默丢弃；自由文本过滤陷阱必须有断言固定。
- 判官模型唯一：model-gateway 的 deepseek；本批为 `ChatResult` 增加可选 usage 返回字段（complete 路径，additive；全量采集含 stream 归 Spec 18），判官成本据此记录并回填 `docs/UPGRADE-PLAN-2026-10.md`。
- 阻断范围固定：简历类产物的 faithfulness/幻觉命中 → hardVetoes → `releaseAllowed=false`；JD 摘要类仅 qualityWarnings；其他任务类型本 spec 不接（岗位精选 digest 的 LLM 点评是唯一无评分的面向用户输出，已记录为接受的风险）。
- 仅在 eval 样本集运行，不评线上真实流量（2026-10 计划决策 #4）。
- 接线或删除零调用的 eval 持久化函数，二选一必须有结论；接线则 Eval Run 聚合真实落库。

## Testing Decisions

- 幻觉 fixture：编造工作经历的简历输出必须被门禁拒绝（release hard failure，聚合入口 `aggregateAgentReleaseGates`）；忠实输出 fixture 必须放行。
- veto 代码断言：`fabricated_experience` 与 `unsupported_claim` 进入 hardVetoes 后都不被 `HARD_VETO_PATTERNS` 过滤丢弃，`releaseAllowed=false` 成立。
- 判官适配器对固定输入的分数稳定性断言（同一 fixture 重跑偏差在阈值内）。
- JD 摘要低相关性 → qualityWarnings 出现且不阻断。
- 门禁聚合单测沿用 `agent-eval-release-gates.test.ts` 既有形状；usage 字段与判官成本记录有断言。

## Out of Scope

- 不评线上流量；不接面试、画像、岗位发现类产物。
- 不做多模型判官对比；不引入 Braintrust 平台或 promptfoo CLI（需要时另立 spec）。

## Further Notes

- 判官是独立评测模型（词表「质量 Judge」），不得用被评产物自评，也不得覆盖权限、归属、读回等确定性失败。
- 评分器语义校准若在 fixture 上反复失败（阈值提案不稳），回评审调整阻断阈值，不临时放宽 veto 约定。
