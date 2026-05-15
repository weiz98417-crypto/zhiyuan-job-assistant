# 17 — Agent 工具生态

## 1. 整体架构概览

Agent 工具系统是"真 Agent"的核心执行层，所有工具遵循统一的注册-执行-格式化范式。

```
                              ┌──────────────────────────┐
                              │       ToolRegistry        │
                              │  ┌────────────────────┐   │
                              │  │ Map<name, ToolDef>  │   │
                              │  └────────────────────┘   │
                              │  activeAgentTools: Set    │
                              └──────┬───────────────────┘
                                     │
              ┌──────────────────────┼──────────────────────┐
              │                      │                      │
     ┌────────▼────────┐   ┌────────▼────────┐   ┌────────▼────────┐
     │   Query Tools    │   │   Action Tools   │   │    MCP Shims    │
     │   (只读，不修改)  │   │  (修改数据/触发流)│   │ (代理到外部服务)  │
     │      11 个       │   │      17 个       │   │      5 个       │
     └─────────────────┘   └─────────────────┘   └─────────────────┘
              │                      │                      │
              └──────────────────────┼──────────────────────┘
                                     │
                          ┌──────────▼──────────┐
                          │   Interview Tools    │
                          │   (出题 + 评分)       │
                          │       2 个            │
                          └─────────────────────┘

共 41 个工具，覆盖查询、动作、面试、MCP 四大类别。
```

### 1.1 核心类型定义

**`ToolDefinition`** — 工具的完整定义：

```
ToolDefinition {
  name: string;                          // 唯一标识，如 "evaluate_jd"
  description: string;                   // 给 LLM 看的功能描述
  category: "query" | "action";          // query=只读不修改, action=会触发副作用
  parameters: Record<string, ToolParameter>;  // 输入参数 schema
  handler: (params) => Promise<ToolResult>;   // 执行逻辑
  formatResult: (result) => string;           // @deprecated 格式化输出（迁移中，fallback 保留）
  buildLLMSummary?: (result) => string;       // 构建 LLM 摘要（默认取 result.llmSummary）
  toolCtxCap?: number;                        // LLM 上下文截断上限（默认 800，文档类 4000）
}
```

**`ToolResult`** — 工具执行结果（三管道架构）：

```
ToolResult {
  success: boolean;              // 是否执行成功
  data: unknown;                 // @deprecated 原始数据（保留向后兼容）
  error?: string;                // 错误信息 (success=false 时有值)
  errorCategory?: ErrorCategory; // 错误分类: ok|transient|permanent|need_user_input
  recoverable?: boolean;         // @deprecated 用 errorCategory 替代
  retryHint?: string;            // 重试提示

  // ── 三管道架构 ──
  llmSummary?: string;           // LLM 上下文文本（默认 800 字截断）
  uiPayload?: Record<string,unknown>; // UI 结构化数据（驱动组件渲染，不进 LLM 上下文）
  rawData?: unknown;             // 完整原始数据（存储/日志）
}
```

**三管道设计**：`llmSummary` 专门给 LLM 做决策（精简摘要），`uiPayload` 给 React 组件渲染（结构化数据），`rawData` 给持久化存储。三条线独立调参，互不挤压。未迁移的工具由 `formatResult` fallback 保证兼容。

**`ToolParameter`** — 参数定义：

```
ToolParameter {
  type: "string" | "number" | "boolean" | "object" | "array";
  required: boolean;
  description: string;
}
```

### 1.2 ToolRegistry 核心逻辑

`src/lib/agent/tools/registry.ts` 中的 `ToolRegistry` 类提供：

```
register(tool)           → 将工具注册到 Map<name, ToolDef>
get(name)               → 按名称查找
getAll()                → 获取全部工具列表
getByCategory(category) → 按 query/action 分类筛选
buildToolListText()     → 生成给 LLM 的文本工具列表
toOpenAITools()         → 转换为 OpenAI function-calling 格式

execute(name, params)   → 执行工具 (含 whitelist 拦截)
  ├─ 检查 activeAgentTools: 如果设置了白名单且工具不在其中 → 拒绝
  ├─ 查找 tool definition
  ├─ 调用 tool.handler(params)
  └─ 捕获异常 → 返回 { success: false, error: ... }

formatResult(result, name) → 调用工具的 formatResult 格式化输出

setActiveAgentTools(names)  → 设置当前活跃 Agent 的白名单
clearActiveAgentTools()     → 清除白名单 (允许所有工具)
```

### 1.3 注册-执行全流程

```
启动阶段:
  index.ts 导入所有工具 → registry.register(...) × 35
  populateAgentTools(agents) → 将 toolNames 解析为 tools 数组

运行时:
  用户发送消息
    → classifyIntent() 路由到匹配的 Agent
    → Agent.systemPrompt 注入工具列表文本
    → LLM 返回 function_call { name, arguments }
    → registry.execute(name, arguments)
        → whitelist 检查 (通过)
        → handler(params)
        → 返回 ToolResult
    → registry.formatResult(result, name)
    → 格式化文本追加到 LLM 上下文
    → LLM 继续生成或返回最终回复
```

---

## 设计思想

Agent 工具生态的设计遵循一个看似朴素但极为强大的原则——**Unix 哲学：每个工具只做一件事，把它做到极致**。这不是盲目套用经典教条，而是经过实践验证的工程智慧。当 LLM 需要在多个工具之间做决策时，一个职责清晰的工具比一个"全能的"工具更容易被正确调用。`evaluate_jd_full` 负责评估，`analyze_jd_risks` 负责风险扫描，`fetch_jd_content` 负责抓取——三者的边界像乐高积木一样分明，LLM 在推理时几乎不会搞混。

这种设计背后的深层逻辑是**组合优于配置**。工具本身不是"API 端点加了一层聊天包装"——而是可以被 LLM 编排的基础原语。一个复杂的求职评估任务可能涉及 5 个工具的链式调用：先 `fetch_jd_content` 抓取 JD 文本，再 `analyze_jd_risks` 扫描风险信号，然后 `evaluate_jd_full` 执行 7 维评估，如果用户对简历不放心，还可能调用 `check_ats_compatibility` 做格式检查。每一个工具独立可测试、独立可迭代，新增一个能力就是新增一个文件——定义 handler、写 formatResult、export 注册——不需要改动任何编排代码。

工具的 **action/query 二分法**直接借鉴了 **CQRS（命令查询职责分离）** 模式。Query 工具（11 个）是纯读操作：不写入任何数据，不产生副作用，即使被 LLM 反复调用也不会造成数据污染。Action 工具（17 个）是写操作：会修改 SQLite、localStorage、触发网络请求或推进 SOP 状态机。这种分类不仅是文档层面的标注——ToolRegistry 的执行层可以利用这个分类做差异化处理：比如在测试环境中 stub 所有 Action 工具但让 Query 工具真实执行，从而安全地验证 Agent 的推理逻辑。

新工具的注册流程也体现了极简设计原则。一个 `ToolDefinition` 只需要四个要素：name（唯一标识）、handler（执行逻辑）、formatResult（格式化输出给 LLM）、category（query/action）。没有复杂的配置文件，没有 XML 描述符，没有注解——就是一个 TypeScript 对象。`populateAgentTools()` 函数自动将工具按白名单注入到各个子 Agent，新工具被注册后 30 秒内就能在全系统中生效。这种轻量级的设计意味着扩展成本极低，鼓励"先做出来试试"的快速迭代节奏。

---

## 2. 工具全景列表 (41 个)

### 2.1 Query 工具 (16 个 — 只读查询)

| # | 工具名 | 中文名 | 描述 | 关键参数 |
|---|--------|--------|------|----------|
| 1 | `search_applications` | 搜索投递记录 | 搜索用户的投递记录，可按状态和公司名筛选 | `status?`, `company?`, `limit?` |
| 2 | `get_report_detail` | 查看评估报告 | 获取某份评估报告的完整 A-G 详情（三管道：llmSummary + uiPayload） | `reportNum*` (报告编号) |
| 3 | `get_reference_detail` | 读取参考简历 | 读取上传参考简历的全文（按 ID） | `id*` (参考简历 ID) |
| 4 | `read_file` | 读取文件 | 智能路由文件读取：我的简历→CV API，参考简历→DB，文件路径→服务端 | `path*` (文件路径或资源名) |
| 5 | `get_profile` | 读取求职画像 | 获取用户完整求职画像和简历全文（三管道：llmSummary + ProfileViewCard uiPayload） | 无参数 |
| 6 | `get_recent_activity` | 近期活动 | 获取最近 10 条投递活动记录 | 无参数 |
| 7 | `get_recommendations` | 岗位推荐 | 基于用户画像和偏好获取智能推荐岗位 | `limit?` |
| 8 | `get_pipeline_status` | Pipeline 状态 | 获取 Pipeline 总体投递统计（按状态分组，平均分） | 无参数 |
| 9 | `decode_black_market_terms` | 黑话解码 | 解释 JD 中的招聘黑话真实含义（如"亲自带"→无偿加班风险） | `phrase*` (要解码的短语) |
| 10 | `check_pipeline_health` | 管道健康检查 | 检测超过 7 天未回复的投递项，按逾期天数降序排列 | 无参数 |
| 11 | `get_profile_insights` | 画像洞察 | 从历史行为信号提炼求职偏好、行业倾向、投递模式 | 无参数 |
| 12 | `detect_skill_gaps` | 技能缺口分析 | 对比 CV 和 JD，输出缺失技能/薄弱项/匹配项/学习建议 | `jd_text*`, `cv_text?` |
| 13 | `check_ats_compatibility` | ATS 兼容检查 | 检查简历的 ATS 兼容性（联系方式/量化密度/关键词/格式） | `cv_text*` |
| 14 | `generate_interview_questions` | 生成面试题 | 根据 JD/简历/模式生成 8-12 道面试题 | `jdText?`, `cvText?`, `company?`, `role?` |
| 15 | `score_interview_answer` | 评分面试回答 | 对面试回答进行四维度评分 | `question*`, `answer*` |
| 16 | — | — | — | — |

### 2.2 Action 工具 (18 个 — 触发副作用)

| # | 工具名 | 中文名 | 描述 | 关键参数 |
|---|--------|--------|------|----------|
| 12 | `evaluate_jd` | 评估 JD | 7 维评估 JD，支持文本/URL/截图输入 | `jdText?`, `jdUrl?`, `images?`, `language?` |
| 13 | `evaluate_offer` | 评估 Offer | 评估录取 offer（薪资/福利/成长性维度分析） | `offerText*`, `language?` |
| 14 | `generate_cv` | 生成简历 | 根据 JD 和用户画像生成定制化简历 | `jdText*`, `language?`, `targetRole?` |
| 15 | `scan_portals` | 扫描招聘网站 | 扫描招聘网站，搜索新发布职位 | `query?`, `company?`, `days?` |
| 16 | `check_health` | 健康检查 | 检查 Pipeline 健康状态（堆积/停滞风险） | `pipeline*`, `thresholds?` |
| 17 | `fetch_jd_content` | 获取 JD 内容 | 通过 URL 抓取 JD 完整文本内容 | `url*` |
| 18 | `export_file` | 导出文件 | 导出内容为文件并触发浏览器下载（md/html/txt） | `content*`, `filename*`, `format?` |
| 19 | `import_resume` | 导入简历 | 导入简历文本并解析为结构化栏位 | `text*` |
| 20 | `mine_profile` | 挖掘画像 | 启动/推进求职画像挖掘 SOP 流程（5 阶段对话） | `action*` (start/answer/complete/reset), `answer?` |
| 21 | `evaluate_jd_full` | JD 完整评估 | 风险信号检测 + 7 维评分 + 报告 + 写入数据库（一键评估管道） | `jd_text?`, `jd_url?` |
| 22 | `analyze_jd_risks` | JD 风险扫描 | 快速扫描 JD 文本的风险信号（黑话/骗术/用工形式） | `jd_text*` |
| 23 | `self_positioning` | 自我定位引导 | 启动 4 阶段职业方向探索（兴趣→能力→限幅→收敛） | 无参数 |
| 24 | `prepare_interview_full` | 面试全案准备 | 生成完整面试方案（技术/行为/HR/群面/薪资/反问/STAR） | `company?`, `role?` |
| 25 | `compare_offers_deep` | Offer 深度对比 | 从 6 维度对比多个 offer，给出加权推荐和谈判策略 | `offers*` (数组) |
| 26 | `start_interview_session` | 启动模拟面试 | 启动交互式模拟面试会话 | `company*`, `role*` |
| 27 | `optimize_resume_section` | 简历优化 | 优化简历板块（full/polish/expand/quantify 四种操作） | `section?`, `instruction?`, `operation?`, `effort?` |
| 28 | `save_resume_section` | 保存到简历 | 用户确认后将优化方案写入简历（SQLite + localStorage） | `section*`, `content*` |
| 29 | `download_report_pdf` | 导出报告 PDF | 获取评估报告数据，构建 HTML 页面并打开浏览器打印对话框 | `reportNum*` |

### 2.3 Interview 工具 (2 个)

| # | 工具名 | 中文名 | 描述 | 关键参数 |
|---|--------|--------|------|----------|
| 29 | `generate_interview_questions` | 生成面试题 | 根据 JD/简历/模式生成 8-12 道面试题（行为/技术/案例/文化 四类） | `jdText?`, `cvText?`, `company?`, `role?`, `mode?`, `count?` |
| 30 | `score_interview_answer` | 评分面试回答 | 对面试回答进行四维度评分（结构/具体度/亮点/时间）含逐段反馈 | `question*`, `answer*`, `mode?`, `context?` |

**评分维度**（`score_interview_answer` 输出结构）：
- `structure` — 结构完整度（STAR 法则覆盖度）
- `specificity` — 具体程度（量化数据、具体案例）
- `highlight` — 亮点突出（差异化展示）
- `timing` — 时间控制（预估回答时长合理性）

**面试模式**（`mode` 参数）：
- `behavioral` — 行为面试（大部分外企）
- `technical` — 技术/专业面试
- `case-study` — 案例分析（咨询类）
- `culture` — 文化匹配
- `project-review` — 项目复盘（字节/腾讯/阿里等大厂核心模式）
- `stability` — 稳定性面试（国企/央企）
- `founder` — 创始人面试（初创公司）
- `structured-sme` — 中小企业结构化面试

### 2.4 MCP Shims (5 个 — 代理到外部服务)

| # | 工具名 | 中文名 | 描述 | 后端来源 | 关键参数 |
|---|--------|--------|------|----------|----------|
| 31 | `web_search` | 网络搜索 | AI 知识库 + 维基百科并行搜索，覆盖公司信息、薪资行情、政策法规 | `/api/agent/search` + Wikipedia API | `query*` |
| 32 | `get_weather` | 天气查询 | 查询城市天气（wttr.in，无需 API key），用于面试出行准备 | wttr.in | `city*` |
| 33 | `search_place` | 地点搜索 | 搜索地点/公司地址位置信息 | DuckDuckGo API | `keyword*`, `city?` |
| 34 | `get_directions` | 路线规划 | 查询通勤/出行路线，支持驾车/公交/步行三种方式 | DuckDuckGo API | `origin*`, `destination*`, `mode?` |
| 35 | `search_jobs` | 搜索职位 | 搜索职位信息（Boss 直聘/拉勾/猎聘等平台聚合） | DuckDuckGo API | `keyword*`, `city?` |

---

## 3. MCP 工具集成

### 3.1 架构设计

MCP (Model Context Protocol) 工具采用 **browser-compatible shim** 模式：前端代理调用，后端执行。

```
┌──────────────────────────────────────────────────┐
│                    浏览器                          │
│  ┌──────────┐  ┌──────────┐  ┌───────────────┐   │
│  │web_search│  │baidu-map │  │  job-search   │   │
│  │  .ts     │  │  .ts     │  │    .ts        │   │
│  └────┬─────┘  └────┬─────┘  └──────┬────────┘   │
│       │             │               │             │
│       └─────────────┼───────────────┘             │
│                     │ fetch()                      │
│                     ▼                              │
│           ┌─────────────────┐                     │
│           │ /api/agent/mcp/ │ (预留)               │
│           │     call        │                     │
│           └────────┬────────┘                     │
└────────────────────┼──────────────────────────────┘
                     │
              ┌──────▼──────┐
              │  后端 MCP    │
              │   Server     │
              └─────────────┘

实际实现（当前阶段）：
  - web_search  → 直调 Wikipedia API + /api/agent/search (AI知识库)
  - baidu-map   → wttr.in (天气) + DuckDuckGo (地点/路线)
  - job-search  → DuckDuckGo API
```

### 3.2 共享工具桥接

`src/lib/agent/tools/mcp/shared.ts` 提供统一的 MCP 调用桥梁：

```typescript
export async function callMCPTool(
  server: string,  // MCP server 名称
  tool: string,    // 工具名称
  params: Record<string, unknown>,
): Promise<ToolResult> {
  const res = await fetch("/api/agent/mcp/call", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ server, tool, params }),
  });
  // ...
}
```

这个桥梁设计允许未来无缝接入真正的 MCP Server（如百度地图 MCP、Boss 直聘 MCP 等），当前阶段用免费 API 作为 fallback 实现。

### 3.3 web_search 双重搜索策略

```
web_search(query)
    │
    ├──→ /api/agent/search?q=query (AI 知识库，20s 超时)
    │     └─ LLM 驱动的语义搜索，结果更丰富
    │
    └──→ Wikipedia API (中/英文，8s 超时)
          ├─ zh.wikipedia.org → 中文结果优先
          └─ en.wikipedia.org → 英文 fallback
          └─ 按关键词相关性过滤，去除 HTML 标签

  合并: AI知识库结果 + 【维基百科】标注结果
  截断: formatResult 限制 1200 字符
```

### 3.4 baidu-map 工具组

| 工具 | 数据源 | 用途场景 |
|------|--------|----------|
| `get_weather` | wttr.in (免费, 实时) | 面试当天天气、出行准备 |
| `search_place` | DuckDuckGo Instant Answer | 查公司地址、办公园区位置 |
| `get_directions` | DuckDuckGo Instant Answer | 通勤路线规划（驾车/公交/步行） |

---

## 4. 工具注入 Agent 机制

### 4.1 populateAgentTools 流程

`src/lib/agent/tools/index.ts` 中的 `populateAgentTools()` 负责将工具注入到各 Agent：

```
populateAgentTools(agents)
  for each agent:
    if agent.tools.length > 0:
      skip  // 已经手动注入过 (如 interview-agent 直接引用 INTERVIEW_TOOLS)
    names = agent.toolNames.length > 0
      ? agent.toolNames           // 使用白名单
      : registry.getAll().map(t => t.name)  // 全部工具 (general-agent)
    agent.tools = names
      .map(n => registry.get(n))
      .filter(Boolean)            // 过滤未注册的名称
```

### 4.2 各 Agent 工具白名单

| Agent | 工具数量 | 白名单 |
|-------|---------|--------|
| **general** (通用助手) | 35 (全部) | `toolNames: []` — 空数组 = 全部工具 |
| **evaluate** (JD 评估) | 10 | `evaluate_jd`, `evaluate_jd_full`, `fetch_jd_content`, `web_search`, `analyze_jd_risks`, `decode_black_market_terms`, `get_report_detail`, `export_file`, `download_report_pdf`, `get_profile` |
| **interview** (面试教练) | 4 | `generate_interview_questions`, `score_interview_answer`, `start_interview_session`, `prepare_interview_full` |
| **profile** (求职画像) | 7 | `get_profile`, `get_recommendations`, `get_profile_insights`, `self_positioning`, `check_pipeline_health`, `get_recent_activity`, `mine_profile` |
| **resume** (简历优化) | 9 | `read_file`, `import_resume`, `generate_cv`, `evaluate_jd`, `export_file`, `get_reference_detail`, `optimize_resume_section`, `save_resume_section`, `check_ats_compatibility` |

### 4.3 白名单强制执行

在 `ToolRegistry.execute()` 中，每次工具调用前都会检查：

```
execute(name, params):
  if activeAgentTools is set AND name NOT in activeAgentTools:
    return { success: false, error: "工具 {name} 在当前 Agent 模式下不可用" }
  // 继续执行...
```

`setActiveAgentTools()` 和 `clearActiveAgentTools()` 由 Agent 路由层在切换 Agent 时调用，确保当前活跃 Agent 只能使用其授权工具。

### 4.4 工具列表文本生成

两个关键函数用于生成 LLM 可见的工具描述：

| 函数 | 用途 | 调用位置 |
|------|------|----------|
| `registry.buildToolListText()` | 生成全部工具的文本列表 | 通用场景 |
| `buildToolListForAgent(toolNames)` | 只列出指定工具名对应的工具 | Agent 的 `buildSystemPrompt` 中 |

格式示例：
```
## 可用工具

- evaluate_jd: 评估职位描述（JD）... (jdText?: ..., jdUrl?: ..., images?: ..., language?: ...)
- fetch_jd_content: 通过 URL 获取 JD 的完整文本内容 (url: ...)
```

---

## 5. 工具执行流水线

### 5.1 完整执行周期

```
用户消息
  │
  ▼
classifyIntent(content)
  │  匹配 Agent intentPatterns + priority 排序
  ▼
setActiveAgentTools(agent.toolNames)
  │  设置白名单到 registry
  ▼
agent.buildSystemPrompt(ctx)
  │  注入 Career DNA + 知识 + 工具列表
  ▼
LLM 推理 → 决定调用哪个工具
  │
  ▼
registry.execute(toolName, params)
  ├── [1] Whitelist gate: 检查工具是否在白名单内
  │     └─ 拒绝 → { success: false, error: "在当前 Agent 模式下不可用" }
  ├── [2] 查找 tool definition
  │     └─ 未找到 → { success: false, error: "Unknown tool: {name}" }
  ├── [3] 调用 tool.handler(params)
  │     ├─ 成功 → { success: true, data: ... }
  │     └─ 异常 → { success: false, error: err.message }
  │           └─ recoverable + retryHint (部分工具提供)
  └── [4] 返回 ToolResult
  │
  ▼
registry.formatResult(result, toolName)
  │  调用工具的 formatResult 生成 LLM 可读文本
  ▼
追加到 LLM 上下文 → LLM 继续推理
  │  (可能继续调用工具，或输出最终回复)
  ▼
用户看到回复
```

### 5.2 handler 实现模式

所有 handler 遵循统一模式，可分为三类：

**模式 A — API 代理型**（最常见）
```
handler(params):
  参数校验 (长度/格式检查)
  → fetch("/api/xxx", { method: "POST", body: JSON.stringify(params) })
  → 检查 HTTP 状态
  → 解析 JSON
  → 返回 { success, data, error }
  → catch → { success: false, error: "..." }
```

**模式 B — 浏览器本地型**
```
handler(params):
  → 创建 Blob → URL.createObjectURL → <a>.click() (export_file)
  → localStorage 读写 + SQLite API 同步 (optimize/save_resume_section)
```

**模式 C — SOP 状态机型**
```
handler(params):
  action = params.action
  ├─ "start" → initSOP() → 返回阶段引导语
  ├─ "answer" → advanceStage() → 推进 SOP  → 返回下一阶段
  ├─ "complete" → 写入 SQLite → clearSOP()
  └─ "reset" → clearSOP()
```

### 5.3 错误分类与自愈机制

工具通过 `errorCategory` 字段（必填）告知 Agent Loop 如何处理失败：

```
errorCategory: "ok"              → 成功，继续
errorCategory: "transient"       → 临时失败（网络超时等），自动重试最多 2 次
errorCategory: "permanent"       → 永久失败（数据不存在/编码错误），不重试，触发 forceTextOnly
errorCategory: "need_user_input" → 需要用户输入，降级给用户
```

未显式设置 errorCategory 时，resolveErrorCategory 提供 fallback：`success=true → "ok"`，`success=false → "permanent"`。

**permanent 错误后的 forceTextOnly 机制**：工具返回 permanent 错误 → Agent Loop 设置 `forceTextOnly = true` → 下一轮 LLM 只能输出文本回复，所有 tool calls 被代码级忽略。不再依赖文本指令"请"LLM 停止。

**工具错误自描述**：permanent 错误消息包含可用资源列表，LLM 能从错误中自我纠正。例如 `read_file(path="")` 返回 `"请提供路径。可用: read_file('我的简历'), 参考简历: #1 张雯茜"`。

### 5.4 formatResult — LLM 输出格式化（迁移中）

每个工具都有 `formatResult` 函数，将结构化 `ToolResult` 转化为 LLM 可理解的自然语言文本。**正在迁移到三管道架构**：新工具优先使用 `llmSummary` 字段，`formatResult` 作为未迁移工具的 fallback。

- **失败时**：返回 `{操作名}失败: {error}`，让 LLM 知道发生了什么
- **成功时**：根据 data 结构生成结构化输出（Markdown 表格、列表、带 emoji 的摘要）
- **截断控制**：LLM 上下文截断由 `toolCtxCap` 控制（默认 800，文档类 4000），UI 渲染由 `uiPayload` 驱动

---

## 6. 工具展示名称系统

`src/lib/agent/tool-display-names.ts` 维护工具名到中文展示标签的映射，用于前端 UI 显示。

### 6.1 ToolDisplay 数据结构

```
ToolDisplay {
  label: string;   // 中文显示名称，如 "评估 JD"
  emoji: string;   // 图标 emoji，如 "🔍"
}
```

### 6.2 完整映射表

**Query 工具**：

| 工具名 | 中文标签 | emoji |
|--------|----------|-------|
| `search_applications` | 搜索投递记录 | 📋 |
| `get_report_detail` | 查看评估报告 | 📊 |
| `get_profile` | 读取求职画像 | 👤 |
| `get_recent_activity` | 近期活动 | 🕐 |
| `get_recommendations` | 岗位推荐 | 💼 |
| `get_pipeline_status` | Pipeline 状态 | 📡 |
| `decode_black_market_terms` | 黑话解码 | 🔓 |
| `check_pipeline_health` | 管道健康检查 | 📋 |
| `get_profile_insights` | 画像洞察 | 📊 |
| `detect_skill_gaps` | 技能缺口分析 | 🔍 |
| `check_ats_compatibility` | ATS 兼容检查 | 🤖 |
| `generate_interview_questions` | 生成面试题 | 📝 |
| `score_interview_answer` | 评分面试回答 | ⭐ |

**Action 工具**：

| 工具名 | 中文标签 | emoji |
|--------|----------|-------|
| `evaluate_jd` | 评估 JD | 🔍 |
| `evaluate_offer` | 评估 Offer | 💰 |
| `generate_cv` | 生成简历 | 📄 |
| `scan_portals` | 扫描招聘网站 | 🔎 |
| `check_health` | 健康检查 | 🩺 |
| `fetch_jd_content` | 获取 JD 内容 | 📥 |
| `export_file` | 导出文件 | 📦 |
| `import_resume` | 导入简历 | 📥 |
| `mine_profile` | 挖掘画像 | ⛏️ |
| `evaluate_jd_full` | JD 完整评估 | 🛡️ |
| `analyze_jd_risks` | JD 风险扫描 | ⚠️ |
| `self_positioning` | 自我定位引导 | 🧭 |
| `prepare_interview_full` | 面试全案准备 | 🎯 |
| `compare_offers_deep` | Offer 深度对比 | ⚖️ |
| `optimize_resume_section` | 简历优化 | ✏️ |
| `save_resume_section` | 保存到简历 | 💾 |
| `start_interview_session` | 启动模拟面试 | 🎙️ |

**MCP 工具**：

| 工具名 | 中文标签 | emoji |
|--------|----------|-------|
| `web_search` | 网络搜索 | 🌐 |
| `get_weather` | 天气查询 | 🌤️ |
| `search_place` | 地点搜索 | 📍 |
| `get_directions` | 路线规划 | 🗺️ |
| `search_jobs` | 搜索职位 | 🔎 |

### 6.3 解析逻辑

```
getToolDisplay(toolName):
  entry = TOOL_DISPLAY[toolName]
  if entry: return entry
  else: return { label: toolName, emoji: "🔧" }  // fallback：用原始工具名 + 扳手图标
```

### 6.4 使用场景

`getToolDisplay` 被以下 UI 组件消费：
- **`ToolResultCard`** — 工具调用结果卡片，显示 emoji + 中文标签 + 格式化结果
- **`ExecutingIndicator`** — 工具执行中指示器，显示 "🔍 正在评估 JD..." 动画

---

## 7. 工具分类与覆盖域

```
求职全流程覆盖：

  定位探索          JD 评估           简历准备          面试准备
  ─────────        ─────────         ─────────         ─────────
  self_positioning  evaluate_jd       generate_cv       prepare_interview_full
  mine_profile      evaluate_jd_full  import_resume     generate_interview_questions
  get_profile       fetch_jd_content  optimize_resume   score_interview_answer
  get_profile_insights analyze_jd_risks save_resume     start_interview_session
  get_recommendations decode_terms    check_ats         scan_portals

  Offer 决策         投递追踪          外部信息          文件操作
  ─────────          ─────────         ─────────         ─────────
  evaluate_offer     search_apps       web_search        export_file
  compare_offers     get_recent_act    get_weather
  get_pipeline       check_health      search_place
  check_pipeline     get_report        get_directions
                                        search_jobs
```

---

## 8. 设计原则总结

1. **统一的 ToolDefinition 接口** — 所有工具从注册、执行到格式化走同一管道，新增工具只需实现该接口
2. **白名单隔离** — 每个 Agent 只能调用授权的工具子集，防止越权操作（如面试 Agent 不能写简历）
3. **错误自愈** — `recoverable` + `retryHint` 让 LLM 能自行判断是否重试以及如何修正参数
4. **SOP 状态机** — `mine_profile` 用 action-based 状态机管理多轮对话流程，状态持久化在内存
5. **MCP shim 模式** — 前端工具代理到外部服务，预留 `/api/agent/mcp/call` 桥梁供后续接入真正 MCP Server
6. **展示层解耦** — `tool-display-names.ts` 将工具名映射为中文标签 + emoji，UI 层不硬编码
7. **格式化独立** — 每个工具自带 `formatResult`，将结构化数据转换为 LLM 友好文本，输出质量由工具自身保证
