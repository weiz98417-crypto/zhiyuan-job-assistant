# Run Payload 与 Evidence 使用不同保留期限

我们决定只在 Run 非终态期间保留续跑所需的完整状态，终态 checkpoint 与不可重建 payload 默认保留 30 天，脱敏 Run Event、Evidence 与 Review 默认保留 180 天，最小状态、哈希和审计标识可长期保留；用户删除账户时级联删除其 Run 数据。Event、outbox、Admin 投影与 PM2 日志禁止保存凭据、授权头、数据库地址和完整上传文件。这个区分既支持短期故障续跑与治理复盘，也避免 Durable Runtime 成为第二套长期复制个人内容的事实源。
