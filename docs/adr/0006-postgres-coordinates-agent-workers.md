# PostgreSQL 协调 Agent Worker

我们决定使用 PostgreSQL 承载 Agent Run queue、原子 claim、lease、heartbeat、fencing token、checkpoint 和 outbox；`LISTEN/NOTIFY` 只作为低延迟唤醒，定时轮询负责可靠兜底。第一版生产环境可以只运行一个 Worker，但 ownership 协议从一开始允许多个 Worker 安全竞争和接管。认证 Redis 不复用为任务队列，这能让运行状态与调度事务保持 locality，并避免新增 BullMQ、Redis 队列或工作流平台的运维与一致性成本。
