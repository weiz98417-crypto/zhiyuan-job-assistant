## Why

当前 Agent 系统的意图分类靠正则匹配（`intentPatterns`），已被证明不可靠——"帮我分析一下这个"触发 JD 评估、"任何长消息"触发假评估，用户看到"正在评估"但什么都没给。更深层的问题是 sub-agent 是假的——"切换 agent"只是换 system prompt，仍在同一个 LLM loop 里，没有独立推理上下文。现在趁评估页 bug 修复的契机，一次性把意图分类和 agent 架构升级到位。

## What Changes

- **LLM 意图分类替换正则**：`classifyIntent()` 改用 DeepSeek V4 Flash 做 JSON 分类，延迟 <1s，正则保留为 fallback
- **agent.md 灵魂管理**：每个 agent 拆为 `agent.md`（角色/对话风格/工具策略）+ `index.ts`（注册字段），从 `buildEvalPrompt()` 巨型函数中解耦
- **真 Multi-Agent 独立 Loop**：Orchestrator agent 分类意图后，`yield*` 委托给目标 sub-agent 的独立 ReAct loop，每个 agent 有自己的 system prompt + model + tool whitelist
- **模型分级**：classifier → Flash，evaluate → Flash（用户说"深度评估"切 Pro），resume → Pro，interview → Pro
- **删除直接 JD 评估路径**：已在上一次修复中移除，评估走正常 orchestrator 流程

## Capabilities

### New Capabilities

- `agent-md-soul`: agent.md 文件定义每个 agent 的角色、对话风格、工具使用策略、边界规则，与 .ts 注册表文件互补
- `llm-intent-classification`: LLM（DeepSeek V4 Flash）驱动的意图分类器，输出结构化 JSON，替换正则 intentPatterns
- `multi-agent-independent-loops`: 每个 sub-agent 运行独立的 ReAct loop，orchestrator 委托后不再共用同一个 LLM context
- `model-tiering`: Agent 级别声明 model 字段，支持默认模型和按用户意图升级模型（如"深度评估"→Pro）

### Modified Capabilities

<!-- No existing specs to modify — current system has no spec files -->

## Impact

- `src/lib/agent/registry/index.ts` — `classifyIntent()` 改为 LLM 调用，orchestrator 改为 generator
- `src/lib/agent/registry/agents/*/` — 每个 agent 拆为 `agent.md` + `index.ts`
- `src/lib/agent/loop/server-runner.ts` — `callLLM()` 接受 model 参数，loop 接受 agent 定义
- `src/lib/agent/orchestrator/index.ts` — 改为 async generator，增加意图分类 + 委托逻辑
- `src/app/agent/page.tsx` — 适配新的 orchestrator generator 接口
- 前端 SSE 协议 — **零改动**，事件类型完全兼容
