# Durable Run 使用事件、快照与 Checkpoint

我们决定使用 append-only Run 事件保存可追溯历史，用当前快照支持状态查询，用可恢复 checkpoint 重建执行，并独立保存 Tool Attempt 与 outbox。现有 `agent_run_steps` 在迁移后只作为 Run Evidence 投影，不再承担执行状态。纯事件溯源会让当前产品查询和迁移过重，只有可变行又无法可靠解释中断与接管，因此混合模型在可恢复性、查询成本和渐进迁移之间取得平衡。
