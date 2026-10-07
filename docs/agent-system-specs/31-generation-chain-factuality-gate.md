# Spec 31: Generation Chain Soft-Gate Completion(生成链事实门补齐,B1)

Target label: `ready-for-agent`
Depends on: ADR-0041(产物事实校验分级)、Spec 24 优化链软门语义、生成链硬门既有接线(0e782cd 已闭);批次 0.20.0

> **2026-10-06 核查修订**:初稿误称生成链「完全没挂事实门」——实测硬门(数字溯源+修复重试+失败 throw)已在 `resume-generation-service.ts:9,80-86,123-134` 完整接线(0e782cd 闭掉原 P1-2 延后项),文案与优化链同款(「数字溯源未通过(重试 1 次后仍失败),生成草稿已放弃、原简历未改动」)。本 spec 范围收窄为**软门补齐+测试固化+过时记录修正**。教训已入 `evals/README.md` 修订:延后项描述落后于代码时,先查代码再立 spec。

## Problem

生成链的事实校验只完成了**硬门**:数字溯源硬门已接线(`:80-86` 收集来源、`:124` filterSectionsByProvenance、`:125-129` 修复重试一次、`:130-134` 仍败 throw `ResumeGenerationInputError`)。缺口:

1. **软门未接**:生成链无 faithfulness 评分——grep 确认无 `llm-scorers`/`advisory` 调用。低忠实度产物照常出稿且无「仅供参考」标注;而优化链语义是:score < `BLOCKING_SCORE_THRESHOLD`(0.8,`src/lib/agent/llm-scorers.ts:67`)出稿但强制降级标注+持久化 advisory 字段(`resume-optimization-service.ts:225-233`、`:287-294`)。同一产品的两条产物链降级语义不一致。
2. **零直接测试**:`resume-generation-service.ts`(234 行)无同名测试;唯二引用它的测试(route/tool 层)均 `vi.mock` 掉该服务,门逻辑从未被直接断言。
3. **记录过时误导**:`evals/README.md`「第一轮 review 延后项」第 1 条仍写「生成链事实门未挂」(实际硬门已闭),本次评审即被它误导。

## Solution

1. **接软门(与优化链逐字同语义,grilling Q2)**:生成产物在硬门之后过 faithfulness 判官;低分 → 出稿但「仅供参考」前缀 + `advisory`/`advisoryReason`/`faithfulnessScore` 持久化(`:225-233` 同款);判官不可用 → **不阻塞、未评分放行**(`:236` 实际语义:catch 后无记录,变体无前缀通过;强制降级只适用于超出评分上限的变体 `:243-245`——生成链 section ≤5 且内容互异,逐一评分、不设该上限,故此路径不适用)。硬门行为保持现状(它已经是正确语义),只补测试锁定。
2. **补直接单测**:硬门拦截(编数字→重试→仍败→throw)、修复重试成功、软门低分降级、判官不可用降级、两门顺序(先硬后软)。
3. **promptfoo 红队加生成链探针**(core+full):编造增长率/团队规模经生成链必须被硬门拦截——防未来回归。
4. **修正 `evals/README.md` 延后项**:改为「硬门已闭(0e782cd);软门由 spec 31 闭环」,并注明教训。

## User Stories

- 用户让 AI 从零生成工作经历:产物忠实但判官低分 → 稿件可用,带「仅供参考」标注,与优化链行为一致。
- 产物编造数字 → 硬门拦截(现状保持),明确报错不出稿。

## Implementation Decisions

- 软门调用点在生成产物写入/返回前的单一位置,与优化链 `:225` 对称;复用 `llm-scorers`/`resume-factuality` 既有模块,零新增校验逻辑。
- advisory 字段命名与取值与优化链一致(便于 spec 33 前端统一渲染降级卡)。
- LLM 调用走 llm-json.ts 收口后入口(依赖 Spec 32,同班车先做 32)。
- maxTokens 给足(评分类 4000)。

## Testing Decisions

- `resume-generation-service` 首个直接测试文件覆盖 Solution 2 列的五类路径。
- promptfoo core/full 集新增生成链探针,全绿。
- 全量测试零回归;`verify:capability-2026-10b` 三护栏绿。

## Out of Scope

- 硬门逻辑改动(现状即正确);生成链 UI(spec 33);投影白名单扩展(生成链不经工具卡通道)。

## Further Notes

- 实现顺序:同班车先 Spec 32 后本 spec。
- 生成链对外入口为 `src/app/api/` 下调用 resume-generation-service 的 route(实现时定位,本文不重复行号以免再漂移)。
