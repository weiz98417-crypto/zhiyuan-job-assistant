# Agent Tools 填充修复计划

## 根因

每个 agent definition 都有 `tools: []`，注释说 "Populated at registration time via tools/index.ts"——但填充代码从未实现。导致：

- `orchestrator` 中 `toolWhitelist = agent.tools.map(...)` = `[]`
- `tools` 数组 = `[]`（空 whitelist → 无工具传给 DeepSeek）
- 所有通过 native function calling 的工具调用静默失败

**唯一例外**：`interview-agent` (`tools: INTERVIEW_TOOLS`)——它是硬编码的 `ToolDefinition[]`。

## 影响范围

| Agent | tools 状态 | 影响 |
|-------|-----------|------|
| evaluate | `[]` — 有 `EVAL_TOOL_NAMES` 字符串数组但未关联 | 评估相关工具不可用 |
| general | `[]` — catch-all，应包含全部工具 | 所有通用场景工具不可用 |
| profile | `[]` | 画像相关工具不可用 |
| resume | `[]` — 有 `RESUME_TOOL_NAMES` 字符串数组但未关联 | 简历相关工具不可用 |
| interview | `INTERVIEW_TOOLS` ✅ | 唯一正常工作的 |

## 修复方案

### Step 1: 给每个 Agent 统一的 `toolNames` 字段

当前每个 agent 的工具名分散在不同位置：
- `EVAL_TOOL_NAMES`（evaluate-agent 文件内局部常量）
- `RESUME_TOOL_NAMES`（resume-agent 文件内局部常量）
- `INTERVIEW_TOOLS`（interview-agent 文件内 `ToolDefinition[]`）
- general-agent 注释说 "ALL tools" 但无实现

**统一为** `AgentDefinition.toolNames: string[]`。

### Step 2: 添加 `populateAgentTools()` 函数

在 `tools/index.ts` 中新增函数，遍历所有注册的 agent，从 `ToolRegistry` 中按名查找 tool definition 并填充：

```typescript
export function populateAgentTools(agents: AgentDefinition[]): void {
  for (const agent of agents) {
    if (agent.tools.length > 0) continue; // already populated
    agent.tools = agent.toolNames
      .map((name) => registry.get(name))
      .filter(Boolean) as ToolDefinition[];
  }
}
```

### Step 3: 更新各 agent 的 toolNames

| Agent | toolNames |
|-------|-----------|
| evaluate | `["evaluate_jd", "evaluate_jd_full", "fetch_jd_content", "web_search", "analyze_jd_risks", "decode_black_market_terms"]` |
| general | `registry.getAll().map(t => t.name)` — 全部工具 |
| profile | `["get_profile", "get_recommendations", "get_profile_insights", "self_positioning", "check_pipeline_health"]` |
| resume | `["import_resume", "generate_cv", "evaluate_jd", "export_file", "get_profile", "optimize_resume_section"]` |
| interview | 保持不变（已有 `INTERVIEW_TOOLS`） |

### Step 4: 在 agent registry 中调用 populate

在 `registry/index.ts` 的 `AGENT_REGISTRY` 定义之后立即调用：

```typescript
import { populateAgentTools } from "@/lib/agent/tools";
// ...
populateAgentTools(AGENT_REGISTRY);
```

## 验证

1. 每个 agent 的 `tools` 数组非空（除特殊场景外）
2. `orchestrator` 产出的 `tools` 数组包含对应 agent 的工具
3. 发送"评估这个 JD" → `evaluate_jd_full` 被正确调用并返回结果
4. 发送"'亲自带'是什么意思" → `decode_black_market_terms` 被调用并返回解码
5. interview agent 功能不受影响

## 文件变更

| 文件 | 操作 |
|------|------|
| `registry/types.ts` | 修改 — AgentDefinition 新增 `toolNames: string[]` |
| `registry/agents/evaluate-agent.ts` | 修改 — 添加 `toolNames` |
| `registry/agents/general-agent.ts` | 修改 — 添加 `toolNames`（全部工具名） |
| `registry/agents/profile-agent.ts` | 修改 — 添加 `toolNames` |
| `registry/agents/resume-agent.ts` | 修改 — 添加 `toolNames` |
| `tools/index.ts` | 修改 — 新增 `populateAgentTools()` |
| `registry/index.ts` | 修改 — 调用 `populateAgentTools()` |
