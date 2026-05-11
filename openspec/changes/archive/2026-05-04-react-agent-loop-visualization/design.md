## Context

当前 `agentLoopClient` 采用"先规划后执行"模式：首次 LLM 调用生成 `<<PLAN>>`，然后每个 task 逐一调 LLM + 工具。前端只有 `thinking/executing/responding` 三种 phase，工具结果以原始 JSON 渲染。用户期望的 ReAct 循环（工具返回后 LLM 反思 → 判断是否继续调工具 → 输出）在黑盒中完成，前端不可见。

约束：DeepSeek V4 Flash API 通过 `/api/agent/think` SSE 代理调用；前端通过 `agentLoopClient` async generator 接收 SSE 事件；UI 组件为 `AgentChat` + `PlanCard` + `TaskItem`。

## Goals / Non-Goals

**Goals:**
- 实现真正的 ReAct 循环：Think → Act → Observe → Reflect → (loop) → Respond
- 前端可视化每一步的推理过程、工具调用、结果观察、反思判断
- 工具结果卡片区分成功/失败，人类可读摘要
- 保留 PlanCard 作为可选的前置规划展示，但不强制

**Non-Goals:**
- 不改变工具注册/执行机制（`ToolRegistry` 保持不变）
- 不改变 MCP 集成方式
- 不引入新的 LLM 调用协议（仍用 `<<TOOL>>` 标记）
- 不改变聊天消息的持久化方式

## Decisions

### 1. ReAct 循环结构：迭代式而非计划式

**选择**: 改为 while 循环结构，每轮迭代包含完整的 Think-Act-Observe-Reflect 周期。

```
while (iteration < maxIterations) {
  1. Think: LLM 调用 → 解析 thinking_content + tool_call
  2. Act: 执行工具 → yield tool_result
  3. Observe: 将工具结果追加到上下文
  4. Reflect: LLM 调用（带反思指令）→ 判断 next_action
     - "call_tool" → 回到步骤 1
     - "respond" → 跳出循环
}
```

**替代方案**: 保留 plan-first 但在任务间增加反思步骤 → 拒绝，因为 DeepSeek 的输出不稳定，预设计划的质量不可控，迭代式更灵活。

### 2. 反思由 System Prompt 驱动，不硬编码

**选择**: 在 system prompt 中增加 Reflect 协议指令，LLM 在工具返回后的上下文中自然判断下一步。前端只看 `tool_result` 后的 `thinking_content` 事件来判断是否在反思。

**替代方案**: 硬编码一个"反思检查器"（如检查工具结果是否包含错误）→ 拒绝，因为语义判断（"数据够不够"）需要 LLM 的理解能力，硬编码无法覆盖。

### 3. ToolResultCard 设计：分层信息展示

**选择**: 
- 标题栏：工具名称 + 成功🟢/失败🔴 状态图标
- 摘要行：一行人类可读的结果摘要（从 `formatResult` 提取）
- 可折叠详情区：原始数据（默认折叠）

**替代方案**: 只改 CSS 不改结构 → 不够，当前根本问题是展示的是 `JSON.stringify` 包装后的对象而非格式化结果。

### 4. PlanCard 保留但不强制

PlanCard 仍然有价值——当 LLM 输出了 `<<PLAN>>` 时，任务列表可以作为"执行进度"的直观展示。但不再让 PlanCard 成为唯一的可视化元素。

## Risks / Trade-offs

- **[R]** ReAct 循环可能增加 LLM 调用次数（每轮反思多一次调用）→ **M**: 设置 `maxIterations=5`，加上 token 上限控制成本
- **[R]** DeepSeek 可能不遵循 ReAct 协议，直接在首次响应中输出文本 → **M**: 兼容现有三段式 fallback（plan → tool → chat）
- **[R]** 反思文本可能重复啰嗦 → **M**: system prompt 限制反思长度（"一句话判断下一步"）
