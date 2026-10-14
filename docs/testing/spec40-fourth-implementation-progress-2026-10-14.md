# Spec 40 第四批实现与验收进度

日期：2026-10-14。固定基线：`1c055bd77bab7c6ae5ea5c1bd1cc75c79fa7ee66`。继续在 `master` 实施 W07 的隔离切片，生产版本仍为 0.13.2。本批未推送、部署或处理真实用户历史。

## 本批行为

| 关联问题 | 已实现与实际证据 | 仍未关闭的边界 |
| --- | --- | --- |
| ISS-008 / PG-MEM-002、006 | 真实 UPDATE 的五参数/四绑定 `08P01` 根因修复；候选确认与纠正共享事务；故障 trigger 后独立跨表快照不变；同来源/同纠正串行及并发只产生原精确回执，陈旧或不同来源不能覆盖新事实 | 全部原规范参数与跨层、真实历史处理 |
| ISS-028 / PG-MEM-003 | 完整中文/英文薪资句与结构化/原文统一用途确认及 private；第三方、否定、引用、历史不可冒充本人当前偏好；敏感候选持久化精确 owner/source/fact/job-seeking purpose；取消与权限失败不写 | 真实模型抽取质量、所有语言表达与历史可信迁移 |
| ISS-057 / AC-MEM-005、009 | disabled、配置缺失、429 下保留受管词法/实体/中文薪资结构召回；可用事实进入实际 `llmSummary`，同时标检索局限；来源、ACL、有效状态、清除与晚到抑制再读保护 | 实际 Worker 与全部真实模型/向量参数、跨存储恢复 |
| ISS-059 / PG-MEM-001 | 页面区分 loading、ready、unavailable；503 不显示零条，隐藏写操作并禁用未知发现设置；重试恢复精确 2 候选/7 事实、正文、来源及分区 | 外部参数与最终逐项验收账本 |

薪资纠正的语义也进入闭环：旧 generic/core 的“我期望30K”纠正为裸 `40K` 时，旧上下文仍要求新用途确认；替代事实只存用户明确金额，谓词细化为薪资偏好，进入 private。薪资询问和实际模型上下文只返回新 `40K`，不返回失效旧 `30K`；同纠正重放复用原回执。

数据库读取不再自动创建 ACL，缺表、零配置、缺分区均关闭。PostgreSQL 受管路径停止读取无准入/分区证明的旧 chunks、profile、memory items 或外部传入 snippets，原记录保留等待可信迁移。画像的每一项依赖都验证 owner、private、active、source 与擦除抑制，不以部分存活事实继续展示旧整块画像。

擦除 hash 与来源/目标键由共享 SQL 实现，trim 覆盖 JavaScript 的 Unicode 空白，小写显式使用 `und-x-icu`。发布检查器验证 collation 可用与 `İ`/`ΟΣ` 固定行为，缺失阻断。该局部检查通过不表示完整发布门通过。

## 首败与验证

账本及准入首失败详见 [账本专项](spec40-fourth-memory-ledger-progress-2026-10-14.md) 与 [敏感薪资专项](spec40-memory-salary-progress-2026-10-14.md)。根代理额外保留 `.private/spec40/` 中的以下产品首败：

- `fourth-retrieval-first-red.log`：embedding provider 构造在降级保护之外，disabled 无法返回事实。
- `fourth-profile-source-first-red.log`：画像依赖绕过 source allowlist。
- `fourth-late-suppression-first-red.log`：检索后新增来源/目标抑制仍从 provenance 返回。
- `fourth-correction-consent-first-red.log`：敏感纠正可绕用途确认。
- `fourth-correction-context-product-red.log`、`fourth-correction-context-recall-red.log`：裸金额丢失旧薪资敏感语义与后续召回。
- `fourth-memory-unavailable-ui-first-red.log`：503 被显示成确定零条。

隔离数据库停止导致的连接失败、路径或 fixture 初始化错误单列为环境失败，不作为产品首败。恢复使用本机缓存 pgvector 镜像与专用合成库，不使用生产凭据或数据。

冻结源码全量 suite 为 **320 文件、1980 项通过、2 项跳过**，Runtime、面试、定位、协作、记忆账本、记忆检索六组本机 PostgreSQL fixture 均实际启用，串行文件运行避免全库 gate/trigger 竞争。日志：`fourth-fullsuite-final-2026-10-14.log`。其中新服务测试为 ledger 33、admission 23、retrieval 15；jsdom UI 3，均不折算成 392 外部规范。

Web 与 Worker production build、知识 drift、构建后独立类型检查通过。类型检查与 Next build 并发曾出现 `.next/types/root-params.d.ts` 消失，日志保留；构建完成后的串行类型检查通过。定向 ESLint 为 0 error、1 warning（页面 effect 调用读取入口），不宣称零 warning。

独立 Spec 审查先运行五文件 143 项，通过后又单独复验 UI 3 项、上下文纠正与薪资召回 2 项、Unicode PostgreSQL 2 项；这些是分阶段证据，不把重复运行相加。Standards 最终硬规则违反 0、未修阻断性判断问题 0，Unicode drift 已返工验证。双轴结论见 [第四批审查](../review/spec40-fourth-implementation-review-2026-10-14.md)。

真实 Chromium 三条补充回归全部通过：纠正的 422/取消/用途确认/private 替代/刷新/精确重放，敏感候选的取消/同意/原始证据/刷新/重放，以及记忆不可用/禁写/真实重试恢复。第三条只在浏览器注入 `GET /api/memory/candidates` 的 503；其他登录、API 和 PostgreSQL 均为真实路径，无 Worker 或模型调用。记录为页面补充回归，不折算为完整 AC-MEM 或 392 项完成。证据 ID：`20261014-memory-fourth-final04`；runtime 使用冻结 production `next start`。完整 hash、首失败和重跑边界见 [浏览器专项](spec40-fourth-memory-browser-progress-2026-10-14.md)。最后新增 harness 的类型检查及 ESLint 通过。

## 剩余验收与发布

完整 W07 仍为 partial：所有 AC-MEM 参数、实际 Worker/真实模型抽取与质量、历史 ACL/来源准入及只读影响清单、定向擦除的 Mastra/session/向量/缓存全层读回、恢复重放与完整故障竞态矩阵尚未全部验收。`listOpenFacts`、`listFactsByEpisode`、管理事实列表与实体摘要仍有待统一的历史抑制/来源边界，不用本批检索修复冒充全部读接口收口。

67 项尚未全部关闭，392 项尚未完成，B0–B4 继续隔离验收；B5 的统一正式生产切换仍需所有适用 case、P0、迁移、质量、工具覆盖、不可变构建与 canary 门。既有 E2E 初始化、`CONTEXT.md`、`package.json` 未纳入本批提交。
