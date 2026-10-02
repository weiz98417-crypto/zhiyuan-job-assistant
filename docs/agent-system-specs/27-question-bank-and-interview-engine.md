# Spec 27: Question Bank And Interview Engine

**Target label:** `ready-for-agent`  
**Depends on:** ADR-0044、Spec 25 的注册表挂载点、Spec 14 的嵌入失败显式失败教训；批次归属 0.17.0 · 题库车（i-question-bank-engine）

## Problem Statement

面试出题是一次 LLM 调用配约 3 行 system prompt（`interview-analysis-service.ts:126-151`），失败兜底 4 条固定题（`:648-653`）；全库无题库、无面经语料（`interview-prep/story-bank.md` 是 26 行空模板）。公司面试知识只有 10 家手写条目（`knowledge/interview-styles.ts` 112 行），13 家大厂全部映射同一模式 project-review（`interview-agent.ts:17-31`）。追问判定是纯长度规则：回答 <50 字或本题还没追问过就追问（`interview/engine.ts:66-86, 114-116`）。面试状态有两套并行状态机：durable 引擎阶段机（`engine.ts:47-48`，intro→tech→behavioral→reverse）与 chat 侧 questionGraph 从消息文本正则推断题型（`interview-session-state.ts:218-226, 299-331`）；谁是事实源要拼读 SESSION_STATE_RULES 加 344 行 rebind 策略（`interview-rebind-policy.ts`）。

## Solution

建面试题库（Postgres 表 + pgvector embedding，复用 reference-resume-vector 检索模式）与出题引擎深接口；种子题库冷启动（岗位族两级分类）；追问从长度规则升级为内容缺口判定；状态机收敛为 durable 引擎单写者、questionGraph 降纯投影（ADR-0044）。

## User Stories

1. 作为求职者，我希望题目贴合我的岗位族和简历，而不是泛泛的通用八股。
2. 作为求职者，我希望每道题带出处标签，从而知道它是通识、按 JD 定制还是面经来源。
3. 作为求职者，我希望追问针对我回答里的内容缺口，而不是「字数不够就追问」。
4. 作为实现 Agent，我希望出题是一个函数调用（岗位族×轮次×难度+上下文 → 题目卡），从而不必理解检索细节。
5. 作为实现 Agent，我希望面试状态只有一个写者，从而投影永远不可能与引擎矛盾。

## Implementation Decisions

- **表设计**：`interview_questions`（id/题干/考查点/岗位族/轮次/难度/出处标签/答案要点/embedding）+ `interview_experiences`（公司/岗位/轮次/日期/原文链接/标签）。面经表建而空置——采集按 ADR-0043 条款 3 后置，本 spec 只留 schema。**Postgres-only**：DDL 只写 `postgres-schema.sql`（schema 只增不破坏），SQLite 模式不建题库表、不做降级路径（2026-10-03 用户确认：本地开发环境统一 Postgres，开发机经 GitHub 同步）；git 回退后残留空表无害，出题引擎回落既有 LLM 直出路径。
- **出题引擎深接口**：`composeInterview(岗位族, 轮次, 难度分布, 简历/JD 上下文) → 题目卡列表`；内部 = SQL 过滤 → 向量召回（复用 `reference-resume-vector.ts:539-554` 的检索与打分模式）→ LLM 定制改写（带出处标签输出）。接缝落点：durable 侧替换 `interview-analysis-service.ts:126-151` 的出题调用；工具侧替换 interview-tools 的 generate 入口；JD 评估 B 板块与岗位精选点评经同一接口取材。调用方只见这一个接口。
- **岗位族两级**：一级 AI 产品/算法做深；二级通用技术岗 + AI 业务岗（AI 运营/AI 售前等）同 schema 扩展。岗位族是题库与薪资基准（Spec 28）共用分类单位（CONTEXT.md 词条）。
- **种子题库**：LLM 生成带出处标签（`generated_seed`），一级岗位族每族 150-200 道主问题，二级每族 50-80 道；无出处标签不入库；10% 人工抽检记录在案（docs 随变更单）。生成走可重跑脚本（幂等：同 prompt 版本重跑不重复入库，requestKey 模式沿 resume-optimization-service 惯例），成本按 usage 记录。JavaGuide（Apache-2.0）/doocs-leetcode（CC-BY-SA-4.0）语料作二级导入：NOTICE 致谢 + 来源链接，CC-BY-SA 注意相同方式共享义务。
- **追问升级**：从纯长度规则改为内容缺口判定——基于当前回答与题目答案要点的覆盖差（LLM 判断关键数字/结论/依据缺失，长度规则保留为兜底）。追问仍归属原主问题，不形成多层链（词表）。
- **状态机单写者（ADR-0044）**：durable 引擎是面试状态（阶段/主问题推进/追问计数/反问练习）唯一写者；`interview-session-state.ts` 的 questionGraph 降为纯投影——删除 `:218-226` 的正则推断，改读持久面试状态。行为等价验收沿用源码契约测试重定向模式（0.12 惯例）。
- **公司知识扩容**：interview-styles 数据化进 Spec 25 注册表，新增公司=加数据；种子期把 12 家同映射的大厂按公司族差异化。
- **嵌入失败显式失败**（沿 Spec 14 教训）：题库 embedding 调用失败不得静默退回，必须报错并阻塞出题引擎的向量召回路径（SQL 过滤路可降级继续）。

## Testing Decisions

- 出题引擎：岗位族×轮次×难度过滤正确性；出处标签必带；同场去重（不出同考查点）；向量召回相关性 smoke。
- 种子质量：无标签题目入库被拒的断言；抽检记录文档化。
- 追问：内容缺口触发/不触发正反例；长度兜底仍生效。
- 状态机：既有面试会话 fixtures 重放，投影输出与收敛前一致（行为等价）；投影文件不再含题型正则推断的 grep 断言。
- 引擎恢复：checkpoint 递增与读回校验语义不变（`interview-analysis-service.ts:551-587` 既有测试沿用）。

## Out of Scope

- 面经采集管线（ADR-0043 后置）；语音面试；题库管理 admin UI（后置）；出题协议的完整问题地图（综合面 8 类/项目深挖 7 层的进一步深化，留待题库有真实使用数据后迭代）。

## Further Notes

- ADR-0044 是状态机收敛的决策依据。砍法预案（2026-10B Q11）：本 spec 超期时状态机收敛第一个后置到 0.17，但不得拆出第三种状态变体。
- 出题引擎是深模块的范本：接口一个函数，底下换检索策略不动调用方。
