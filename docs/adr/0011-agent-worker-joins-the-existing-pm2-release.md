# Agent Worker 加入现有 PM2 原子发布

我们决定保留已经在线验证的阿里云 ECS、Nginx、PM2、immutable release 目录与 `current` 原子软链接发布方式，并在同一个 release 中新增独立 Agent Worker 进程。Web 继续使用现有内网端口，Worker 不开放 HTTP 端口；PostgreSQL、Redis、备份、canary 和旧 release 回滚流程继续复用。这个选择避免为了 Durable Agent Runtime 重做已经可靠运行的基础设施，同时让 PM2 独立监管 Web 与 Worker 的崩溃重启。
