## 1. classify API

- [x] 1.1 创建 `/api/agent/classify` 端点 — 接收 messages 历史，调用 classifyIntentLLM，返回 agentId + modelTier
- [x] 1.2 classify prompt 注入历史消息摘要（最近 3 条，每条 ≤100 字），使 LLM 能理解"评估这个"中的指代
- [x] 1.3 分类失败降级到正则 fallback，返回 general agent
- [ ] 1.4 测试：先发 JD 全文，再发"帮我评估这个JD" → classify 返回 evaluate

## 2. soul API

- [x] 2.1 创建 `/api/agent/soul` 端点 — 加载 agent.md + 注入 Career DNA、知识、会话记忆
- [x] 2.2 返回 `{ body: string, model: string }`，model 支持 Pro 分级
- [x] 2.3 agent.md 缺失时返回 fallback prompt，记录 warning
- [ ] 2.4 测试：`GET /api/agent/soul?agent=evaluate` 返回完整 system prompt 含工具策略

## 3. 客户端 loop 恢复

- [x] 3.1 移除 `/api/agent/run` 调用，恢复 `orchestrate()` + `agentLoopClient()` 调用链
- [x] 3.2 `orchestrate()` 改为：调 classify API → 调 soul API → 返回 `{agent, systemPrompt, tools, toolWhitelist}`
- [x] 3.3 恢复 `agent/page.tsx` 中 `agentLoopClient` 的 `for await` 循环——流式输出和工具调用可见
- [x] 3.4 agent_switch 事件触发时 `setActiveAgent`，React 正常 re-render 显示 agent 标签
- [ ] 3.5 验证端到端：发 JD → 说"评估"→ classify 返回 evaluate → soul 加载 → evaluate_jd_full 被调用 → 风险检测 + A-G 评估 → 流式输出报告

## 4. 清理

- [x] 4.1 废弃 `/api/agent/run`（保留文件但不再被调用）
- [x] 4.2 `orchestrateGen` 保留但标记 `@deprecated`
- [x] 4.3 删除 classify 和 agentLoopServer 中的 debug 日志
- [ ] 4.4 验证：浏览器测试完整链路，确认 agent 标签显示、流式输出正常、评估功能完整
