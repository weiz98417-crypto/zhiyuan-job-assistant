# Spec 28: Salary Benchmark Pipeline

**Target label:** `ready-for-agent`  
**Depends on:** ADR-0043（条款 2）、Spec 27 的岗位族共用分类、JD 风险引擎的既有抽取模式；批次归属 0.18.0 · 飞轮车（j-salary-benchmark）

## Problem Statement

薪酬基准是两套静态硬编码并存：`knowledge/salary-benchmarks.ts`（16 行×6 行业、AI 行业固定 +15%，`:33-46`）注入评估 prompt；`modes/zh/risk-intel.md` 内嵌 46 条城市×行业×年限基准（v1.0.0 后无版本演进痕迹）。两套都无来源链接、无更新时间、无样本量。JD 评估 D 板块的薪资谈判建议全靠这些静态数。而岗位机会池的 JD 文本里本来就有薪资信息，却没有结构化字段（`server-schema.sql:377` 的 `monthly_salary` 只在用户手录的 offers 表）。调研结论：中文市场没有可用的开源薪酬数据——这既是缺口，也是该自建的数据壁垒。

## Solution

机会池薪资正则抽取 → 基准条目表（带来源/样本量/时间窗）→ 双条件覆盖静态 seed → 两套合一（ADR-0043 条款 2：只走第一方合法路径）。

## User Stories

1. 作为求职者，我希望薪资建议旁边能看到数据来源与样本量，从而判断建议可信度。
2. 作为求职者，我希望「这个 offer 给低了」的判断基于同城同岗近期分布，而不是模型拍脑袋。
3. 作为实现 Agent，我希望基准是一张表一个查询，而不是两个硬编码文件。
4. 作为维护者，我希望静态 seed 有版本与 last-reviewed，从而知道何时该复核。
5. 作为发布负责人，我希望「估算值不计入评分总分」是被断言固定的纪律。

## Implementation Decisions

- **机会表加薪资字段**：岗位机会表加 `salary_min/salary_max/salary_unit`（月/年规范化）+ 抽取置信标记；从 JD 文本确定性正则抽取（「15-25K·14薪」「20-30万/年」「薪资面议」等模式），与 JD 风险引擎同一工程路数；抽取失败留空不猜，「面议」单独标记。抽取正则进 Spec 25 注册表便于维护。
- **表设计**：`salary_benchmarks`（城市×岗位族×年限段 → P25/P50/P75 + `source: static_seed|opportunity_pool` + `sample_size` + `window_start/window_end`）。岗位族与 Spec 27 共用两级分类。DDL 只写 `postgres-schema.sql`（Postgres-only，同 Spec 27 的 2026-10-03 决策；机会表加列同样只落 Postgres schema）；git 回退后残留空表无害，聚合水位重置即回到静态 seed。
- **聚合双条件**：样本量 ≥30 且 JD 发布/扫描时间在最近 12 个月内才计入聚合；达标条目显示「实时聚合·N 条样本」，未达标回落 static_seed 并标「静态参考」。
- **两套合一**：`salary-benchmarks.ts` 硬编码与 risk-intel 46 条合并为统一 static_seed 导入（来源标注沿 risk-intel.md 头注：智联 2025AI 人才报告/脉脉/Boss 直聘，加 last-reviewed）；`salary-benchmarks.ts` 删除，prompt 注入改读基准表。
- **D 板块引用纪律**：评估输出引用基准时必带来源标注；估算值不计入评分总分（与 ADR-0041 溯源同一哲学）。
- **聚合触发器（事实澄清：不存在「既有扫描完成钩子」）**：扫描完成是 `scripts/scan-worker.mjs` 内联 SQL `SET status='done'`（:349 SQLite / :504 Postgres），无回调无事件，且该脚本在 Next.js 应用之外。两个选型：(a) 改 scan-worker.mjs 在完成处发应用内通知——动应用外脚本，且 ADR-0039 先例约束「digest work must not alter scan-worker behavior」，非首选；(b) **默认选 (b)**：应用侧对 `scan_jobs` 表做增量重算（读取路径惰性触发或低频轮询，比对上次聚合水位），完全不碰 scan-worker。重算发生在系统层（调度器/读取路径），**不得做进岗位精选无人值守 Run 内**（ADR-0039 只读契约：该 Run 禁用写工具，重算是数据库写入）。
- **存量不回填**：聚合只从本 spec 上线后的新扫描起累积，存量 scan_jobs 不回填（旧数据薪资字段缺失、来源时间窗不可考）；上线初期由静态 seed 兜底是预期行为。

## Testing Decisions

- 抽取正则正反例：含「面议」「13薪」「万/年」边界；抽取失败留空断言。
- 双条件：29 样本不覆盖 seed / 30 样本覆盖；13 个月前的 JD 不计入。
- D 板块：引用无来源标注的输出被校验拒绝；估算进总分的用例必须 fail。
- 合一后 `salary-benchmarks.ts` 引用零命中（grep 断言）；prompt 注入内容等价或信息量增强。

## Out of Scope

- 用户本地薪资采集器（ADR-0043 条款 3，后置可选）；levels.fyi 类海外数据；薪资基准管理 UI；offer 对比功能的既有 offers 表不动。

## Further Notes

- ADR-0043 是数据来源合規性的决策依据：服务端采集第三方平台永久不做。
- 早期样本不足时静态 seed 长期是默认显示——这是 2026-10B 计划风险清单确认的预期行为，不是缺陷。
