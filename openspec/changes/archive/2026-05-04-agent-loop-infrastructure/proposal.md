## Why

当前纸鸢 Agent 的"执行"模式只支持单轮工具调用——LLM 输出一个工具调用、执行、把结果喂回 LLM、生成回复。没有任何多步推理能力。用户说"分析投递情况，然后推荐岗位"，Agent 只能做其中一件事。工具全挤在 `tools.ts` 一个文件里，加新工具要改核心逻辑。这是 Agent 的骨架问题——没有 Agent Loop，就谈不上真正的 Agent。现在 `agent-conversational` 刚把 UI 层统一，是时候把引擎层的核心能力补上了。

## What Changes

- **新增 Agent Loop 引擎** (`src/lib/agent/loop/runner.ts`)：实现 Think → Act → Observe → Think 循环，最多 N 轮迭代，支持早停（工具结果已足够回答问题）
- **新增 Task Planner** (`src/lib/agent/loop/planner.ts`)：复杂请求先拆为有序 TODO，再逐项执行。Plan-As-You-Go 模式——拆完就开始跑，每完成一项汇报进度
- **工具系统插件化** (`src/lib/agent/tools/` 目录化)：每个工具独立文件，统一 `ToolDefinition` 接口，registry 汇总注册。加工具 = 新建文件 + registry 注册一行
- **SSE 事件扩展**：新增 `plan_created`、`task_started`、`task_done` 三种事件，支持前端渲染计划进度
- **API 路由升级**：`/api/agent/chat` 执行模式走 Agent Loop 而非单次工具调用

## Capabilities

### New Capabilities
- `agent-loop-engine`: Agent Loop 核心引擎 — Think→Act→Observe 循环，可配置最大迭代、早停策略、质量门禁
- `tool-plugin-system`: 工具插件化 — 每个工具独立文件，统一接口，registry 集中管理，加工具不改核心
- `task-planner`: 任务规划器 — 复杂请求自动拆解为有序 TODO，逐项执行并汇报进度

### Modified Capabilities
- `agent-execute-mode`: 执行模式从"单次工具调用"升级为"Agent Loop + Planner"驱动，SSE 事件新增 plan/task 类型

## Impact

- **新增**: `src/lib/agent/loop/` 目录（runner.ts, planner.ts, types.ts）
- **重构**: `src/lib/agent/tools.ts` → `src/lib/agent/tools/` 目录（types.ts, registry.ts, index.ts, query/*.ts, action/*.ts）
- **修改**: `src/app/api/agent/chat/route.ts` — 执行模式分支走 Agent Loop 替代当前单次调用
- **扩展**: SSE 事件类型新增 `plan_created`、`task_started`、`task_done`
- **依赖**: `agent-conversational`（已完成，提供 skill 加载 + Phase 可视化基础）
