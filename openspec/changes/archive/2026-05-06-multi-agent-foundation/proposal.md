## Why

当前 Agent Chat 是「一个 Agent + 一个 System Prompt + 全部 22 个工具」的单体架构。面试教练通过 prompt overlay 实现，dingwei 通过正则检测走特殊路径。这种架构的瓶颈已经显现：
- **Prompt 膨胀**：所有指令混在一起，不同场景互相干扰（面试教练必须写"绝对禁止 web_search"）
- **工具失控**：LLM 可能调用不相关的工具（面试时调用 search_applications）
- **知识冗余**：所有场景注入全部 knowledge，token 浪费
- **无法独立迭代**：改面试逻辑可能影响评估行为

VISION V2.5 规划的多 Agent 架构需要在首批 5 个 Agent 上验证完整能力：**独立上下文、独立工具、独立知识、独立记忆、共享 Career DNA**。

## What Changes

### Intent Router（意图路由层）

客户端轻量路由，正则 + 关键词匹配，不依赖 LLM：
- 识别 5 类用户意图（面试练习 / JD评估 / 画像定位 / 简历优化 / 通用咨询）
- 支持显式切换（"用面试教练模式"）绕过意图匹配
- 同 priority 按注册顺序，兜底 General Agent
- 切换 Agent 时保留完整对话历史

### 5 个专职 Agent（首批全部必做）

| Agent | ID | Priority | 工具 | 知识注入 | 触发场景 |
|-------|-----|----------|------|---------|---------|
| **Interview** | `interview` | 10 | generate_interview_questions, score_interview_answer | interview-styles | 面试练习/出题/模拟 |
| **Eval** | `evaluate` | 10 | evaluate_jd, fetch_jd_content, web_search | salary-benchmarks, zhiyuan-levels, jd-signals | JD评估/公司分析 |
| **Profile** | `profile` | 10 | mine_profile, get_profile, get_recommendations | zhiyuan-levels, salary-benchmarks | 自我定位/竞争力分析/找方向 |
| **Resume** | `resume` | 10 | generate_cv, evaluate_jd, export_file, get_profile | jd-signals | 生成简历/量身定制/量化优化 |
| **General** | `general` | 1 | 全部 22 个工具 | 全部 knowledge | 兜底：求职咨询/状态查询/闲聊 |

### 每个 Agent 的独立维度

**上下文隔离**：每个 Agent 拥有完全独立的 System Prompt（不叠加在 General prompt 上）。Interview Agent 的 prompt 不含通用工具描述，Eval Agent 的 prompt 不含面试指令。

**知识注入**：每个 Agent 只注入其需要的知识域。Interview → 面试风格，Eval → 薪资基准+职级+JD信号，Profile → 职级+薪资，Resume → JD信号，General → 全部。

**工具隔离（执行层强制）**：`ToolRegistry.execute()` 在接受调用前检查当前 Agent 的工具白名单。不在白名单中的工具调用直接返回错误，不依赖 prompt engineering。

**记忆标记**：所有消息持久化时标记 `agent_id`。渲染时在消息旁显示 Agent 来源标签。跨 Agent 信号流转——Interview 发现的弱项 → Eval 评估时加权，Profile 的偏好 → Resume 优化时参考。

### Agent Registry（注册中心）

- TypeScript 静态注册 + 运行时查询
- 集中管理所有 Agent 定义：id / name / intentPatterns / buildSystemPrompt / tools / knowledgeSubset / suggestions
- `classifyIntent(content)` → 返回匹配的 AgentDefinition
- 新增 Agent 只需在 AGENT_REGISTRY 数组中添加一项

### Shared Memory（共享记忆层）

- Career DNA 摘要：从 profile_signals + ZhiyuanProfile + config/profile.yml 聚合，所有 Agent 共享
- 会话 Memory Digest：≥5 条用户消息后生成，跨 Agent 切换保持不变
- 跨 Agent 发现查询：`getAgentFindings(agentId)` → 读取其他 Agent 的关键发现

### Phase 1 面试教练零回归迁移

- `interview-coach-prompt.ts` 被 interview-agent 直接 import（**不改代码**）
- `interview-tools.ts` 被 interview-agent 直接 import（**不改代码**）
- `agent/page.tsx` 中的 coach overlay 逻辑全部删除，统一走 Orchestrator
- 用户体验：自然语言触发 → 自动路由 → 与 Phase 1 完全一致的教练体验

## Capabilities

### New
- `agent-orchestrator`：意图分类 + Agent 路由 + 上下文组装 + 工具白名单生成
- `agent-registry`：Agent 注册中心，集中管理 Agent 定义、意图模式、prompt 版本
- `agent-shared-memory`：Career DNA 聚合 + 跨 Agent 发现查询 + 按需知识注入
- `agent-interview-subagent`：面试教练迁移为独立子 Agent（prompt + tools + suggestions）
- `agent-evaluate-subagent`：JD 评估独立子 Agent（评估专用 prompt + 3 个工具）
- `agent-profile-subagent`：求职画像独立子 Agent（dingwei SOP + mine_profile 工具）
- `agent-resume-subagent`：简历优化独立子 Agent（CV 生成 + 定制 + 量化）

### Modified
- `agent-conversation-page`：sendMessage 重构为 Orchestrator 驱动，删除 coach overlay 逻辑，消息加 agent_id
- `agent-execute-mode`：工具执行层增加白名单检查，agentLoopClient 增加 toolWhitelist 参数
- `agent-loop-client`：新增 toolWhitelist 参数，工具执行前强制校验
- `agent-knowledge`：新增 `getKnowledgeForAgent(domains)` 按域注入

## Impact

- **新增文件**: `lib/agent/registry/types.ts`, `lib/agent/registry/index.ts`, `lib/agent/registry/agents/{interview,evaluate,profile,resume,general}-agent.ts`, `lib/agent/shared-memory.ts`, `lib/agent/orchestrator/index.ts`
- **修改文件**: `types/index.ts` (+agent_id), `tools/registry.ts` (+setActiveAgentTools), `tools/index.ts` (+buildToolListForAgent), `loop/client-runner.ts` (+toolWhitelist), `app/agent/page.tsx` (重构 sendMessage), `components/agent/AgentChat.tsx` (+activeAgentId + 消息来源标签)
- **不变文件**: `interview-coach-prompt.ts`, `interview-tools.ts`, `prompt.ts`, 所有 API 路由, 所有 MCP 文件, `knowledge/` 目录
- **数据库**: AgentMessage 增加 `agent_id?: string` 可选字段（向后兼容）
- **API**: 无新增 API 路由。Orchestrator 完全在客户端执行
- **依赖**: 不依赖 `agent-interview-coach` 和 `agent-profile-intelligence` 完成——架构层面独立，可并行开发
