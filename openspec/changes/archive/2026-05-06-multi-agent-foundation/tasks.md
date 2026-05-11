## 1. Agent Registry 基础设施

- [x] 1.1 创建 `frontend/src/lib/agent/registry/types.ts`，定义 `AgentDefinition` 接口和 `ToolDefinition` 类型
- [x] 1.2 创建 `frontend/src/lib/agent/registry/index.ts`，实现：
  - `AGENT_REGISTRY: AgentDefinition[]` 静态注册表
  - `classifyIntent(content: string): AgentDefinition` 路由函数
  - `getAllAgents(): AgentDefinition[]` 查询函数
  - `getAgentById(id: string): AgentDefinition | undefined` 查询函数
- [x] 1.3 定义首批子 Agent（5 个）：
  - `interview` Agent（迁移 Phase 1 的 prompt + tools）
  - `evaluate` Agent（新建，复用现有 JD 评估 prompt）
  - `profile` Agent（新建，dingwei SOP + mine_profile 工具）
  - `resume` Agent（新建，CV 生成 + 定制 + 量化优化）
  - `general` Agent（兜底，保留现有完整 prompt + 所有 tools）

## 2. Orchestrator 实现

- [x] 2.1 创建 `frontend/src/lib/agent/orchestrator/index.ts`，实现：
  - `orchestrate(content: string, context: OrchestratorContext): OrchestratorResult` 编排函数
  - 调用 `classifyIntent()` → 获取 `AgentDefinition` → 组装 `{ systemPrompt, toolWhitelist }`
  - 返回 `OrchestratorResult`：`{ agent, systemPrompt, toolWhitelist, annotatedMessages }`
- [x] 2.2 `OrchestratorResult` 包含当前会话的 messages + Career DNA 摘要 + per-agent knowledge

## 3. Agent 页面集成 Orchestrator

- [x] 3.1 修改 `frontend/src/app/agent/page.tsx` 的 `sendMessage`：
  - 移除现有的面试 intent 特殊分支（Phase 1 的 coach overlay 逻辑）
  - 移除 dingwei 特殊检测（移到 profile-agent 内部）
  - 改为调用 `orchestrate()`
  - 使用返回的 `systemPrompt` 和 `toolWhitelist` 调用 `agentLoopClient`
- [x] 3.2 在消息持久化时为每个消息添加 `agent_id` 字段
- [x] 3.3 会话 title 生成改用通用逻辑（移除 coach 专用标题）

## 4. Agent Chat UI 更新

- [x] 4.1 修改 `frontend/src/components/agent/AgentChat.tsx`：
  - Header 区域显示当前激活的 Agent 名称标签（通用 chip，支持所有 Agent）
  - 消息旁显示 agent 来源标签（半透明居中，仅当切换 Agent 时显示）
- [x] 4.2 修改 SuggestionChips：根据当前激活的 Agent 动态显示该 Agent 的专属 chips
  - 每个 `AgentDefinition` 包含 `suggestions: AgentSuggestion[]` 字段
- [ ] 4.3 用户可在 UI 手动切换 Agent（轻量下拉或 chip 选择器）— 留待 Phase 3b
  - 当前通过自然语言切换（explicitSwitchPatterns），足以满足 V1 需求

## 5. Shared Memory 层

- [x] 5.1 创建 `frontend/src/lib/agent/shared-memory.ts`：
  - `getCareerDNASummary(): Promise<string>` — 从 profile signals + ZhiyuanProfile 聚合
  - `getSessionContext(messages): string | null` — 获取会话 Memory Digest
  - `getAgentFindings(agentId: string): Promise<string[]>` — 获取 Agent 关键发现
  - `getKnowledgeForAgent(domains: KnowledgeDomain[]): string` — 按域注入知识
- [x] 5.2 所有子 Agent 的 System Prompt 在生成时注入 Career DNA 摘要
- [x] 5.3 跨 Agent 信号读取：Shared Memory 支持跨 Agent 发现查询

## 6. 面试教练迁移为子 Agent

- [x] 6.1 将 Phase 1 的 `interview-coach-prompt.ts` 的 prompt 生成逻辑迁移到 Interview Agent 定义中
  - `buildInterviewCoachOverlay()` 被 interview-agent 直接 import（函数签名不变）
  - company/role/CV 提取逻辑迁移到 interview-agent 的 `buildSystemPrompt` 内
- [x] 6.2 将 Phase 1 的 `interview-tools.ts` 直接 import 到 Interview Agent 的 tools 数组
- [x] 6.3 移除 `agent/page.tsx` 中 Phase 1 的 coach overlay 特殊处理代码
  - 删除 `detectCoachIntent()` 调用
  - 删除 `buildInterviewCoachOverlay()` 调用
  - 删除 `isCoachMode` state 和 `coachContextRef`
  - 删除 `COACH_SUGGESTIONS` 定义
- [ ] 6.4 验证：通过 Agent Chat 触发面试练习，体验与 Phase 1 一致（需 dev server）

## 7. API 层更新

- [x] 7.1 `POST /api/agent/orchestrate/route.ts` — 不需要创建。Orchestrator 完全在客户端执行
- [x] 7.2 现有工具 API 路由保持不变——子 Agent 通过相同的 tool handler 机制调用
- [x] 7.3 `/api/agent/think` SSE 端点保持不变——支持来自不同 Agent 的工具调用

## 8. 验证（运行时）

- [ ] 8.1 输入"帮我准备面试"，验证 Orchestrator 路由到 Interview Agent，Agent Chat 显示"面试教练"标签
- [ ] 8.2 输入"评估这个JD"，验证路由到 Eval Agent
- [ ] 8.3 输入"查看我的投递状态"，验证路由到 General Agent
- [ ] 8.4 在同一会话中连续切换 Agent，验证对话历史完整不丢失
- [ ] 8.5 验证 Agent 标签和消息来源标签正确显示
- [ ] 8.6 验证面试教练工具在 Interview Agent 中正常工作
- [ ] 8.7 验证 Phase 1 的完整面试教练体验在 Phase 3 后无回归

### 静态验证通过
- TypeScript 编译: `npx tsc --noEmit` ✓ 零错误
- 所有 import 依赖链: 无循环引用
- Prompt 一致性: `buildInterviewCoachOverlay()` 签名不变，interview-agent 不改 interview-coach-prompt.ts
- 工具隔离: 每个 Agent 的 tools 数组仅含声明的工具；ToolRegistry.execute() 有白名单检查
- JD eval 快捷路径: Path 1 代码完全未修改
- 向后兼容: `agent_id` 可选字段，旧消息的 `mode: "interview-coach"` 映射到 `"interview"` agent_id
