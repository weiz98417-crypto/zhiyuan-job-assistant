# Spec 25: Knowledge And Prompt Registry

**Target label:** `ready-for-agent`  
**Depends on:** 2026-10B 计划 Q6/Q17（无独立 ADR，维护政策记于本 spec）、verify:tokens 护栏模式（scripts/check-design-tokens.mjs）；批次归属 0.15.0 · 地基车（g-knowledge-registry）

## Problem Statement

提示词与领域资产四处散落无清单：`modes/zh/*.md`（2052 行）与 `modes/` 顶层的英文文件（17 个 md、1671 行，**没有 modes/en 目录**——英文经 `jd-evaluation-service.ts:135-137`、`evaluate/stream/route.ts:78` 以 `language==="zh" ? "zh" : ""` 读 modes 顶层）双语并行手写，且中英文件集不对称：顶层英文有 batch/oferta/patterns/project/training 无中文对应，zh 有 dingwei/jianzhi/jianzhi-risk/risk-intel 无英文对应。`registry/agents/*/agent.md` 六份、`skills/`、`interview-prep/` 各自为政；服务内嵌 prompt 字符串（出题 3 行 `interview-analysis-service.ts:131`、评分 `:159-205`、ATS 1 条 `ats-analysis-service.ts:27`、分栏 1 行 `resume-import-service.ts:243`）游离在任何登记之外。重复定义：COMPANY_MODE_MAP 双份（`interview-agent.ts:17-31` ⇄ `interview-coach-prompt.ts:6-20`）、A-G 权重三处（evaluate/agent.md、scoring-dimensions.yml、evaluation-scoring.ts）。死接线：`jd-signals.ts` 的 `detectSignals` 经 `knowledge/index.ts:52-56,92` 接进 `injectKnowledge("evaluate")`，但生产调用点（profile-agent 仅 scenario=dingwei；shared-memory.ts:166 与 orchestrator/index.ts:296 均不传 jdText）从不传 jdText——接线存在、从未触发。环境混淆：`resume-agent.ts:34` / `evaluate-agent.ts:78` 服务端构建 prompt 时 `fetch http://localhost:3000` 自调用，`interview-agent.ts:126` 在 buildSystemPrompt 里读 localStorage。能力层迭代的主旋律就是改提示词和领域数据——四处找等于改不动。

## Solution

建统一知识注册表：数据文件（md 加 frontmatter、yaml 加注释头或旁路清单登记 id/版本/来源/last-reviewed/消费方）+ 类型化加载器。服务内嵌 prompt 全部迁入；重复定义收敛单源；中文为唯一事实源，英文镜像改为脚本生成物并加 drift 检测护栏；清死接线与环境混淆。

## User Stories

1. 作为实现 Agent，我希望改一条提示词只改一处，从而所有消费方自动拿到新版本。
2. 作为实现 Agent，我希望新增领域知识等于加一个数据文件，从而不动服务代码。
3. 作为维护者，我希望中英文 drift 在 CI 被检测到，而不是靠记忆同步。
4. 作为评审者，我希望提示词资产有可审计的清单（版本/来源/行数/last-reviewed）。
5. 作为运维，我希望服务端 prompt 构建不再依赖 localhost 自调用和浏览器 API。

## Implementation Decisions

- **形态**：注册表放 `src/lib/agent/knowledge/registry/`（数据文件 + 类型化加载器）。**frontmatter 只用于 md 文件**；`risk-intel-triggers.yml` 等 YAML 不加 frontmatter（顶层 `---` 是文档分隔符，会破坏 js-yaml 解析），改用注册表旁路清单（JSON）登记元数据。
- **加载点改线清单**（迁移面如实列出，不是「无感」）：`jd-evaluation-service.ts:135-141`、`evaluate/stream/route.ts:78-84`、`cv/analyze/route.ts:45`、`agent/mode/[mode]/route.ts:16`、`agent/decode-terms/route.ts:9`、`agent-mode-service.ts:5-6`、`jd-risk-service.ts:57,73`、`scripts/scan-risks.mjs:24-25`。前七处是应用内 TS，改读加载器；`scan-risks.mjs` 是应用外独立脚本、import 不了 TS——它读的 YAML 路径保持不变（注册表旁路清单对它只读不动）。
- **迁移不改语义**：出题/评分/ATS/分栏四个服务内嵌字符串迁为注册表条目，服务代码只引用条目 id。这些 prompt 的实际重写分别归 Spec 26/27/24；本 spec 只搬家，对固定输入的 prompt 组装结果与迁移前逐字节相等（frontmatter 由加载器统一剥离；环境混淆清理项除外）。
- **单源收敛**：COMPANY_MODE_MAP 合一为单源导出；A-G 权重以 scoring-dimensions.yml 为载体，agent.md 与 `evaluation-scoring.ts` 改读它。
- **jd-signals 处置**：删除从未触发的 `detectSignals` 函数与 `injectKnowledge` 的 jdText 参数链；23 条词表**保留 glossary（速查词汇）语义**迁入注册表，不并入 risk-intel（risk-intel 词条是带 severity 的风险判定，消费语义不同，合并会改变 JD 风险引擎输出、违反本 spec「不改语义」承诺）。
- **中文唯一源**：`modes/` 顶层的英文文件改为生成物——`scripts/gen-en-modes.mjs`（LLM 翻译 + diff 人工过目后入库），**只对存在中文对应的文件集生成**；英文独有的 batch/oferta/patterns/project/training 保留原样并在注册表标注 `legacy_en_only`（待 Spec 26/27 迭代时评估去留）；zh 独有文件暂无英文属预期，不反向生成。`check-knowledge-drift.mjs` 护栏进 CI：生成的英文镜像与最近生成清单不一致即 fail（护栏模式沿 `scripts/check-design-tokens.mjs`）。
- **环境混淆清理**：`resume-agent.ts:34` / `evaluate-agent.ts:78` 的 localhost fetch 改为进程内资源解析（资源列表本进程可查）；`interview-agent.ts:126` 的 localStorage 读取移出 buildSystemPrompt，该值经参数传入。
- **story-bank.md** 保持空模板登记（启用归 Spec 29）。

## Testing Decisions

- prompt 组装快照：每个消费方对固定输入的产出与迁移前 baseline 逐字节一致（frontmatter 剥离后；显式标注的清理项除外）。
- drift 护栏：篡改生成英文镜像一行必须 fail；不跑生成脚本直接改英文同样 fail；`legacy_en_only` 文件不受 drift 约束。
- YAML 兼容：`risk-intel-triggers.yml` 迁移前后解析结果深度相等（js-yaml 冒烟）。
- 注册表完整性：消费方引用的条目 id 必须存在（类型级 + 加载时校验双保险）；scan-risks.mjs 的读取路径不因迁移而变。
- 环境混淆回归：服务端构建路径不再出现 `fetch localhost` / `localStorage`（检查脚本断言进 CI，沿 verify:tokens 形态）。

## Out of Scope

- 不改任何提示词语义内容（Spec 24/26/27 的活）；不做提示词在线管理界面；不建 prompt 版本数据库（登记元数据 + git 即版本）；英文独有文件的去留决策（待能力层迭代）。

## Further Notes

- 2026-10B Q17 决策：知识注册表不立独立 ADR（维护政策），本 spec 即记录。
- 本 spec 是 Spec 26 rubric 文本与 Spec 27 岗位族/公司风格数据的挂载点，0.16a 与 0.16b 都对它有硬依赖。
- 提示词迁移时对照 Resume-Matcher（Apache-2.0）的 enrichment/refinement/wizard 三段式组织方式作参考，不逐字搬运。
