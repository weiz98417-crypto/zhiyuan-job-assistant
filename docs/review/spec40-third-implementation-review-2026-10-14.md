# Spec 40 第三批双轴审查

日期：2026-10-14。固定基线：`a8b4462aa6f32f33f39d87f953ad77a6fb0c8c2f`。审查对象为该提交后的第三批工作区差异与新增文件：面试单写者、格式和换绑控制、评分事实门、真实浏览器证据保护、Legacy Run 批量迁移/回滚、研究委派与同目标交接、发布证据检查器。既有 E2E 初始化与 CONTEXT 改动不纳入。

按 `code-review` 技能分别运行 Standards 与 Spec 独立审查。来源为根 AGENTS、Spec 40、总方案/矩阵、ADR-0026/0027/0029/0031/0036/0042/0044/0046 以及 Fowler 的 12 项判断性 smell。迁移作者不签署自己的实现；根代理独立运行迁移 PostgreSQL 接缝与 CLI 回归。

## Standards

证据 ID 默认漂移与覆盖首失败、Program-required 研究被用户 optional 降级、来源 A 混入工具结果 B，均先发现并复核修复。当前 evidence helper 在 runner 清理前原子预留显式 ID，oracle 不可变写入；真实 CLI 重用既有 ID 被拒绝，11 个文件 hash 保持不变。

交接与委派入口原有专家别名、授权和来源集合校验重复属于判断性 smell。最终新增明确授权共享校验；Standards 独立审查未发现剩余硬标准违反，Spec 冻结复审确认引用/条件文本及目标别名误授权已修复。

## Spec

审查实际发现并要求返工的缺陷：

- 真实 Worker 转录写者仍从消息正则回写面试领域状态；格式控制与无法核验的明确换绑命令被当答案或材料补充。停止转录写者回写领域状态，控制指令独立处理；叙述和否定不触发换绑。
- 模型证据引用混入题目、CV 或点评，非法档位被钳制成有效分。当前回答连续原文与 0–4 整数门必须同时满足；解析和证据错误共享最多一次重评，仍错保持未评分。
- 实际 Worker 的 `session_memory.execution_conversation` 变化不一定改 sessions 行；迁移审批 hash 与回滚 image 原先漏检。修复全行来源/image hash 与 sessions 父行锁，真实首次插入、既有更新、锁竞争及 COMMIT 后 append 反例独立验证。
- 首失败声明可未被消费、任务改名可绕质量阈值、policy hash 未绑定 case 任务映射。补齐回执链与固定风险，并修复额外单轮 case 按不存在任务序号误拒。
- 交接审计中断后的 Worker 恢复丢专家身份，成功交接的默认模型入口丢冻结来源与工具；引用中的“委派”被当执行授权。后继用户安全约束与显式空工具集合也必须保持收紧。最终返工已覆盖真实引擎恢复、默认模型入口、只读收紧、零工具安全重规划及来源/授权/工具篡改；独立 Spec 复审运行 Runtime 文件 39/39 通过，未修改实现，未发现本批剩余阻塞项。

明确 partial 继续阻断完整 Spec 和发布：生产可信审批/只读 inventory 与外部 provider 迁移保护；跨目标实际 Run Admission 和未支持材料类型；全部 P0 的完整外部参数与历史处理；30 样本评分和 13 任务真实 Judge 校准；392 case/55 工具/动态 MCP 覆盖、可信 runner/Eval Run、业务 oracle、不可变构建、canary 与正式发布聚合。

最终统一验证：316 文件、1854 项通过/2 项跳过；全局类型检查、Web/Worker build、知识 drift 检查通过；定向 ESLint 0 error/7 warning。真实 Chromium 最新 keyless 三条与真实 DeepSeek 主线通过。两轴结论为本批候选无已知剩余阻塞项，完整 Spec 仍 partial。冻结结果记录在 [第三批进度](../testing/spec40-third-implementation-progress-2026-10-14.md)，不声明 B0/B1 放行或 67/392 完成。
