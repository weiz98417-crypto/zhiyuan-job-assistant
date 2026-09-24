# Change: agent-architecture-specs

将已确认的纸鸢 Agent 系统架构与记忆治理方案拆为十三个可独立领取的实施 spec。Spec 01–07 定义运行架构，Spec 08–13 定义分层记忆、用户治理和迁移门禁。各篇遵守所引用的 ADR，以及“代码渐进迁移、生产一次切换、稳定后删除旧路径”的运行架构发布策略。

## Status

本目录中的文档是可发布为 GitHub Issue 的本地草案。每份草案的目标标签均为 `ready-for-agent`。Spec 08–13 尚未在远端创建 Issue，发布状态以本索引为准。

## Release Boundary

已推送、尚未部署的 `integration/0.10.8` 按现有合并范围独立发布，发布前须完成已确认的生产只读快照、备份、兼容性增量 schema 迁移与 preflight 门禁。本目录的架构升级属于后续版本：代码可分阶段实现和验收，但 Admission、Continuation、Task Program 与 Conversation Item 的生产 ownership 按 Spec 07 一次切换。`docs/UPGRADE-PLAN-2026-09.md` 中 M1–M6 可独立发布的描述只适用于该轮升级，不改变本目录的统一切换约束。

本轮 Task Program 纵切按 Spec 03 的 JD 评估、文件导出、岗位发现，随后简历修改的顺序推进。九月升级计划中从简历修改开始的 M3 顺序是已完成初版的实施记录，不是本轮持久化 Program reducer 的顺序。

Spec 08–13 属于后续记忆运行时升级，不扩大 `0.10.8` 的既定发布范围。当前分支已实现事实账本、候选准入、统一检索、Mastra session adapter、跨层清除和用户治理代码；真实 PostgreSQL/pgvector 连续会话、恢复重放和发布门禁证据仍是启用该运行时的必要条件，不能仅凭表或函数存在判定交付。

## Specs And Dependencies

| ID | Spec | Depends on |
| --- | --- | --- |
| 01 | Run Admission | 已确认的领域词表与 ADR-0017 |
| 02 | Run Continuation | 01 的 Admission decision 合约、ADR-0018 与 ADR-0021 |
| 03 | Task Program Registry | 01、02 与 ADR-0019 |
| 04 | Conversation Item Projection | 02、03 与 ADR-0020 |
| 05 | Persistence Migration And Feature Flags | 01–04 的稳定 interface |
| 06 | Evaluation, Replay And Release Gates | 01–05 的 fixtures、schema 与 feature flags |
| 07 | Production Cutover And Legacy Removal | 01–06 的所有确定性门禁 |
| 08 | Layered Memory And Fact Ledger | 05 的 schema ownership、ADR-0028、0033、0034 |
| 09 | Memory Admission And Candidate Lifecycle | 08、01 的操作意图、03 的已验证事实、ADR-0032、0034 |
| 10 | Memory Retrieval And Job-Seeking Profile | 08–09、ADR-0028、0032、0034 |
| 11 | Targeted Memory Erasure | 08–10、ADR-0028、0033 |
| 12 | User Memory Governance | 08–11、ADR-0028、0032、0034 |
| 13 | Memory Migration And Release Gates | 05–07、08–12、ADR-0028、0033、0034 |

## Shared Seams

- 所有入口统一经过 **Run Admission**；Web、卡片和工作台只是 adapter。
- 所有续跑输入统一经过 **Run Continuation** 的 Continuation Stimulus inbox。
- 所有显式用户目标统一由 **Task Program** 推进；模型不拥有阶段跳转权。
- 所有用户界面统一读取 **Conversation Item** 持久投影。
- 所有个人记忆写入经过 **Memory Admission**，候选确认前不影响任务。
- 所有长期记忆读取经过统一检索与画像入口，服务端验证归属、分区和状态。
- 定向记忆清除以用户确认范围到跨层读回为验收边界。

前四项继承已确认的运行架构方案；后三项落实 ADR-0028、0032–0034 的记忆治理决策。

## Publishing

将每个尚未发布的编号文件作为一个 Issue body 创建，并添加 `ready-for-agent` 标签。创建顺序遵循上表；实现可以在依赖满足后并行。发布前核对主要测试 seam 与用户确认的范围。
