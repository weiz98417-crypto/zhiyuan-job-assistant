# 组合求职旅程通过 Artifact 串联多个 Run

我们决定继续保持“一个 Agent Run 对应一个明确用户目标”，并用同一 Agent Conversation 中的多个 Run 表达 JD 分析、简历诊断、简历修改、面试准备和 Offer 决策之间的切换。合法任务转换图是路由、UI 和 E2E 共用的产品契约；只读 Artifact 可以自动传递，写入动作必须经过有范围的 Run Gate，Artifact 引用保存 ID、版本和内容哈希并在变化时标记 stale。补充当前目标的信息继续同一 Run，明确切换会暂停旧 Run 并创建新 Run，取消才进入不可自动续跑的 cancelled 状态；同一 Conversation 默认只允许一个 active Run，避免不同目标的输出交错和上下文污染。
