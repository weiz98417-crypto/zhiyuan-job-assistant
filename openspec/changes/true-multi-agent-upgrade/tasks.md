## 1. agent.md 灵魂文件

- [x] 1.1 创建 `registry/agents/orchestrator/agent.md` — 路由器角色，职责是理解意图→分类→委托
- [x] 1.2 创建 `registry/agents/evaluate/agent.md` — JD评估专家，从 `buildEvalPrompt()` 拆出 soul
- [x] 1.3 创建 `registry/agents/resume/agent.md` — 简历专家，Pro 模型
- [x] 1.4 创建 `registry/agents/interview/agent.md` — 面试教练，Pro 模型
- [x] 1.5 创建 `registry/agents/profile/agent.md` — 画像管理专家
- [x] 1.6 创建 `registry/agents/general/agent.md` — 通用助手
- [x] 1.7 实现 `loadAgentMD(agentId: string): Promise<AgentSoul>` — 解析 frontmatter + body
- [x] 1.8 实现 frontmatter schema 校验：缺失 name/model 时拒绝加载并 fallback
- [x] 1.9 实现 `AgentSoul` → system prompt 注入：替换 Career DNA、会话记忆等上下文变量

## 2. LLM 意图分类器

- [x] 2.1 实现 `classifyIntentLLM(content, ctx)` — 调用 DeepSeek V4 Flash 做 JSON 分类
- [x] 2.2 构造分类 prompt：agent 列表描述 + 用户消息 → 要求输出 `{agentId, reason, modelTier}`
- [x] 2.3 modelTier 检测逻辑："深度""精修""仔细"等关键词 → `pro`
- [x] 2.4 3 秒超时降级到正则 intentPatterns
- [x] 2.5 返回的 agentId 不在注册表时降级到 general agent
- [x] 2.6 LLM API 全部不可用时降级到正则（复用 MODEL_CHAIN 的 error 检测）

## 3. Agent Loop 模型适配

- [x] 3.1 `AgentDefinition` 类型增加 `model?: string` 和 `modelPro?: string` 字段
- [x] 3.2 `callLLM()` 新增 `model?` 参数——匹配则跳过前面的 MODEL_CHAIN entry
- [x] 3.3 `agentLoopServer()` 改为接受 `{agent, systemPrompt, messages, tools}` opts 对象
- [x] 3.4 agent 的 tool 列表从 `toolNames` 自动 populating（复用 `populateAgentTools`）
- [x] 3.5 model fallback 时输出 warning 日志——记录原始 model 和实际使用 model

## 4. Orchestrator 改造为 Generator

- [x] 4.1 `orchestrate()` 改为 `async function*` generator
- [x] 4.2 步骤：LLM 分类 → 输出 intent/agent_switch 事件 → `yield*` 委托给 sub-agent loop
- [x] 4.3 分类结果注入 `modelTier`：pro 时传入 `agent.modelPro`
- [x] 4.4 orchestrator 本身注册为一个 agent（`registry/agents/orchestrator/index.ts`）
- [x] 4.5 移除 `classifyIntent()` 中的正则主路径，仅保留为 fallback

## 5. 前端适配

- [x] 5.1 `SSEEvent` 类型新增 `intent` 和 `agent_switch` 事件
- [x] 5.2 `AgentChat` 组件监听 `agent_switch` 事件，更新 UI 显示当前活跃 agent 标签
- [x] 5.3 `agent/page.tsx` 的 `sendMessage` 适配新的 generator-format `orchestrate()`
- [ ] 5.4 验证流式输出：thinking → tool_call → text → done 在各 agent 下均正常
- [ ] 5.5 验证 agent 标签切换：对话中切换 agent 时 UI 标签跟随变化

## 6. 清理

- [x] 6.1 删除 `evaluate-agent.ts` 中 `buildEvalPrompt()` 的 soul 部分（已迁移到 agent.md）
- [x] 6.2 其他 agent 的 `buildSystemPrompt()` 同样瘦身为纯注册逻辑
- [x] 6.3 验证所有 agent.md 的 YAML frontmatter 可解析
- [x] 6.4 验证 fallback 链路：LLM API 全挂 → 正则分类 → general agent 正常响应
