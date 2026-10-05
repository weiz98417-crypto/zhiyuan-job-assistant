# Spec 31: Generation Chain Factuality Gate(生成链事实门,B1)

Target label: `ready-for-agent`
Depends on: ADR-0041(产物事实校验分级)、Spec 24 的数字溯源硬门与 faithfulness 软门既有实现;批次 0.20.0

## Problem

2026-10B 建成的事实校验门只接在**简历优化链**上;**从零生成简历内容的生成链**(`src/lib/server/resume-generation-service.ts`,234 行,零直接测试)完全没有挂——产品里最容易凭空编造数字的场景是唯一不设防的出口。此欠账登记于 `evals/README.md`「第一轮 review 延后项」第 1 条。信任卡(0.19.0)对用户展示「有据可查」,前提是所有产物出口都设防。

## Solution

把优化链同款的两级门完整接进生成链产物路径,**语义逐字复制,不发明新规则**(grilling Q2):

1. **硬门(数字溯源)**:生成产物过 `extractNumberTokens`/`numberProvenance` 比对用户来源材料;未溯源数字先走一次带溯源提示的修复重试(优化链既有模式,`resume-optimization-service.ts:202-205` 同款文案已在生成侧占位——`:131` 已有同款报错模板但门未接线);重试仍失败 → throw `ResumeOptimizationInputError` 风格错误,接口 400,**不出稿**。文案:「数字溯源未通过(重试 1 次后仍失败),本次生成保持未产出。编造嫌疑数字:…」
2. **软门(faithfulness)**:分数 < `BLOCKING_SCORE_THRESHOLD`(0.8,`src/lib/agent/llm-scorers.ts:66`)不阻塞出稿,产物强制带「仅供参考」前缀 + `advisory`/`advisoryReason`/`faithfulnessScore` 持久化(字段语义与优化链 `:225-233`、`:287-294` 一致);判官不可用时不阻塞、按「仅供参考」处理(`:236` 同款)。
3. 生成链的 blocking/advisory 任务归属遵循 Spec 24 既有分级;veto 只出规范代码(`HARD_VETO_PATTERNS` 不吃自由文本)。

## User Stories

- 用户让 AI 从零生成一段工作经历:AI 编了「营收增长300%」而来源材料只有 30% → 系统自动修复重试一次;修不动则明确告知「哪些数字没有出处」且不给稿。
- 生成产物整体忠实但判官低分 → 稿件可用,标题带「仅供参考」,用户知道要自己核实。

## Implementation Decisions

- 门的调用点在生成产物**写入/返回前**的单一位置(与优化链 `:202` 对称),不在每个调用方各自判断。
- 复用 `resume-factuality.ts`、`llm-scorers.ts`、`number-provenance` 既有模块,零新增校验逻辑。
- LLM 调用走 llm-json.ts 收口后的入口(依赖 Spec 32,同班车先做 32 或同 PR 内先收口)。
- maxTokens 给足(评分类 4000,历史教训:截断是高频事故源)。

## Testing Decisions

- `resume-generation-service` 首次补直接单测:硬门拦截(编数字→重试→仍败→报错不出稿)、修复重试成功路径、软门降级前缀、判官不可用降级。
- promptfoo 红队集(core+full)新增生成链探针:编造增长率/团队规模经生成链必须被拦。
- 既有 1490 测试零回归;feature-baselines.eval.test.ts 补生成链基线例。

## Out of Scope

- 生成链的 UI 呈现(spec 33 的信任卡范围);投影白名单扩展(生成链产物不经工具卡通道则不需要)。
- 模板美化、优化链门逻辑的任何改动。

## Further Notes

- 实现顺序建议:同班车先 Spec 32(JSON 收口)再做本 spec,生成链新接线直接走收口后入口,避免接完再迁。
- 验收含 `verify:capability-2026-10b` 三护栏绿 + CI 绿。
