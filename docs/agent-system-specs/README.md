# Change: agent-architecture-specs

将已确认的纸鸢 Agent 系统架构方案拆为七个可独立领取的实施 spec。它们保留同一领域词表、ADR-0013 至 ADR-0022 的约束，以及“代码渐进迁移、生产一次切换、稳定后删除旧路径”的发布策略。

## Status

本目录中的文档是可直接发布为 GitHub Issue 的本地草案。每份草案的目标标签均为 `ready-for-agent`。当前环境未登录 GitHub CLI，因此尚未在远端创建 Issue。

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

## Shared Seams

- 所有入口统一经过 **Run Admission**；Web、卡片和工作台只是 adapter。
- 所有续跑输入统一经过 **Run Continuation** 的 Continuation Stimulus inbox。
- 所有显式用户目标统一由 **Task Program** 推进；模型不拥有阶段跳转权。
- 所有用户界面统一读取 **Conversation Item** 持久投影。

这些 seams 直接继承自已确认的架构方案，不在本次拆分中重新开放决策。

## Publishing

GitHub CLI 完成认证后，将每个编号文件作为一个 Issue body 创建，并添加 `ready-for-agent` 标签。创建顺序遵循上表；实现可以在依赖满足后并行。
