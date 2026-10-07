# Spec 32: LLM JSON Consolidation(解析样板收口,B2)

Target label: `ready-for-agent`
Depends on: `src/lib/llm-json.ts` 既有两级修复(截断容错重写,2026-10 校准实战验证);批次 0.20.0

## Problem

`llm-json.ts` 是全仓 LLM JSON 解析的标准答案,但仍有 **8 处**调用点各自手搓 parse+正则兜底。LLM 截断 JSON 是本项目记录在案的高频事故源(2026-10 校准 4 轮迭代的主因),每处手搓样板都是一次未来事故。已知残留(grilling 前探查实证):

1. `src/app/api/chat/summarize/route.ts:117-123` — parse→围栏正则兜底
2. `src/app/api/cv/analyze/route.ts:114-119` — 同型
3. `src/app/api/cv/optimize-section/ask/route.ts:87-92` — 同型
4. `src/app/api/cv/import-reference/route.ts:73-86` — **四级自造解析器**(直接 parse→围栏→sections 正则→`{[\s\S]*}` 裸括号)
5. `src/app/api/news/company/route.ts:36-47` — parse→catch 内联降级
6. `src/app/api/news/industry/route.ts:172-185、335-336` — `summaries||items`(:173、:182 两处)与 `news||items`(:335-336)多形态兜底
7. `src/app/api/interview/coach/stream/route.ts:203-222` — `<<FOLLOWUPS>>` 自定义标签 + JSON.parse 各自 try/catch
8. `src/app/api/evaluate/stream/route.ts:479-481` — archetype 裸 `match(/\{[\s\S]*\}/)` 后直接 parse,无围栏剥离

## Solution

8 处机械替换到 `llm-json.ts` 单一入口。**纯收口,不引 zod,不改任何调用点的业务校验逻辑**(grilling Q3):每处「解析成功之后」的字段校验、兜底形态处理(`summaries||items`)原样保留——本轮消灭的是「截断/围栏/损坏 JSON 的处理不一致」,不是统一 schema 层。

特殊形态处理:

- `<<FOLLOWUPS>>` 自定义标签:标签提取逻辑保留在调用点,标签内 JSON 交给 llm-json.ts。
- `import-reference` 的四级兜底:llm-json.ts 已覆盖「直接 parse→围栏→闭合修复」三级;`sections` 正则与裸括号兜底若仍需要,作为调用点最后一个 fallback 保留并加注释说明为何 llm-json.ts 不够——实现时以实际用例验证,能删则删。

## User Stories

- 无用户可见变化;任何一条链路遇到截断 JSON 的修复行为与 2026-10 校准后的标准行为一致。

## Implementation Decisions

- llm-json.ts 接口不动。现状实测:5 个文件 import、**真实调用点仅 3 处**(ats-analysis:93、interview-rubric:107、resume-generation:119);`question-bank.ts:11` 与 `rejection-parsing.ts:7` 是**未使用的死 import**——收口时顺手清掉。
- 8 处替换保持响应契约逐字节等价(成功形态与失败文案不变);若其中有需要的新形态(如自定义标签剥离),以可选参数/前置步骤实现,不动既有签名。
- 不引入新依赖(instructor-js 判半休眠不用;智谱/百炼/DeepSeek 均已原生 JSON 模式,不需要)。

## Testing Decisions

- 8 个 route 的既有测试全绿;为截断容错补统一用例(截断 JSON 输入 → 各 route 行为与迁移前一致,快照或断言锁定)。
- `import-reference` 补:四种历史畸形输入样本(围栏包裹/截断/裸括号/sections 形态)的行为基线,防止收口丢兜底。

## Out of Scope

- zod schema 校验层;llm-json.ts 的算法改动;prompt 构建路径调整。

## Further Notes

- 与 Spec 31 同班车,**先做本 spec**:31 的软门新接线直接走收口后入口。
- 收口完成后,`llm-json.ts` 文件头注释已标明唯一合法入口;`llm-scorers.ts` 的判官解析(parseScorerJson)与 maxTokens(600→4000,截断教训)随 code-review 一并收口。
- **route 级锁定覆盖说明**(spec 评审记录):summarize 路由级三态锁定(围栏 200/截断 200 修复/垃圾 500 文案逐字)在 `route-json-consolidation.test.ts`;news 由既有 `news-routes.test.ts` 覆盖;import-reference 四形态基线在解析器层(其 route 依赖 OCR/上传 harness,route 级测试成本不成比例,记录为已知取舍);coach/evaluate 为流式路由,由解析器层+生成服务测试间接覆盖。
- **记录在案的行为微差**(均为严格更安全方向,code-review spec 轴识别):①evaluate/stream archetype 无 JSON 时由「静默跳过留空」变为「error 事件+未检测」——旧行为会把空 archetype 拼进后续 prompt,新行为与既有 catch 兜底一致;②import-reference「JSON 可解析但缺 sections」的失败文案由误导性的「解析失败」变为准确的「缺少 sections 数组」(旧四级策略结构下该分支是死代码,新文案即旧代码意图);③个别调用点借 TS 收窄补了防御性默认(数组/对象形态兜底)。
- 不引入 zod/instructor-js(决策 Q3 维持)。
