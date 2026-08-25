# PostgreSQL 是 Durable Agent Run 的生产事实源

我们决定让 Agent Run 成为可跨浏览器断开、Web 进程重启和执行进程中断续跑的执行本体，并由 PostgreSQL 保存其生产状态；浏览器、SSE 和 Admin 页面只持有可重建投影。SQLite 继续服务本地开发、测试和归档兼容，但不承诺跨进程运行续跑。这个选择避免同时维护两套 lease、checkpoint、幂等和接管语义，也使后续 Recovery Supervisor 与 Run Evidence observer 共享同一个可靠 seam。
