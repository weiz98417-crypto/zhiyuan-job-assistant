# 独立 Agent Worker 拥有 Run 执行

我们决定由独立、长驻并受进程管理器监管的 Node Agent Worker 拥有 Agent Run 的执行生命周期；Next.js API 只创建 Run、提交用户输入与控制意图并提供事件订阅，浏览器只呈现投影。现有请求绑定的 SSE Loop 无法跨连接中断或 Web 进程重启存活，而引入 Temporal 或 BullMQ 会在当前规模下增加不必要的第二套基础设施，因此第一版 Worker 直接围绕 PostgreSQL 的 durable state 工作。
