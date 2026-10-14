# Spec 40 第三批证据门禁切片

基线：`a8b4462aa6f32f33f39d87f953ad77a6fb0c8c2f`。本批继续 B0/B1，在隔离环境实施；生产版本保持 0.13.2，不推送或部署。

## 实施边界

原 `build-e2e-remediation-manifest.mjs` 生成 392 项与 67 个问题的清单。其 `remediationGateFailures` 是初步阻断检查，不能仅凭手填状态、真假标记或 UNIT 名称完成正式放行。本批新增 `check-e2e-remediation-gate.mjs`，以当前规范重建预期定义，并核对执行回执与原始观测文件的 SHA-256。

- 改写 case 的来源、oracle、owner、层次、issue/story/priority 或数量都会阻断；AC-RUN-016、AC-EXT-010 的 FAULT 不能从清单中删去。
- 每个 case 展开命名参数实例，固定 fixture version/hash。每个实例所需的每个层次都必须独立执行。
- receipt 绑定 build/code/model/prompt/tool/fixture/judge 版本，以及 case、参数和层次；文件缺失、改写或逃出 evidence root 都不能算通过。
- 请求、输出、独立读回、禁止副作用、刷新及来源观测均引用实际保存文件；截图或手填 `readBack: true` 无法替代这些文件。
- 首次执行与重试分别保存，attempt number、唯一 ID 与 previous receipt hash 形成链。最终成功可以接在已保存的失败之后；删除首失败或断链会阻断。
- runtime preflight、迁移 dry-run/rollback 与静态/动态工具清单都必须有版本一致的独立回执及观测；仅写 `pass` 不会放行。

## 质量策略

`scripts/lib/e2e-release-quality-policy.mjs` 固定 `spec40-task-risk-v1`。它覆盖 12 个用户任务和系统 `job_digest`，每个任务有固定 rubric version、风险和最低分。关键任务初始最低分 0.8，辅助任务 0.75；这些值来自已批准方案，尚未完成本批真实固定 fixture 校准，不能宣称已校准或发布可用。

最终 BROWSER-LIVE receipt 必须为参数中每类任务保存 Judge 结果，且与冻结 Judge/rubric 版本一致。关键任务低分或 Judge 缺失/报错/非法分数阻断；辅助任务只可降级，必须在保存的用户输出中找到明确限制说明。缺少有 fixture/hash、样本记录及批准身份的质量校准回执时，整个门禁保持阻断。

前 12 项 `AC-SIN` 固定绑定各用户任务，Offer、面试和定位组固定绑定相应关键任务，防止将 Offer 跟进改成低风险通用回答。case→task 映射和单轮任务顺序也进入 policy hash；旧校准不能沿用在修改过的任务绑定上。`AC-SIN-013..024` 是额外场景，不按不存在的第 13–24 个任务索引强制误拒；其完整参数/任务映射仍待审查。

此处是发布评测策略，不改变 ADR-0041 的线上简历 faithfulness 软门；确定性数值/事实错误始终硬失败。

## 使用

```powershell
node scripts/build-e2e-remediation-manifest.mjs --output=.private/spec40/acceptance-manifest.json
npm run check:e2e-remediation -- --manifest=.private/spec40/acceptance-manifest.json --evidence-root=.private/spec40 --output=.private/spec40/gate-report.json
```

退出 0 表示该检查器接受提交的证据；退出 1 表示未满足条件；缺命令参数退出 2。报告只输出稳定失败代码和汇总，不输出原始用户内容或凭据。当前清单尚未执行，正常结果必然是阻断。

## 回执约定

Manifest 的 `release` 必须保存 `buildId/codeCommit/modelVersion/promptVersion/toolVersion/fixtureVersion/judgeVersion`。所有文件引用形如 `{path, sha256}`，path 相对于 evidence root，禁止绝对路径和 symlink 逃逸。

每个 case 的 `parameters.instances` 为 `{id, values, fixtureHash, fixtureVersion, taskTypes?}`。`evidence` 中的 `{layer, receipt}` 引用 case receipt；`firstResult.receipts` 引用各实例/层次的首次 receipt，`retries[].receipts` 引用之后的 receipt，首次失败不可覆盖。

Case receipt 保存 `schemaVersion: 1`、`kind: case`、`caseId/parameterId/layer`、`release`、`fixtureHash/fixtureVersion`、`attemptId/attemptNumber/previousReceiptHash`、`result`、`deterministicFailures` 和 `observations`。observations 通过 `{kind, reference}` 保存六类观测文件。BROWSER-LIVE 另有 `quality[]`，保存 taskType、Judge/rubric version、status、score；辅助降级另保存 outcome/limitation。

`prerequisiteEvidence` 引用三个 prerequisite receipt，保存同一 release、name、result、failures 和 observations。质量校准 receipt 由 `release.qualityCalibration` 引用，固定 policy version/hash、judge version、fixture hash、sample count、approvedBy 与样本观测；该文件必须来自真实校准流程。校准的 `tasks[]` 必须完整覆盖 13 类任务，各自保存 `taskType/rubricVersion/minimumScore/samples[]`；每个 rubric 至少有一个正例和一个阻断或降级负例，并独立保存对应 Judge sample receipt，不能以一个通用样本替代所有 rubric。

## 当前验证

CLI 纵切保留红→绿证据：手填通过、规范篡改、失败回执、过期代码版本、缺观测、保留失败后恰当重试、关键任务低分和不完整校准均有回归。审查补齐声明回执被遗漏、任务风险改名降级、校准 hash 未绑定 case 映射以及额外单轮场景误拒四项回归。当前定向 2 文件 13 项通过（检查器 11 项、inventory 2 项）；原专项 ESLint 无错误，追加修改待统一检查。实际生成未执行清单并调用检查器，得到 392 case / 67 issue、退出 1 和 1892 个阻断代码；这是预期阻断，不能报告为验收通过。后续统一验证与独立审查结果单独记录。

## 明确未完成

检查器验证清单与证据的一致性，不独立判断每个业务 oracle，也不能证明由人工编造的观测来自真实执行。仍需接入实际 E2E runner 的观测产出、可信 Eval Run/审批记录、完整固定 rubric 与真实 Judge 校准、392 项参数完整性审查、55 工具和动态 MCP 的实际覆盖、N/A 审批、不可变构建与 canary 正式聚合。上述缺口以及全部 67 项问题继续保持开放；这份切片不等于正式 B0/B1/B5 放行器。
