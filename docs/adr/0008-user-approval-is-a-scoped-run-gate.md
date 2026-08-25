# 用户批准是有范围的 Run Gate

我们决定把用户批准保存为 Agent Run 上的 durable gate，并将其限制到一个精确 Tool Attempt 的工具、规范化参数和风险。Tool Governance 只校验 gate，不拥有第二套批准生命周期；参数或风险变化必须创建新 gate。这样既避免进程重启后丢失批准，也避免一次模糊确认被错误复用于后续高风险动作。
