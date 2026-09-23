# Design: m1-unify-execution-kernel

## 决策依据

ADR-0023 + UPGRADE-PLAN-2026-09 M1。删除前必须先补齐 worker 路径缺口（第 2 节），否则是可见回归；删除顺序为"先验证 cutover → 补缺口 → 再删路径"。

## 执行顺序约束

决策 #21：生产 runtime mode 不做预检，M1 发布即 cutover。因此：

1. 第 2 节（补缺口）与第 3 节（网关收编）先行，与第 0.1 节（escape hatch 实现）并行推进。
2. 第 1 节（删除）与 worker_all 切换**同批发布**：合并门禁（第 5 节）全绿是发布前提，escape hatch 是唯一回滚手段。
3. 第 4 节随删除同步；部署后进入 0.2 观察期，0.3 处理回滚或移除旁路。

## 关键风险与兜底

- **未预检的 cutover 风险**：生产当前 mode 未知（可能仍为 legacy 默认或部分分桶），发布即全量切 worker 是本变更最大的单点风险。兜底：五缺口补齐 + 门禁 5.3 行为等价对比在合并前完成；escape hatch 可在分钟级恢复 directMode；`execution_owner` 每日监控提供回归信号。
- **行为等价风险**：worker 与 legacy 在 forced tool call 上的语义差异（legacy 有 7 种、worker 只有 gate frozenToolCall）不在本变更强行拉平——M3 的 Task Program 才是它们的归宿；M1 只保证事件与用户可见行为等价（五缺口），语义统一留给 M3。
- **eval 脚本依赖**：`scripts/eval-agent.mjs` 是非 directMode `orchestrateGen` 的唯一调用方，删除前为其提供 durable 旁路。
