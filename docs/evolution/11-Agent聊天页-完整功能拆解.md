# 11 — Agent 聊天页完整功能拆解

> 页面: `frontend/src/app/agent/page.tsx` (870 行) | Agent 系统: `lib/agent/` 目录

---

## 功能清单

| # | 功能 | 实现 | 数据源 |
|---|------|------|--------|
| 1 | 意图分类路由 | `classifyIntent()` 正则匹配 → 5 个 Agent | 用户输入 |
| 2 | 多 Agent 对话 | 面试教练/评估/画像/简历/通用 5 角色 | DeepSeek API (SSE) |
| 3 | 流式响应 | `agentLoopClient` SSE events | `/api/agent/chat` |
| 4 | 会话管理 | 创建/列表/切换/删除/恢复/Pin | IndexedDB `sessions` 表 |
| 5 | 会话记忆摘要 | `generateMemoryDigest()` (≥5条消息触发) | IndexedDB |
| 6 | Tool Call 日志 | `ToolCallLog` 组件 | Agent 工具调用输出 |
| 7 | Claude 活动上下文 | `getClaudeAgentActivity()` | `/api/agent/claude-activity` → SQLite |
| 8 | Agent 选择切换 | `AgentSelector` 组件 | 5 个 Agent + 自动路由 |
| 9 | 建议快捷词 | `SuggestionChips` 组件 | 预设快捷提问 |
| 10 | 探索→Agent 数据迁移 | `migrateExploreToAgent()` | IndexedDB |

---

## 功能拆解

### 1. 意图分类路由

```typescript
// orchestrator/index.ts
const agent = classifyIntent(content);
// 5 个 Agent 按 priority 排序 (10 > 1)
// 匹配规则: agent.intentPatterns (RegExp[])
// 无匹配 → general agent (priority=1, 兜底)
```

| Agent | ID | Priority | 触发词示例 |
|-------|-----|----------|-----------|
| 面试教练 | `interview` | 10 | "面试"/"模拟面试"/"准备面试" |
| JD 评估 | `evaluate` | 10 | "评估"/"分析JD"/"这个岗位" |
| 求职画像 | `profile` | 10 | "定位"/"方向"/"我适合" |
| 简历 Agent | `resume` | 8 | "简历"/"CV"/"修改简历" |
| 通用助手 | `general` | 1 | 兜底 |

### 2. 上下文组装

```typescript
// orchestrator/index.ts
const [careerDNA, agentKnowledge, claudeAgentActivity] = await Promise.all([
  getCareerDNASummary(),      // IndexedDB: 技能/目标/薪资/底线
  getKnowledgeForAgent(...),  // 领域知识: 薪资基准/面试风格
  getClaudeAgentActivity(),   // Claude 最近 5 条评估
]);

const promptCtx: AgentPromptContext = {
  careerDNA,           // "目标岗位: AI产品经理\n薪资期望: 25-40K..."
  memoryDigest,        // 会话摘要 (≥5条用户消息时生成)
  currentMessages,     // 当前对话历史
  agentKnowledge,      // Agent 特定知识
  claudeAgentActivity, // Claude 最近活动
};
```

`buildSystemPrompt(promptCtx)` → 拼接最终 system prompt → 发给 DeepSeek。

---

### 4. 会话管理

**数据模型** (IndexedDB `sessions` 表)：

```typescript
interface ChatSession {
  id?: number;
  title: string;          // 自动生成: 首条用户消息前20字
  createdAt: string;
  updatedAt: string;
  isPinned: boolean;      // 置顶
  isDeleted: boolean;     // 软删除 (可恢复)
  messageCount: number;
}
```

**操作**：
| 操作 | 函数 | 说明 |
|------|------|------|
| 创建 | `createSession()` | 自动生成标题 |
| 列表 | `listSessions()` | 按更新时间倒序 |
| 切换 | `getSession(id)` | 加载历史消息 |
| 删除 | `softDeleteSession(id)` | 软删除，可恢复 |
| 恢复 | `undoDeleteSession(id)` | 从软删除恢复 |
| 置顶 | `pinSession(id, bool)` | 固定到顶部 |
| 默认 | `ensureDefaultSession()` | 首次访问自动创建 |

**UI 状态**：
- 空状态：欢迎消息 + 建议快捷词
- 有会话：SessionList 侧边栏 (置顶 → 最近 → 已删除切换)

---

### 6. Tool Call 日志

Agent 在执行过程中调用工具（搜索、查询SQLite、计算等），`agentLoopClient` 捕获每次工具调用：

```
用户: "帮我分析字节跳动 AI PM 岗位"
    ↓
Agent: <<TOOL>> search_web "字节跳动 AI产品经理 薪资 2026"
    ↓ (显示在 ToolCallLog: "🔍 搜索: 字节跳动 AI产品经理 薪资 2026")
Agent: <<TOOL>> db_query "SELECT * FROM applications WHERE company=字节跳动"
    ↓ (显示在 ToolCallLog: "📊 查询数据库: applications")
Agent: "根据搜索结果，字节跳动AI产品经理的薪资范围是..."
```

ToolCallLog 组件实时展示工具调用链，让用户看到 Agent 的"思考过程"。

---

### 7. Claude 活动上下文

详见 [08-Agent互通机制](./08-Agent互通机制.md)

注入时机：每次对话开始前，`orchestrator` 自动调用 `getClaudeAgentActivity()`。
注入内容：最近 5 条评估 + 管道状态摘要。

---

### 10. 探索→Agent 数据迁移

`migrateExploreToAgent()` 将旧的 `/explore` 页面数据迁移到新的 Agent 系统：
- 复制用户偏好设置
- 迁移历史对话记录
- 保留技能标签和目标
