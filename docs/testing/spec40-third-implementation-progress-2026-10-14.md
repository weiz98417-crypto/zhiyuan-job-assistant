# Spec 40 第三批实现与验收进度

日期：2026-10-14。固定基线：`a8b4462aa6f32f33f39d87f953ad77a6fb0c8c2f`。继续在 `master` 实施 B0/B1 的隔离切片，生产版本仍为 0.13.2，未推送、部署或修改生产数据。

## 本批实施

| 切片 | 用户行为与实际保护 | 剩余范围 |
| --- | --- | --- |
| 面试 Worker 与控制 | prepared 启动不再被消息正则污染；格式控制不算答案并持久保留；明确请求缺失 CV 重启先暂停待核验；普通经历和否定指令不触发换绑 | 全部面试参数、真实并发 CAS、原历史记录逐项处理、长期趋势的完整外部回归 |
| 面试评分事实门 | 每维 evidence 必须是当前回答的连续原文；题目/CV/背景或附加模型点评不能冒充引用；0–4 整数档位严格校验，不把非法档位钳制成有效分；解析与证据失败共享最多一次重评，仍失败记未评分 | 固定 30 样本校准和完整真实 Judge 质量门；真实模型可用性结果按独立回执记录 |
| Legacy Run 批量迁移 | 稳定影响清单、精确批准范围、原 ID 暂停迁移、原 payload 快照、幂等与逐项诚实结果；会话真实 `execution_conversation` 纳入来源/hash/image，父会话锁保护首次插入竞争 | 生产只读 inventory、可信审批来源、Mastra 外部 provider 保护、正式迁移包和 canary |
| Legacy Run 回滚 | 新输入、状态、checkpoint 或持久对话存在时拒绝覆盖，保持同 Run 向前复核；提交后读回失败明确报告实际提交需复核 | 生产历史逐批确认与完整外部存储清单 |
| 研究委派与同目标交接 | 真实父/子 Run、正常独立 Worker claim、稳定生命周期与父消费、来源 owner/hash 复核；交接保存原目标/Program/授权/工具约束，审计中断可恢复 | 跨目标实际 Run Admission、全部材料类型、浏览器/真实模型/完整协作参数 |
| 发布证据检查器 | 对当前规范重建 392/67 定义；六类观测 hash、版本、每参数每层回执与首败/重试链；固定任务风险映射、校准与低分阻断 | 真实 runner/Eval Run 来源、可信批准、完整参数/N/A/55 工具/MCP、业务 oracle 和不可变构建聚合 |

## 真实失败与返工

外部面试首次暴露 prepared 领域状态被转录写者改写、组合格式控制被记作答案、缺失 CV 正式重启被当补充材料。保留原文断言并修复生产根因，未以改测试输入或改结果标准换取通过。

真实 DeepSeek 进一步生成“原文引用 + 模型点评”以及题干/CV来源冒充答案的评分证据。新增连续原文校验，只有真实答案可提供引用；模型再次失败保留未评分，不能因此把真实评分验收报绿。评分版本为 `interview-rubric-v2`，注册表 prompt 版本为 1.0.2。

迁移独立审查发现真实 Worker 写入 `session_memory.execution_conversation` 时可不改 sessions 行，原审批/回滚保护因而漏检。实际 PostgreSQL adapter 的四条首次插入/既有更新反例先 RED；修复来源和 image hash，增加双连接锁竞争、COMMIT 后新增对话读回保护。根代理独立重跑 3 文件 40 项通过。

门禁审查保留并修复首失败回执可被遗漏、Offer 降为通用聊天绕过阈值、policy hash 未绑定 case 映射，以及额外单轮场景按不存在的任务序号误拒。当前定向检查器/inventory 2 文件 13 项通过；实际未执行清单仍阻断，不能作为正式放行器。

协作最终审查发现两条真实恢复缺口：审计追加失败后，Worker 只从事件恢复专家身份，遗漏 checkpoint 中已经持久化的交接；成功交接的后续执行又没有把冻结来源正文和工具交集传入实际模型入口。原 handler 重放通过不足以证明 Worker 恢复，必须经过引擎恢复补回归。审查另发现“请解释‘委派专家研究…’是什么意思”被误当执行授权；研究委派和交接入口都需要明确执行指令，引用、否定、条件及非执行问句不能创建协作副作用。

## 统一验证

本批最终源码冻结后的全量 suite 为 316 文件、1854 项通过/2 项跳过，启用 Runtime、面试、定位与协作四组隔离 PostgreSQL fixture。全局类型检查及 Web/Worker production build 通过，定向 ESLint 为 0 error/7 warning。日志分别为 `.private/spec40/third-fullsuite-final-2026-10-14.log`、`third-types-frozen.log`、`third-build-final-2026-10-14.log`、`third-lint-final-2026-10-14.log`，未沿用第二批数量。

最终真实 Chromium keyless 三条外部回归通过（`20261014-interview-third-final-keyless19`），同冻结 Worker 的真实 DeepSeek 主线通过（`20261014-interview-third-final-real20`）。独立 Standards 与 Spec 双轴复审确认本批候选无已知剩余阻塞项；Spec 审查另独立运行协作 Runtime 39/39 通过。源码按本批精确暂存，既有 E2E 初始化及 CONTEXT 修改保留在工作区，凭据和原始证据不提交。

知识 drift 检查通过。额外 prompt hygiene 检查失败于已提交的 `src/lib/browser-owner.ts` 读取 localStorage；本批未修改该模块，也未为无关检查扩大修复范围。

## 证据与发布状态

专项记录：[面试真实浏览器](spec40-third-interview-progress-2026-10-14.md)、[迁移与回滚](spec40-third-runtime-progress-2026-10-14.md)、[研究与交接](spec40-third-collaboration-progress-2026-10-14.md)、[证据门禁](spec40-third-gate-progress-2026-10-14.md)。运行日志和原始浏览器/数据库/模型证据留在忽略的私有目录，不提交凭据或原始生产会话。

67 项仍未全部关闭，392 项仍未完成；UNIT、PG 或少量 Chromium 切片不折算成完整外部验收。B0/B1 未放行。B0–B4 继续隔离验收，全部适用 case、P0、迁移、质量、工具覆盖及构建门满足后才进入 B5 的一次正式生产切换。
