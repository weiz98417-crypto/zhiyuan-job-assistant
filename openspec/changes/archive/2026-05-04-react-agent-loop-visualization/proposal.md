## Why

当前 Agent 虽然有 `client-runner.ts` 的循环基础设施，但实际运行流是"预设计划 → 机械执行"，缺少真正的 Think → Act → Observe → Reflect 反馈闭环。前端展示上：看不到 Agent 的推理过程、工具结果以原始 JSON 展示（无成功/失败区分）、没有"反思工具返回结果后决定下一步"的阶段可视化。用户期望看到类似 Claude Code 的 ReAct 循环——每一步思考、工具调用、结果观察、反思调整都能在前端可视跟踪。

## What Changes

- **BREAKING**: 重写 `agentLoopClient` 的核心执行流，从 plan-first 改为 ReAct 循环（Think → Act → Observe → Reflect → 重复或输出）
- SSE 事件协议新增 `reflecting` phase 和 `thinking_content` 事件，前端展示 Agent 推理过程
- `ToolResultCard` 组件重写：成功/失败视觉区分、人类可读摘要、折叠原始数据
- 新增 `ThinkingBubble` 组件：以气泡形式展示 Agent 思考内容
- 新增 `ReflectingIndicator` 组件：展示"分析工具结果中..."状态
- 修复 `page.tsx` 中 `toolResult` 被包装成 `{result, success}` JSON 对象的问题
- System prompt 调整：引导 LLM 在工具返回后进行显式反思（"数据拿到了，够不够？要不要再调工具？"）

## Capabilities

### New Capabilities
- `react-agent-loop`: ReAct 循环执行引擎 — Think-Act-Observe-Reflect 闭环，每轮 LLM 调工具后反思结果再决定下一步
- `agent-thinking-visualization`: 思考过程可视化 — 前端展示 Agent 推理文本、工具调用意图、结果观察、反思判断
- `tool-result-styling`: 工具结果样式化 — 成功/失败区分、结构化展示、人类可读摘要

### Modified Capabilities
- `agent-prompt-protocol`: LLM 输出协议从"预设计划"改为"每轮反思"，提示词增加 Reflect 阶段指令
- `agent-loop-frontend`: PlanCard 不再是唯一的结构化 UI，改为 ThinkingBubble + ToolResultCard + ReflectingIndicator 的流式组合

## Impact

- `src/lib/agent/loop/client-runner.ts` — 核心执行流重写
- `src/lib/agent/loop/types.ts` — SSE 事件类型扩展
- `src/lib/agent/prompt.ts` — System prompt 增加 ReAct 协议
- `src/components/agent/AgentChat.tsx` — ToolResultCard 重写 + 新组件
- `src/components/agent/PlanCard.tsx` — 保留但不再是主导 UI
- `src/app/agent/page.tsx` — 新事件处理 + toolResult 修复
