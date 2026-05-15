# 11 -- Agent 聊天页完整功能拆解

> 页面: `src/app/agent/page.tsx` (约 700 行) | Agent 系统: `lib/agent/` 目录 (30+ 文件) | API: `/api/agent/run` 等 13 个端点

---

## 架构概览：混合 Agent 架构

```
┌─────────────────────────────────────────────────────────────┐
│                     Agent 系统架构                           │
│                                                              │
│  ┌───────────┐    ┌──────────────┐    ┌──────────────────┐  │
│  │ 用户输入   │───>│ Orchestrator │───>│ Agent Loop       │  │
│  │           │    │ classifyIntent│    │ (Server/Client)  │  │
│  └───────────┘    └──────┬───────┘    └────────┬─────────┘  │
│                          │                     │            │
│                          ▼                     ▼            │
│  ┌───────────────────────────────────────────────────────┐  │
│  │              6 个子 Agent (Sub-Agent Registry)         │  │
│  │                                                        │  │
│  │  Interview │ Evaluate │ Profile │ Resume │ General     │  │
│  │   (P=10)   │  (P=10)  │ (P=10)  │ (P=8)  │   (P=1)     │  │
│  └───────────────────────────────────────────────────────┘  │
│                          │                     │            │
│                          ▼                     ▼            │
│  ┌───────────────────────────────────────────────────────┐  │
│  │              30+ 工具 (ToolRegistry)                    │  │
│  │  Query(11) │ Action(17) │ Interview(2) │ MCP(5)        │  │
│  └───────────────────────────────────────────────────────┘  │
│                          │                     │            │
│                          ▼                     ▼            │
│  ┌───────────────────────────────────────────────────────┐  │
│  │          Layered Memory (3 layers)                     │  │
│  │  Working ────> Episodic ────> Semantic                │  │
│  │  (10 turns)    (summaries)     (cross-session facts)   │  │
│  └───────────────────────────────────────────────────────┘  │
│                          │                                  │
│                          ▼                                  │
│  ┌───────────────────────────────────────────────────────┐  │
│  │            数据层: SQLite (via API)                     │  │
│  │  sessions │ messages │ profile_signals │ reports       │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

**双 Loop 模式**：
- **Server-side loop** (`server-runner.ts`): 服务端 `/api/agent/run` 内运行，直接调用 DeepSeek API（API key 在服务端），可执行所有工具，适合复杂任务
- **Client-side loop** (`client-runner.ts`): 浏览器端运行，通过 `/api/agent/think` 代理 LLM 调用，适合交互式对话

---

## 功能清单

| # | 功能 | 实现 | 数据源 |
|---|------|------|--------|
| 1 | 意图分类路由 | `orchestrator/classifyIntent()` -- 6 个 Agent | 用户输入 |
| 2 | 6 子 Agent 系统 | Agent Registry + 各自 System Prompt | Career DNA + Knowledge |
| 3 | 30+ 工具生态 | ToolRegistry + 工具展示名 | 内部 + 外部 API |
| 4 | 双 Agent Loop | server-runner.ts / client-runner.ts | DeepSeek API (SSE) |
| 5 | 流式响应 + 阶段指示 | AgentChat SSE events + 阶段状态栏 | `/api/agent/run` |
| 6 | 会话管理 (SQLite) | 创建/列表/切换/删除/恢复/Pin | SQLite sessions 表 |
| 7 | 分层记忆系统 | Layer 1 Working / Layer 2 Episodic / Layer 3 Semantic | SQLite |
| 8 | 记忆摘要生成 | `memory/coordinator.ts` → DeepSeek 摘要 | SQLite |
| 9 | 工具调用日志 + 阶段展示 | AgentChat 内联 ToolCallLog + Phase 指示器 | Agent Loop 输出 |
| 10 | 工具展示名系统 | `tool-display-names.ts` (30+ 映射) | 硬编码 |
| 11 | Claude 活动上下文 | `getClaudeAgentActivity()` | `/api/agent/claude-activity` → SQLite |
| 12 | Agent 选择切换 | 自动路由 + AgentSelector | 6 个 Agent |
| 13 | 建议快捷词 | `SuggestionChips` 组件 | 各 Agent 预设快捷提问 |
| 14 | 探索→Agent 数据迁移 | `migrateExploreToAgent()` | IndexedDB → SQLite |
| 15 | 信号提取与画像更新 | `signal-extractor.ts` + `triggerProfileUpdate()` | 对话信号 → profile_signals |

---

## 功能拆解

### 1. 意图分类路由 (Orchestrator)

```typescript
// orchestrator/index.ts
export async function orchestrate(content, ctx): OrchestratorResult {
  // 1. Intent classification
  const agent = classifyIntent(content);

  // 2. Build shared context (server-side sources of truth)
  const [careerDNA, cvSummary, agentKnowledge, claudeAgentActivity] = await Promise.all([...]);

  // 2.5 Build layered memory context (working + episodic + semantic)
  const memCtx = await buildContext(ctx.sessionId, ctx.messages);

  // 3. Build agent-specific system prompt
  const promptCtx = { careerDNA, memoryDigest, currentMessages, agentKnowledge, claudeAgentActivity };
  const systemPrompt = await agent.buildSystemPrompt(promptCtx);

  // 4 + 5. Generate tool whitelist + OpenAI-compatible tools array
  // 6. Return everything for agentLoopClient/server
  return { agent, systemPrompt, toolWhitelist, tools, annotatedMessages };
}
```

**分类优先级**：
1. `explicitSwitchPatterns` -- 用户显式指定切换（如"用简历助手"）
2. `intentPatterns` -- 按 priority 排序（registration order 打破平局）
3. `generalAgent` -- 兜底（priority=1，pattern `/.*/` 匹配一切）

### 2. 6 子 Agent 系统

每个子 Agent 定义在 `src/lib/agent/registry/agents/` 下：

| Agent | ID | Priority | 工具白名单 | 触发词示例 |
|-------|-----|----------|-----------|-----------|
| 面试教练 | `interview` | 10 | `generate_interview_questions`, `score_interview_answer`, `web_search`, `get_profile`, `start_interview_session`, `prepare_interview_full` | "面试"/"模拟面试"/"准备面试" |
| JD 评估 | `evaluate` | 10 | `evaluate_jd`, `evaluate_jd_full`, `fetch_jd_content`, `web_search`, `analyze_jd_risks`, `decode_black_market_terms` | "评估"/"分析JD"/"这个岗位" |
| 求职画像 | `profile` | 10 | `mine_profile`, `get_profile`, `self_positioning`, `get_profile_insights`, `detect_skill_gaps`, `web_search` | "定位"/"方向"/"我适合" |
| 简历 Agent | `resume` | 8 | `import_resume`, `generate_cv`, `evaluate_jd`, `export_file`, `get_profile`, `optimize_resume_section`, `save_resume_section`, `check_ats_compatibility` | "简历"/"CV"/"修改简历" |
| 通用助手 | `general` | 1 | 全部工具（无限制） | 兜底 |

**Agent 定义接口** (`registry/types.ts`):
```typescript
interface AgentDefinition {
  id: string;                    // 唯一标识
  name: string;                  // 中文展示名
  description: string;           // 能力描述
  intentPatterns: RegExp[];      // 触发模式
  explicitSwitchPatterns?: RegExp[]; // 显式切换
  buildSystemPrompt: (ctx) => Promise<string>; // 构建系统提示
  tools: ToolDefinition[];       // 可用工具（运行时populate）
  toolNames: string[];           // 工具名白名单
  knowledgeSubset?: KnowledgeDomain[]; // 知识注入域
  priority: number;              // 路由优先级
  suggestions: AgentSuggestion[]; // 建议快捷词
  model?: string;                // 可选模型覆盖
}
```

**上下文组装** (orchestrator 在每次对话前执行):

```
1. Career DNA: 目标岗位/薪资/底线/技能 → /api/profile/dna
2. CV Summary: 当前简历内容 → localStorage "zhiyuan-cv"
3. Agent Knowledge: 按 knowledgeSubset 注入领域知识
4. Claude Activity: 最近 5 条评估摘要 → /api/agent/claude-activity
5. Memory Digest: 会话摘要 (≥5条消息) → 分层记忆系统
6. Semantic Context: 跨会话事实 → 语义记忆层
```

### 3. 工具生态系统 (30+ Tools)

所有工具注册在 `src/lib/agent/tools/index.ts`，统一通过 `ToolRegistry` 管理。

**Query 工具 (11)** -- 只读查询：
| 工具名 | 功能 | 展示标签 |
|--------|------|---------|
| `search_applications` | 搜索投递记录 | 📋 搜索投递记录 |
| `get_report_detail` | 查看评估报告详情 | 📊 查看评估报告 |
| `get_profile` | 读取求职画像 | 👤 读取求职画像 |
| `get_recent_activity` | 查看近期活动 | 🕐 近期活动 |
| `get_recommendations` | 推荐适合岗位 | 💼 岗位推荐 |
| `get_pipeline_status` | 查看管道状态 | 📡 Pipeline 状态 |
| `decode_black_market_terms` | 黑话术语解码 | 🔓 黑话解码 |
| `check_pipeline_health` | 管道健康检查 | 📋 管道健康检查 |
| `get_profile_insights` | 个人画像洞察 | 📊 画像洞察 |
| `detect_skill_gaps` | 技能缺口分析 | 🔍 技能缺口分析 |
| `check_ats_compatibility` | ATS 兼容检查 | 🤖 ATS 兼容检查 |

**Action 工具 (17)** -- 有副作用的操作：
| 工具名 | 功能 | 展示标签 |
|--------|------|---------|
| `evaluate_jd` | 基本 JD 评估 | 🔍 评估 JD |
| `evaluate_jd_full` | 完整 JD 评估管道 (抓取+风险+评估+存储) | 🛡️ JD 完整评估 |
| `analyze_jd_risks` | 独立 JD 风险扫描 | ⚠️ JD 风险扫描 |
| `evaluate_offer` | Offer 评估 | 💰 评估 Offer |
| `compare_offers_deep` | 多 Offer 深度对比 | ⚖️ Offer 深度对比 |
| `generate_cv` | 生成定制简历 | 📄 生成简历 |
| `optimize_resume_section` | 优化简历片段 | ✏️ 简历优化 |
| `save_resume_section` | 保存到简历 | 💾 保存到简历 |
| `import_resume` | 导入简历文件 | 📥 导入简历 |
| `scan_portals` | 扫描招聘网站 | 🔎 扫描招聘网站 |
| `check_health` | 系统健康检查 | 🩺 健康检查 |
| `fetch_jd_content` | 抓取 JD 页面正文 | 📥 获取 JD 内容 |
| `export_file` | 导出文件 (PDF/JSON) | 📦 导出文件 |
| `mine_profile` | 自定位挖掘 (dingwei SOP) | ⛏️ 挖掘画像 |
| `self_positioning` | 自我定位引导 | 🧭 自我定位引导 |
| `prepare_interview_full` | 面试全案准备 | 🎯 面试全案准备 |
| `start_interview_session` | 启动模拟面试 | 🎙️ 启动模拟面试 |

**Interview 工具 (2)** -- 面试教练专用：
| 工具名 | 功能 | 展示标签 |
|--------|------|---------|
| `generate_interview_questions` | 生成面试题目 | 📝 生成面试题 |
| `score_interview_answer` | 评分面试回答 | ⭐ 评分面试回答 |

**MCP 工具 shim (5)** -- 代理到服务端 MCP：
| 工具名 | 功能 | 展示标签 |
|--------|------|---------|
| `web_search` | 网络搜索 | 🌐 网络搜索 |
| `get_weather` | 天气查询 | 🌤️ 天气查询 |
| `search_place` | 地点搜索 | 📍 地点搜索 |
| `get_directions` | 路线规划 | 🗺️ 路线规划 |
| `search_jobs` | 搜索职位 | 🔎 搜索职位 |

**工具管控**：
- 每个子 Agent 的 `toolNames` 白名单决定其可见工具
- `setActiveAgentTools()` 在每次 Agent 切换时更新 ToolRegistry 白名单
- Server loop 端还会做二次校验：`toolWhitelist.includes(tc.name)` 不匹配则拒绝执行

### 4. 双 Agent Loop（质量门控 ReAct 循环）

#### Server-side Loop (`server-runner.ts`)

运行在 `/api/agent/run` 端点内：

```
while (iteration < maxIterations):
  ├─ Phase: understanding/reflecting → yield SSE phase event
  ├─ 调用 DeepSeek API (model chain fallback: DeepSeek → Zhipu → Qwen)
  │   ├─ 无 tool_calls → 流式输出文本 → done
  │   └─ 有 tool_calls → 执行每个工具
  │       ├─ Phase: executing → yield tool_call event
  │       ├─ 执行 executeTool(name, params) → 质量检查
  │       ├─ Phase: verifying → yield tool_result + result_quality
  │       ├─ Self-healing: 质量差(<empty>/<irrelevant>) 自动重试 (max 2)
  │       └─ 注入结果到 context，继续 Loop
  └─ consecutiveFailures ≥ 2 → 终止
  └─ autoRetryCount > 2 → 强制输出
```

**Model Chain Fallback**: DeepSeek V4 Flash → GLM-4.6v FlashX → Qwen-Long
- 服务端直接持有 API keys
- 支持 429/503 状态码重试
- 流式读取 + 原生 function calling 解析

**质量门控**：
- `checkResultQuality()`: 检测空结果 / 不相关结果（影视剧/动漫/游戏干扰）
- 空/不相关 → 自动换关键词重试（最多 2 次）
- 连续失败保底：达到上限后强制 LLM 基于已有知识输出

#### Client-side Loop (`client-runner.ts`)

运行在浏览器端，通过 `/api/agent/think` 代理 LLM 调用（API key 不在客户端）：

```
while (iteration < maxIterations):
  ├─ Phase: understanding/reflecting
  ├─ fetchFromThinkProxy() → POST /api/agent/think
  │   ├─ 注入研究协议 (实体拆解 → 独立搜索 → 验证质量)
  │   └─ 追踪已执行搜索，避免重复
  ├─ collectThinkResponse() → 解析 SSE 流
  ├─ 无 tool_calls → 字符级流式输出文本 → done
  └─ 有 tool_calls → 同 server loop 的质量门控逻辑
```

**研究协议** (`RESEARCH_PROTOCOL`, 注入到每次 think 调用的最后一条 user 消息):
1. 拆实体：多个独立实体不合并搜索
2. 先发现再深入：对未知企业先搜名单再逐个深挖
3. 每个实体单独搜一次
4. 验证结果质量
5. 全部搜完后整合输出

#### Loop 配置

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `maxIterations` | 5 | 最大思考轮数 |
| `MAX_CONTEXT_TOKENS` | 64000 | 上下文 token 上限 |
| `DEFAULT_TOOL_CTX_CAP` | 800 | 工具结果注入 LLM 上下文的默认字符上限 |
| `MAX_MESSAGES` | 30 (client) | 最大消息数 |
| `MAX_AUTO_RETRY` | 2 | 自动重试次数 |

### 5. 流式响应 + 阶段状态展示

SSE (Server-Sent Events) 事件类型 (定义在 `loop/types.ts`):

| 事件类型 | 含义 | UI 表现 |
|---------|------|--------|
| `phase` | Agent 当前阶段 | 阶段状态栏更新 |
| `thinking_content` | LLM 思考过程 | ThinkingBubble 组件 |
| `tool_call` | 工具调用开始 | ExecutingIndicator + 工具名 |
| `tool_result` | 工具执行结果 | ToolResultCard (可折叠详情) |
| `tool_error` | 工具错误 (含 recoverable 标记) | 错误提示 + 重试建议 |
| `result_quality` | 工具结果质量 (good/empty/irrelevant) | 内部使用 |
| `text` | 流式文本输出 | 逐字显示 |
| `done` | 对话轮次结束 | 清除 loading 状态 |

**阶段流转** (`AgentPhase`):
```
understanding → executing → verifying → reflecting → responding → done
    (首轮)      (调工具)     (验证)       (分析)       (输出)     (结束)
```

**阶段状态栏** (内嵌在 AgentChat 组件中，非独立 AgentStatusBar 组件):
| 阶段 | 中文标签 | 图标 |
|------|---------|------|
| `understanding` | 识别中... | Brain |
| `executing` | 执行: {toolName} | Loader2 (animate-spin) |
| `verifying` | 验证结果中... | CheckCircle |
| `reflecting` | 分析结果中... | RefreshCw (animate-spin) |
| `responding` | 回答中... | -- |
| `done` | (隐藏状态栏) | -- |

**特殊渲染组件**：
- `ThinkingBubble`: 显示 LLM 在调用工具前的思考文本
- `ReflectingIndicator`: 工具执行后分析阶段的 loading 动画
- `ExecutingIndicator`: 工具调用时的动态提示（带工具展示名和 emoji）
- `ToolResultCard`: 工具执行结果卡片，支持展开/折叠查看详情

### 6. 会话管理 (SQLite-based)

**数据模型** (SQLite `sessions` 表):

```typescript
interface ChatSession {
  id?: number;
  title: string;          // 自动生成: 首条用户消息前6字
  messages: AgentMessage[]; // 最大 200 条/会话
  pinned: boolean;         // 置顶
  createdAt: string;
  updatedAt: string;
}
```

**存储策略**：
- 主路径：`POST /api/sessions` → 写入 SQLite
- 本地缓存：Dexie `chatSessions` 表 (读取缓存，写入以服务端为准)
- `createSession()` 先尝试服务端 API，失败则 fallback 到 Dexie

**操作**：
| 操作 | 函数 | 说明 |
|------|------|------|
| 创建 | `createSession()` | 自动生成标题，先服务端再本地 |
| 列表 | `listSessions()` | 按更新时间倒序，过滤已删除 |
| 切换 | `getSession(id)` | 加载历史消息 |
| 更新 | `updateSession()` | 追加消息，更新 updatedAt |
| 删除 | `softDeleteSession(id)` | 软删除 (设置 deletedAt) |
| 恢复 | `undoDeleteSession(id)` | 清除 deletedAt |
| 置顶 | `pinSession(id, bool)` | 设置 pinned |
| 默认 | `ensureDefaultSession()` | 首次访问自动创建 |
| 删除确认 | `confirmDeleteSession(id)` | 永久删除 |

**UI 状态**：
- 空状态：欢迎消息 + 建议快捷词
- 有会话：SessionList 侧边栏 (置顶 → 最近 → 已删除切换)

### 7. 分层记忆系统 (Layered Memory)

三层记忆架构，由 `src/lib/agent/memory/coordinator.ts` 编排：

```
┌──────────────────┐
│ Layer 1: Working │ ← 最近 10 轮对话 (直接注入 prompt)
│ (working.ts)     │
├──────────────────┤
│ Layer 2: Episodic│ ← 早期对话摘要 (≥15条用户消息时触发)
│ (episodic.ts)    │    DeepSeek 生成 → 注入为 [摘要] 前缀
├──────────────────┤
│ Layer 3: Semantic│ ← 跨会话事实 (长期记忆)
│ (semantic.ts)    │    SQLite 持久化 → 注入为 ## 已知事实
└──────────────────┘
```

**MemoryContext 输出**:
```typescript
interface MemoryContext {
  truncatedMessages: { role: string; content: string }[];  // Layer 1
  summaryInjection: string;                                 // Layer 2
  semanticInjection: string;                                // Layer 3
}
```

### 8. 记忆摘要生成

由 `memory/coordinator.ts` 的 `buildContext()` 统一编排：

```
buildContext(sessionId, messages):
  1. Working: buildWorkingContext(messages, 10) → 最近 10 轮
  2. Episodic: shouldSummarize(messages)?
     ├─ 已有摘要 → loadSummary(sessionId)
     └─ 无摘要 → generateSummary(earlyMessages) → saveSummary(sessionId)
  3. Semantic: loadSemanticContext(sessionId) → 跨会话事实
```

摘要触发条件：对话超过 15 条用户消息。早期消息（前 5 轮）送给 DeepSeek 生成一句摘要，持久化到 SQLite。

### 9. 工具调用日志 + 阶段展示

Agent 执行过程中的工具调用链实时展示在聊天流中：

```
用户: "帮我分析字节跳动 AI PM 岗位"
    ↓
[Phase: executing]
🔍 网络搜索 "字节跳动 AI产品经理 薪资 2026"
    ↓
[Phase: verifying]
📊 验证结果中...
    ↓ (折叠的搜索结果详情)
[Phase: executing]
🛡️ JD 完整评估
    ↓
[Phase: reflecting]
分析结果中...
    ↓
[Phase: responding]
"根据搜索和评估结果，字节跳动AI产品经理..."
```

**ToolCallLog / ToolResultCard** 组件功能：
- 展示工具名（中文标签 + emoji，通过 `getToolDisplay()` 获取）
- 执行状态（loading / success / error）
- 结果详情可折叠（默认折叠，避免刷屏）
- 错误时显示可恢复/不可恢复标记

### 10. 工具展示名系统 (`tool-display-names.ts`)

将下划线命名（`evaluate_jd_full`）映射为中文标签（"JD 完整评估"）和 emoji（🛡️）：

```typescript
// 30+ 条映射
const TOOL_DISPLAY: Record<string, ToolDisplay> = {
  evaluate_jd_full:     { label: "JD 完整评估",  emoji: "🛡️" },
  analyze_jd_risks:     { label: "JD 风险扫描",  emoji: "⚠️" },
  prepare_interview_full:{ label: "面试全案准备", emoji: "🎯" },
  // ...
};

function getToolDisplay(toolName: string): ToolDisplay {
  return TOOL_DISPLAY[toolName] || { label: toolName, emoji: "🔧" };
}
```

用于 AgentChat 中的 `ExecutingIndicator` 和 `ToolResultCard` 组件。

### 11. Claude 活动上下文

详见 [08-Agent互通机制](./08-Agent互通机制.md)

注入时机：每次对话开始前，`orchestrator` 自动调用 `getClaudeAgentActivity()`。
注入内容：最近 5 条评估 + 管道状态摘要。
数据来源：`/api/agent/claude-activity` → SQLite applications/reports 表。

### 12. Agent 选择切换

两种模式：
- **自动路由**：`classifyIntent()` 根据用户消息内容自动匹配 Agent
- **手动切换**：Agent 侧边栏选择器，用户可强制切换（使用 `explicitSwitchPatterns` 匹配）

切换时触发：新 Agent 的 System Prompt 生成 → 工具白名单更新 → 建议快捷词更新。

### 13. 建议快捷词 (SuggestionChips)

每个 Agent 定义自己的 `suggestions` 数组：

```typescript
// 通用助手的默认建议
const DEFAULT_SUGGESTIONS = [
  { label: "自我定位", prompt: "帮我做自我定位" },
  { label: "评估JD", prompt: "帮我评估一个JD: " },
  { label: "生成简历", prompt: "根据我的画像生成一份简历" },
  { label: "推荐岗位", prompt: "根据我的画像推荐几个适合的岗位" },
  { label: "查投递", prompt: "帮我查一下最近的投递记录" },
  { label: "模拟面试", prompt: "帮我做一次模拟面试练习" },
  { label: "导出报告", prompt: "帮我生成一份求职进展报告并导出" },
];
```

点击 a chip → 自动填入输入框 → 触发 send。

### 14. 探索 → Agent 数据迁移

`migrateExploreToAgent()` 将旧的 `/explore` 页面数据迁移到新的 Agent 系统：
- 复制用户偏好设置
- 迁移历史对话记录
- 保留技能标签和目标

### 15. 信号提取与画像更新

`signal-extractor.ts` 从对话中提取用户信号（技能提及、偏好、底线），通过 `triggerProfileUpdate()` 自动更新用户画像。信号去重和合并由 `deduplicateSignals()` 处理。

---

## API 端点汇总

| 端点 | 方法 | 用途 |
|------|------|------|
| `/api/agent/run` | POST | 服务端 Agent Loop 入口 (SSE) |
| `/api/agent/think` | POST | 客户端 Loop 的 LLM 代理 |
| `/api/agent/chat` | POST | 对话 API (兼容) |
| `/api/agent/claude-activity` | GET | Claude Agent 最近活动 |
| `/api/agent/context` | POST | 场景上下文 (dingwei prompt) |
| `/api/agent/evaluate-pipeline` | POST | JD 评估完整管道 |
| `/api/agent/scan-risks` | POST | JD 风险扫描 |
| `/api/agent/fetch-jd` | POST | JD 内容抓取 |
| `/api/agent/decode-terms` | POST | 黑话术语解码 |
| `/api/agent/coach/session` | POST | 面试教练会话 |
| `/api/agent/coach/generate-questions` | POST | 生成面试题 |
| `/api/agent/coach/score-answer` | POST | 评分面试回答 |
| `/api/agent/prefs` | GET/POST | Agent 偏好设置 |
| `/api/sessions` | GET/POST/DELETE | 会话 CRUD |
| `/api/profile/dna` | GET | Career DNA 摘要 |
