# E2E 修复方案与 Spec 审查

日期：2026-10-13。范围：`docs/testing/e2e-remediation-plan-2026-10-13.md`、`docs/testing/e2e-remediation-matrix-2026-10-13.md`、`docs/agent-system-specs/40-e2e-remediation-and-release-gates.md`，并对照 `.e2e/production/coverage-audit.json`、确认问题审计、相关 ADR 和 392 项验收标准。

## 基线核对

- 67 个问题仍为 67 个唯一 `ISS`，优先级为 P0=5、P1=44、P2=18。
- 主责包计数仍为 W01=5、W02=9、W03=1、W04=6、W05=8、W06=6、W07=4、W08=6、W09=5、W10=1、W11=12、W12=2、W13=2，共 67。
- 覆盖账本仍为 392 项：AgentChat 222、其他页面 170；历史状态仍是 pass=0、fail=117、partial=229、blocked=44、not_run=2。
- 矩阵引用的 117 个 AC/PG ID 均存在于 392 项账本；矩阵不是完整 392 项清单，完整清单必须由最终 manifest 承载。

## 已发现并收口

1. **批次口径冲突**：执行方案是 B0–B5 六批，Spec 原先写五批。现统一为六个内部实施/验收批次，B5 才做一次正式生产切换。
2. **依赖循环**：W02 原先写成依赖 W03/W04，而 W03/W04 又依赖 W02。现明确 W02 先提供基础 admission、continuation、contract、evidence 接口，W03/W04 依赖它，附件具体实现归 W04。
3. **ADR-0029 遗漏**：补充非终态旧 Run 保留原 `runId`、owner/conversation 绑定，基于持久证据重验证，缺证据安全暂停，并将迁移记录和独立读回纳入 B0。
4. **ADR-0022/0026 遗漏**：补充一次生产切换、Worker 唯一执行者、`AGENT_RUNTIME_MODE=worker_all`、legacy/direct path 不可达和 HTTP 410/拒绝证据要求。
5. **全量边界遗漏**：新增非 67 问题责任矩阵，覆盖 AC-RUN、CTX、COL、INT、RES、POS、MEM、OFR、SIN、TOL、UIX、VOC、CHN、EXT 组，并要求 170 个 PG ID 逐项进入 manifest。
6. **故障夹具门槛过松**：`AC-RUN-016` 与 `AC-EXT-010` 明确为适用项，必须在 FAULT/BROWSER-MOCK 执行，不能用 N/A 或“已有处置证据”替代 pass。
7. **工具覆盖不完整**：静态 55 工具和启动后的 MCP 动态 manifest 都要做差异审计；基线中 14 个无结果工具必须补证据或记录隔离阻断。
8. **质量门禁边界不清**：补充 ADR-0041 的 deterministic number/factuality hard veto 与 resume faithfulness soft/advisory 语义，并要求 `taskType × rubric × threshold × missing/error action` 版本化。
9. **面试评分遗漏**：矩阵和全量边界补充 ADR-0042 的 0–4 anchored rubric、答案证据引用、missing-evidence hard veto 和至少三个 session 的趋势门槛。
10. **历史数据权限歧义**：真实用户记录即使有确定来源，也只能生成可逆候选并逐条确认；确定来源不能绕过确认自动修正。
11. **多 Agent 语义遗漏**：补充跨目标交接新建 Run、同目标专家留在原 Run、显式用户授权，以及 required child 与 supporting child 的不同失败语义。
12. **故事与问题非一一对应**：明确 67 条 User Story 是主题目标，矩阵和最终 manifest 才是问题闭环依据；每个 manifest 条目必须有 `issueId`、`storyIds` 或 `matrix-only` 原因、AC/PG、主责、fixture 和 oracle。
13. **发布措辞歧义**：D1 已明确为 B0–B4 分批修复/验收/canary，B5 按 ADR-0022 执行一次正式生产切换，避免把内部批次误读为模块分别切换线上 ownership。
14. **计划结构和编号错误**：删除历史数据处理中重复的非终态旧 Run 条目；边界责任表明确主责包与协作包，避免多个包同时被误判为 gate owner。

## 仍需遵守的发布约束

ADR-0022 明确反对按模块分别切换生产行为。因此 B0–B4 只能用于隔离、预生产或关闭状态的候选验证；B5 统一完成正式生产切换。若仍要让 B0–B4 对真实用户逐批生效，必须先另行修订 ADR-0022，并补充跨批兼容迁移和回滚证明。

本轮只审查和修正文档，没有修改业务代码、数据库或部署状态。

## 最终核验

- 方案章节已按 `3.1` 首轮源码落点、`3.2` 全量边界责任排序；历史数据清单仅保留一条非终态旧 Run 迁移规则。
- D1、Spec 标题、测试计划索引和系统 Spec 索引均明确“分批内部实施/验收，一次生产切换”；方案状态已更新为 D1–D10 已确认。
- 矩阵 67 行/67 个唯一 `ISS`、覆盖账本 392 项、Issue #2 正文与本地 Spec 内容逐字一致；`git diff --check` 通过。
