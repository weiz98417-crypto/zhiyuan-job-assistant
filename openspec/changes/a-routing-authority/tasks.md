# Tasks: a-routing-authority

## 1. Admission 纯确定性
- [ ] 1.1 POST /api/agent/runs 移除 envelope LLM 调用；保留幂等回查、活跃 Run 冲突检查、立即建 Run
- [ ] 1.2 模糊/低置信输入一律建 Run（删除 clarify-拒绝分支与 202 无 Run 语义）
- [ ] 1.3 admission 路径依赖显式化（无网络调用的表驱动测试）

## 2. Envelope 移入 worker 首步
- [ ] 2.1 durable 引擎在首次模型调用前执行 envelope；产出 intent/agent_switch 事件
- [ ] 2.2 LLM 失败退回带审计标记的确定性规则（语义与现 fallback 一致）
- [ ] 2.3 图片文档类型/旅程工件 hints 进入 envelope 上下文（消除文本盲判）

## 3. 澄清 Run
- [ ] 3.1 澄清语义实现：general_chat 判据 clarification question asked、进入等待用户
- [ ] 3.2 答复续跑：判出真实任务 → 澄清 Run 完结（已澄清）+ 沿转换图建新 Run；同 Run 追问 ≤2
- [ ] 3.3 CONTEXT.md 术语「澄清 Run」落库

## 4. 浏览器路由删除
- [ ] 4.1 删客户端 envelope 调用、taskType 门控、客户端 contract 构建（含基线快照调用）
- [ ] 4.2 运行期第三套分类在 agentId 已锁定时短路
- [ ] 4.3 两个创建入口统一携带完整 hints
- [ ] 4.4 主责标签改为事件驱动（衔接 b-event-dialect）

## 5. 预算与偏好
- [ ] 5.1 PDF 提取 30s 超时与降级文案
- [ ] 5.2 JD 来源键空白/标点归一化（微调重贴不重置禁匹配）
- [ ] 5.3 系统提示词前缀拼装顺序固定

## 6. 门禁
- [ ] 6.1 表驱动 admission 测试 + 澄清端到端场景测试
- [ ] 6.2 亚秒回执断言（创建路径零模型调用的测试证明）
- [ ] 6.3 ADR-0029（admission 确定性 + worker 首步 envelope，修订 0017 时序）
