## Context

`agent-conversational` 完成后，纸鸢有了统一对话页 + Phase 可视化 + Skill 文件化。但执行模式的核心仍是一次性的——LLM 调一个工具，结果喂回去，输出回复。没有多步推理，没有计划拆解。工具全在一个 300 行的 `tools.ts` 里。

约束：(1) DeepSeek API 无原生 function calling，(2) 工具执行走客户端 DexieDB + 服务端 fetch，(3) 不可变数据模式，(4) 为 V4.0 多 Agent 做准备。

## Goals / Non-Goals

**Goals:**
- 实现可配置的 Agent Loop 引擎：Think → Act → Observe 循环，支持多轮迭代
- Task Planner：复杂请求自动拆解为有序 TODO，逐项执行
- 工具系统插件化：每个工具独立文件，加工具不改核心逻辑
- SSE 事件扩展：新增 plan_created / task_started / task_done
- API 路由执行模式走 Agent Loop

**Non-Goals:**
- 不做多 Agent 编排（V4.0）
- 不做 Plan-First（需用户确认）模式——只做 Plan-As-You-Go
- 不引入 LangChain/LlamaIndex 等框架
- 不做并行工具调用（单 Agent 串行执行即可）
- 不做工具调用的权限控制（求职场景无敏感操作）

## Decisions

### 1. Agent Loop 架构

```
AgentLoop.run(input, context)
  │
  ├─ 1. Planner.plan(input) → Task[]
  │     ├─ 简单请求: 1 个任务（直接执行）
  │     └─ 复杂请求: N 个任务（逐项执行）
  │
  ├─ 2. for each Task:
  │     ├─ Think: LLM 决定如何完成当前任务
  │     ├─ Act: 执行工具调用（如果需要）
  │     ├─ Observe: 工具结果注入上下文
  │     └─ 重复 Think→Act→Observe 直到任务完成或达到 maxIterations
  │
  └─ 3. Quality Gate: 最终输出前自检
        ├─ 是否完成了所有计划任务？
        ├─ 回复是否基于实际数据？
        └─ 不通过 → 再迭代一轮
```

**为什么不一次 LLM 调用完成所有任务？** 任务间有数据依赖（任务 2 依赖任务 1 的工具结果），必须串行。

### 2. Loop 终止条件

| 条件 | 行为 |
|------|------|
| 所有 Task 完成 | 正常终止，Quality Gate 后输出 |
| LLM 输出不包含工具调用 | 当前任务完成，进入下一个 |
| 达到 maxIterations（默认 5） | 强制终止，输出已有结果 |
| 工具执行连续失败 2 次 | 终止当前任务，跳到下一个 |
| 上下文超过预算（80% token limit） | 截断早期消息，保留最近 15 条 |

### 3. Planner 设计

LLM 驱动的拆解，而非规则引擎：

```
System Prompt 注入:
"当用户请求涉及多个步骤时，先输出一个执行计划：
<<PLAN>>
[
  {"id":"1", "title":"查询近期投递", "tool":"search_applications"},
  {"id":"2", "title":"分析需跟进岗位", "tool":null},
  {"id":"3", "title":"获取推荐", "tool":"get_recommendations"}
]
<</PLAN>>

然后逐项执行。每完成一项，汇报进度。"
```

**为什么不用规则引擎？** 求职场景的请求变化多端，规则覆盖不全。LLM 拆解更灵活。

**为什么用 JSON 而非自然语言？** 可解析，前端能渲染结构化 PlanCard。

### 4. 工具系统插件化

```
tools/
├── types.ts          ← ToolDefinition<TParams, TResult>
├── registry.ts       ← ToolRegistry 类
├── index.ts          ← 汇总注册（一行一个 import + register）
├── query/            ← 无副作用
└── action/           ← 有副作用
```

**ToolDefinition 接口：**
```typescript
interface ToolDefinition<TParams = Record<string, unknown>> {
  name: string;
  description: string;
  category: "query" | "action";
  parameters: Record<string, ToolParameter>;
  handler: (params: TParams) => Promise<ToolResult>;
  formatResult: (result: ToolResult) => string;
}
```

**向后兼容：** 旧 `tools.ts` 的 `executeTool`、`formatToolResult`、`buildToolListForLLM` 函数签名保持不变，内部委托给 registry。现有调用方（route.ts）零改动。

### 5. SSE 事件扩展

现有 5 种事件保持，新增 3 种：

```
plan_created {tasks: [{id, title, tool?}]}   ← Planner 产出
task_started {taskId}                        ← 开始执行某项
task_done    {taskId, summary}               ← 某项完成（含简短摘要）
```

**兼容性：** 前端未知事件类型静默忽略，老客户端不受影响。

### 6. Quality Gate

最终回复前的自检规则（作为 System Prompt 注入）：

```
输出前检查：
1. 是否回答了用户的所有问题？
2. 回复中的数字/数据是否来自工具结果？（不编造）
3. 是否给出了具体建议？（不只是复述数据）
4. 是否需要进一步行动？→ 告知用户下一步可选操作

不通过 → 再迭代一轮思考。
```

**为什么不依赖外部评估器？** 求职场景不需要精确评估，自检足够。DeepSeek 推理能力够用。

## Risks / Trade-offs

- [Loop 导致延迟增加] 多轮 LLM 调用 + 工具执行 → 缓解：每个工具调用增加 <2s（DeepSeek 快 + DexieDB <10ms），总延迟可接受
- [Planner 拆解质量不稳定] LLM 可能拆出不合理的计划 → 缓解：maxIterations=5 限制破坏范围，失败任务跳过
- [上下文膨胀] 每轮追加 tool_call + tool_result → 缓解：截断策略（保留最近 15 条消息），工具结果截断到 500 字符
- [简单请求变慢] 查个投递也要走 Planner → 缓解：单步骤请求 Planner 输出 1 个任务，不增加额外 LLM 调用

## Open Questions

- Planner 的 <<PLAN>> 解析如果失败（JSON 格式错误），是否回退到无计划模式？
- Quality Gate 是否需要单独的 LLM 调用，还是作为同一轮 thinking 的一部分？
