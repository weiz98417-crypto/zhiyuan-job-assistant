# Proposal: a-routing-authority

## Problem Statement

用户的一句话在系统里被三个互相不知道彼此的"大脑"判定：浏览器侧的意图解析在客户端因为永远拿不到模型密钥而退化为正则兜底；创建请求内的服务端判定只看文本、对图片盲判；worker 执行期还有第三套分类。用户看到的 agent 标签用最弱的那个判定，实际执行的任务来自另一个判定——界面说 A、系统做 B。服务端判定出的澄清追问被客户端替换成"这个请求没有创建可执行的 Agent 任务"死文案；浏览器判不出任务时甚至不发创建请求。同时创建请求串行等待意图 LLM 调用（最坏 ~17 秒），用户在拿到任何回执前只能盯着一句静态的"正在理解你的目标"。

## Solution

Run Admission 成为唯一的路由权威，且创建路径零智能：POST 只做幂等回查、活跃 Run 冲突检查（确定性规则）并立即创建 Run（亚秒回执）。意图 envelope 成为 worker 执行的第一步，判定结果以事件流回驱动 UI（判错方向由主责交接纠正）。低置信不再拒绝创建，而是产生一个**澄清 Run**：以通用对话任务承载、进入等待用户状态、最多追问两次；用户答复后若判出真实任务，澄清 Run 完结、新 Run 沿合法任务转换图创建。浏览器侧删除全部路由逻辑，只负责提交 Turn 与展示事件。

## User Stories

1. As a 求职用户, I want 发出消息后一秒内看到系统已接收并开始处理的回执, so that 我不用怀疑消息是否丢失、也不会反复重发。
2. As a 求职用户, I want 界面顶部的 agent 标签始终反映真正在执行任务的专家, so that 我知道是谁在为我工作。
3. As a 求职用户, I want 意图模糊时被追问一个精确的小问题而不是收到"无法创建任务", so that 我能顺着引导把需求说清。
4. As a 求职用户, I want 追问之后我的回答直接进入正确的新任务, so that 不需要把需求重新描述一遍。
5. As a 求职用户, I want 同一条消息（含重试）永远只创建一个 Run, so that 不会出现重复任务和重复扣量。
6. As a 求职用户, I want 上传简历截图后创建的任务真的基于这张截图, so that 评估的不是库里那份旧简历。
7. As a 求职用户, I want PDF 附件提取卡住时不阻塞整轮对话, so that 其他内容照常处理。
8. As a 求职用户, I want "这份 JD 先别匹配我简历"的偏好在同一份 JD 的追问里保持, so that 我不用每轮重复交代（且微调重贴同一 JD 不重置偏好）。
9. As a 开发者, I want 路由判定只有一处实现, so that 改路由规则不用同步三个地方。
10. As a 开发者, I want admission 内没有任何模型调用, so that 创建延迟可预测且可离线测试。

## Implementation Decisions

- Run Admission 改为纯确定性：幂等 requestId 回查、活跃 Run 冲突检查、立即建 Run。低置信/模糊输入不再拒绝，一律建 Run。
- 意图 envelope（结构化 LLM 判定）移入 worker 执行首步；判定产出 `intent`/`agent_switch` 事件；LLM 不可用时退回带审计标记的确定性规则（现状语义保留）。
- 澄清 Run：任务类型 general_chat，成功判据 "clarification question asked"，状态等待用户即安全切换点；下一轮判定出真实任务则澄清 Run 完结（结局：已澄清）并按合法任务转换图建新 Run；同一澄清 Run 最多追问 2 次。
- 浏览器删除：客户端 envelope 调用、客户端任务契约构建（含基线快照网络调用）、taskType 门控（"判不出就不发"）、第三套运行期分类在 agentId 已锁定时的路径。会话标签、路由提示仍可作为 entry hints 提交。
- 两个创建入口（直达图片路径与常规路径）统一：一律携带完整 hints（图片文档类型、旅程工件、来源 agent 提示）。
- 预发送管线预算：PDF 提取设 30 秒超时（超时降级为附件名说明）；意图判定移出关键路径后，创建前仅剩确定性步骤。
- JD 简历匹配偏好：来源键计算前做空白与标点归一化，同一 JD 的微调重贴不触发偏好重置；偏好继承仍由 Run 检查点承载。
- 系统提示词前缀稳定性：worker 侧系统提示与历史的拼装顺序固定，前缀不随轮次重排（提升模型侧缓存命中）。

## Testing Decisions

- 只测外部行为：admission 的判定函数表驱动测试（给定输入与活跃 Run 状态 → 期望的 Run 创建/澄清/冲突结论），不测内部步骤。
- envelope worker 首步：通过 durable 引擎的既有测试缝（in-memory store + mock 模型链）断言"创建即刻返回、intent 事件随后到达"。
- 澄清 Run 端到端场景：模糊输入 → 澄清事件 → 答复 → 新任务 Run 创建，全程同一 Conversation。
- 先例：run-admission.test、agent-production-cutover.test、durable-agent-runtime.test。
- 性能断言：admission 路径单测中禁止出现网络调用（以依赖注入显式化）。

## Out of Scope

- 意图判定的模型质量优化（提示词迭代）——只改位置与权威性。
- admission 的 LLM 判定保留同步模式（已废除）。
- 前端展示细节（归 d-dual-canvas-ui）。

## Further Notes

- 修订 ADR-0017 的时序描述（权威性结论不变）：admission 权威、但智能后置到 worker。
- 澄清 Run 术语已入 CONTEXT.md。
