# 08 — Agent 互通机制

> 所属阶段：Phase 2 · 2026-05-09 初始实施 · 后续多次增强

---

## 1. 问题

筝筝纸鸢有两套 Agent 系统共享 SQLite 但不共享上下文：

| | Claude Agent | Next.js Agent |
|--|-------------|---------------|
| **做什么** | JD评估、风险检测、报表生成 | 聊天对话、面试教练、快速评估 |
| **数据写入** | `db-write.mjs` → SQLite | SQLite（通过 `server-db.ts` 及 API routes） |
| **上下文** | 全量：cv + profile + modes + risk-intel | CareerDNA + 3 层记忆 + AgentKnowledge + Preferences |
| **知道彼此吗** | ❌ 不知道 Next.js Agent 的对话 | ❌ 不知道 Claude Agent 的评估 |

问题场景：用户在 `/agent` 页面问"我上次评估的那个岗位怎么样"，Next.js Agent 不知道"上次"是哪个——Claude Agent 尽管 30 秒前刚写入 SQLite。

---

## 2. 互通体系全景

Claude Activity Bridge 是**互通体系中最早建立的通道**，但不是唯一的。当前互通体系包含四个层次：

```
Layer 4: Agent Preference System (/api/agent/prefs)
    → Agent 行为的学习与衰减模型 — 跨会话、跨 Agent

Layer 3: 3-Layer Memory Coordinator (memory/coordinator.ts)
    → Working + Episodic + Semantic — 跨会话上下文保持

Layer 2: Server-side Agent Loop (direct DB access)
    → /api/agent/run 直接读写 SQLite — 绕过 HTTP bridge

Layer 1: Claude Activity Bridge (/api/agent/claude-activity)
    → HTTP 查询桥接 — 让 Next.js Agent 感知 Claude Agent 产出
```

---

## 3. Layer 1 — Claude Activity Bridge（原始方案）

```
Claude Agent (评估)
    → db-write.mjs
    → SQLite applications + reports 表
    → /api/agent/claude-activity (服务端 route)
    → getClaudeAgentActivity() (客户端 fetch)
    → orchestrator 注入 AgentPromptContext
    → 所有 Next.js Agent 的 buildSystemPrompt 自动获得
```

### 注入内容（< 500 字符）

```
[Claude Agent 最近活动]
最近评估:
• 字节跳动 | AI产品经理 | 4.2/5 🔴高风险 | 2026-05-09
• 美团 | AI运营 | 3.8/5 🟢低风险 | 2026-05-08
管道状态: 2条待投递 | 1条进行中
```

### 实现（4 处改动）

| 文件 | 改动 | 行数 |
|------|------|------|
| `AgentPromptContext` (types.ts) | +`claudeAgentActivity?: string` | +1 |
| `shared-memory.ts` | +`getClaudeAgentActivity()` → fetch API | +7 |
| `orchestrator/index.ts` | import + Promise.all + 注入到 promptCtx | +2 |
| `/api/agent/claude-activity/route.ts` | 新文件：SQLite 查询 + 格式化 | +42 |

### 数据查询

```sql
-- 最近 5 条有效评估
SELECT company, role, score, status, date, notes
FROM applications
WHERE status NOT IN ('SKIP', 'Discarded')
ORDER BY num DESC LIMIT 5

-- 管道状态
SELECT status, COUNT(*) FROM applications GROUP BY status
```

### 安全设计

- API route 在服务端运行，`better-sqlite3` 不暴露给客户端
- SQLite readonly 模式打开
- 任何异常 → 返回空字符串 → Agent 正常运行（不崩溃）
- `busy_timeout = 3000` 防止读阻塞

---

## 4. Layer 2 — 服务端 Agent Loop 直接 DB 访问

`/api/agent/run`（`server-runner.ts`）运行在服务端，**直接通过 `server-db.ts` 访问 SQLite**，不再需要 HTTP bridge 做数据搬运：

- 工具执行 (`registry.execute()`) 直接通过 `better-sqlite3` 读写数据库
- 避免了"Claude → db-write.mjs → SQLite → HTTP route → fetch → Agent" 的冗长链条
- Claude Agent 写入后，服务端 loop 在同一个进程中即刻可读
- 延迟从 HTTP round-trip 压缩到 0（进程内）

**与 Layer 1 的分工**：
- Layer 1 仍为**客户端 loop**（`/api/agent/think`）提供 Claude 活动感知
- Layer 2 用于**服务端 loop**（`/api/agent/run`），天然具备直接访问能力

---

## 5. Layer 3 — 三层记忆协调器（`memory/coordinator.ts`）

这是**跨会话、跨 Agent 上下文保持的主要机制**，详见 [06-前端架构设计](./06-前端架构设计.md) 第 5 节。

```
memory/coordinator.ts → buildContext(sessionId, messages)
    │
    ├── Layer 1: Working Memory (working.ts)
    │   └── 最近 10 轮对话直接截断
    │
    ├── Layer 2: Episodic Memory (episodic.ts)
    │   └── 15+ 轮之后自动摘要早轮对话 → session_memory 表
    │
    └── Layer 3: Semantic Memory (semantic.ts)
        └── 跨会话事实提取 → session_memory 表
```

### 跨 Agent 上下文 API

```
/api/agent/context/
    → 写入 session_memory 表 (summary_type='context')
    → Claude Agent 或其他外部 Agent 注入上下文片段
    → memory/coordinator.ts 构建 context 时自动包含

/api/agent/feedback/
    → 用户对 Agent 响应的反馈（赞/踩/纠正）
    → 写入 session_memory / agent_preferences
    → 用于未来提示优化和偏好调整
```

---

## 6. Layer 4 — Agent 偏好系统（`/api/agent/prefs`）

Agent 行为的学习与衰减模型：

```
用户操作
    → /api/agent/prefs (POST/PUT)
    → agent_preferences 表 (entity_type, entity_key, weight, decay_rate)
    → orchestrator 构建 prompt 时查询偏好权重
    → 按 decay_rate 衰减，按使用频率加权的个性化 Agent 行为
```

**偏好类型示例**：
- `style:concise` — 用户偏好简洁回答
- `style:detailed` — 用户偏好详细解释
- `target:remote_only` — 只看远程岗位
- `target:salary_min_30k` — 最低薪资阈值
- `avoid:agency` — 屏蔽外包/猎头

---

## 7. 效果

面试教练 Agent 拿到完整上下文后的能力：

```
用户: "我上次面的那个公司准备下"

Agent (有互通):
"你最近评估了字节跳动 AI产品经理 4.2/5 🔴高风险。
JD 显示有'亲自带'和'弹性工作制'的加班信号。
建议准备：1. 追问工作安排的提问话术 2. AI产品case展示..."

Agent (带 3 层记忆):
"另外，根据你之前的对话记录，你更关注工作生活平衡。
这在面试中可以通过询问团队最近加班频率来委婉了解。
我注意到你偏好 concis 风格，直接给要点：..."
```

vs 无互通：Agent 只能回复"请告诉我你要面试哪家公司？"
