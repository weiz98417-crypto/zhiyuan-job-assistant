# Runtime 从持久状态构建模型 Context

我们决定让 Durable Agent Runtime 根据 Conversation Turn、Run Contract、计划游标、Gate、已完成 Tool Attempt 和事实源引用确定性构建模型 Context；浏览器提交的 messages 只是输入，不是执行真源。模型流中断时，已展示的部分输出保存在短期 `model_interrupted` checkpoint payload，脱敏 interrupted Evidence 只保存长度与 checkpoint 引用，且不把部分输出伪装成完整 Assistant Message 进入恢复 Context。模型完整结束后，`after_model` checkpoint 同时保存完成决议；Worker 接管时只补齐 Evidence 与 Conversation 投影，不再次请求模型。这样浏览器断线、Worker 接管和 Context compaction 都能从同一 durable state 续跑，而不会继承半句话、重复完整模型调用或不完整 Tool Call。
