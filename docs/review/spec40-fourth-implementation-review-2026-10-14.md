# Spec 40 第四批双轴审查

日期：2026-10-14。固定基线：`1c055bd77bab7c6ae5ea5c1bd1cc75c79fa7ee66`。审查对象为基线后的第四批工作区差异及新增文件：受管记忆账本、准入、纠正、降级召回、来源/ACL/擦除保护、页面不可用态与真实浏览器闭环。既有 CONTEXT、package 和 E2E 初始化差异排除。

按 implement/code-review 工作流分别审查 Standards 与 Spec。来源包括根 AGENTS、Spec 40、验收标准、修复总方案以及 Fowler 判断性 smell。最后 browser harness/ICU checker 又由 `memory_browser_final` 和 `remaining_inventory` 分轴复核，根代理独立执行真实 Chromium 与最终类型/lint，未把作者自检替代独立审查。

## Standards

前期独立审查发现 JS 与数据库 Unicode 小写差异导致擦除 hash 不一致，已要求返工。共享 SQL 使用完整 JS trim 集合和显式 `und-x-icu`，`İ` 与 `ΟΣ` PostgreSQL 反例通过；发布检查器缺 ICU 或行为不符明确失败。本切片无剩余硬标准违反。

浏览器新增 fixture 曾缺逐条来源 SHA/创建时间/允许 caseIds、runtime manifest 校验，已补 v2。fixture ID 必须显式提供；原子预留 Evidence ID；manifest/build/source 与实际 runtime 匹配；私有账号不进入代码或输出。最后复审未发现剩余阻断项。

非阻断的命名建议：当前复用既有 `requireInterviewEvidenceId` 等 helper，其报错仍含面试环境变量名，后续可在统一证据模块时改通用名称。未因此扩大本批范围。

## Spec

产品修复经过首失败与反例验证：UPDATE 参数真实 08P01、事务故障部分写入、即时准入/纠正重复回执、旧金额上下文丢敏感语义/召回、缺失 ACL 被自动补权限、provider 构造无法降级、旧材料越过准入边界、画像依赖错源、检索后晚到抑制，以及 503 伪装零条。实际用户正文与 object 保留，敏感用途独立确认，正确 private 替代后的金额进入真实 context 构建。

最后浏览器审查发现 build hash 未覆盖 Next 根 manifest/运行配置，取消/重放快照未覆盖派生表，已返工补齐；确认后另核无关事实/候选/ACL不变。两项复审关闭，当前三条切片无剩余 Spec blocker。真实 Chromium 3/3 通过，但未运行 Worker/模型且 503 为浏览器注入，只作为明确层级的补充回归。

## 验证与未关闭范围

冻结生产源码全 suite：320 文件、1980 项通过、2 项跳过，六组真实隔离 PostgreSQL fixture 启用；Web/Worker production build、knowledge drift、构建后串行类型检查通过。最终 browser harness 类型检查、定向 ESLint 通过；生产代码定向 lint 留 1 个页面 effect warning。构建/类型并发导致的生成文件 TS6053、隔离 nested build、登录配置与 locator harness 失败各保留，不包装成产品首败或零失败历史。

完整 W07、67 问题和 392 验收仍 partial：实际 Worker/模型与全参数、历史可信 ACL/来源迁移、管理列表/实体摘要的一致抑制、跨 Mastra/session/vector/cache 擦除、恢复重放、完整竞态和发布聚合未全部关闭。备份/恢复证据缺失使 memory release gate overall false，ICU 局部门通过不能放行生产。本批未推送或部署，B5 仍是唯一正式生产切换。

两轴当前本切片剩余阻断项均 0；完整 Spec 保持 partial。详细证据见 [第四批进度](../testing/spec40-fourth-implementation-progress-2026-10-14.md) 和 [浏览器专项](../testing/spec40-fourth-memory-browser-progress-2026-10-14.md)。
