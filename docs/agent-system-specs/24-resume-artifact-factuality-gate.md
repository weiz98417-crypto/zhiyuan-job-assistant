# Spec 24: Resume Artifact Factuality Gate

**Target label:** `ready-for-agent`  
**Depends on:** ADR-0041、Spec 15 的评分器适配器与 veto 约定、resume-optimization-service 现状；批次归属 0.15.0 · 地基车（f-factuality-gate）

## Problem Statement

简历优化与生成产物在生产链路上只过格式守门（`resume-save-guard.ts:84-109`，挡占位符/修改指令/过短），verify 位置没有任何事实校验——Spec 15 的 faithfulness/幻觉评分器只活在 eval 编排层（`llm-scorers.ts:6` 自述「仅在 eval 样本集运行，不评线上真实流量」）。用户最怕的「AI 把简历数字/经历编错了」恰好无人拦截，而摄取侧的完整性证据（`resume/document.ts:193-231`，数字覆盖必须 100%）已经证明确定性数字校验在本仓库是成熟做法。ATS 检查同样是单条 prompt 零规则（`ats-analysis-service.ts:22-37`），五维全靠 LLM 即兴判断。

## Solution

在优化/生成产物进入简历草稿工件之前，接一道分级事实门（ADR-0041）：数字溯源（确定性、硬门）→ faithfulness（Spec 15 评分器推进生产 verify 位、软门）→ 一次带反馈自动重试。ATS 三类维度规则化；generate-cv-pdf 渲染→解析→反测进 CI；promptfoo 红队把 JD/简历当不可信输入在 PR CI 拦截注入与 PII 泄漏。

## User Stories

1. 作为求职者，我希望优化产物里的每个数字都能在我的原文、JD 或我确认过的记录里找到出处，从而敢直接采用。
2. 作为求职者，我希望 ATS 报告里规则类问题（联系方式/完整性/格式）可复现、可解释，而不是模型每次说法不一。
3. 作为发布负责人，我希望注入攻击样本与 PII 泄漏用例在 CI 就被红队拦截，而不是依赖人工抽查。
4. 作为实现 Agent，我希望校验是 verify 位置的一串确定性步骤，从而不必读懂整个优化服务就能加规则。
5. 作为求职者，我校验失败的 section 看到的是「保持原文+原因说明」，而不是一个报错或悄悄丢内容。

## Implementation Decisions

- **数字溯源（硬门）**：产物 section 中每个数字（计数/百分比/金额/年限）必须命中三源之一：原简历 base 版本文本、参照 JD 文本、用户确认记录。不可溯源的内容**不得进入简历草稿工件**——拦截点在 proposal 生成之前（`resume-edit-proposals.ts` 的组装位），不在 apply。带具体违规清单反馈自动重试一次；仍失败则该 section 保持原文、提案说明原因（ADR-0041）。
- **faithfulness（软门）**：复用 Spec 15 的评分器适配器（不重写），接入 `resume-optimization-service.ts` 的生产验证位；低分把提案降级为「仅供参考」，不自动应用。判官调用经 model-gateway，成本按 usage 字段记录（沿 Spec 15）。
- **顺序固定**：格式守门（现有，先行）→ 数字溯源（硬）→ faithfulness（软）→ 草稿工件创建 → 读回。
- **ATS 规则化**：`ats-analysis-service.ts` 拆两路——确定性规则（联系方式格式、section 完整性、日期与特殊字符格式风险）纯正则先行；LLM 路只保留量化覆盖与岗位关键词两维。`dimension` 字段命名不变，消费方无感。
- **PDF 反测**：`/api/generate-cv-pdf` 输出 → 文本抽取 → 与结构化源对照数字集合与关键词集合，丢失即 fail，进 CI 作为简历渲染回归（借 ai-job-search 视觉验证思路，先做文本层）。
- **覆盖两条链**：优化链挂 `resume-optimization-service.ts` 的验证位（proposal 组装前）；纯生成链（`resume-generation-service.ts` 的产出位）挂同一道门——生成产物同样不得携带无出处数字。
- **promptfoo**：新增 devDependency（MIT，本 spec 唯一新包）。核心集 ~30 用例（JD 注入/简历注入/PII 泄漏）进每次 PR CI；全量 200+ 发布前 npm script 手动跑。红队集随变更单维护（本仓库新增注入模式或修复线上注入案例时补用例，归属 0.15 变更单的后续提交）。

## Testing Decisions

- 溯源 fixtures：产物含原文没有的「300% 增长」必须被拦截；重试仍失败时 section 保持原文且有原因说明；原文有出处的数字放行。
- 重试语义：违规清单确实进入重试请求；重试只发生一次（第二次失败不再调用）。
- faithfulness 降级：低分提案标记 advisory-only，apply 路径拒绝自动应用。
- ATS 规则每类正反例单测；LLM 路两维不被规则路覆盖的断言。
- PDF 反测：数字/关键词丢失的合成 PDF fixture 必须 fail。
- promptfoo 核心集 CI 绿；注入样本不改变系统行为。

## Out of Scope

- 不做线上流量持续评分（eval harness 走既有机制）；DOCX 导出反测（导出增强后置）；不动评分 rubric 本体（Spec 26）；不引入 promptfoo 之外的 eval 平台。

## Further Notes

- ADR-0041 是本 spec 的决策依据；溯源规则与摄取完整性证据是同一哲学（数字不许静默变化）。
- Spec 15 已把 faithfulness 接进发布门禁；本 spec 是把它推进生产 verify 位并补上确定性数字溯源，不是从零建评分器。
