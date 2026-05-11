# 08 — Agent 互通机制

> 所属阶段：Phase 2 · 2026-05-09 实施 · 改动 ~40 行

---

## 1. 问题

筝筝纸鸢有两套 Agent 系统共享 SQLite 但不共享上下文：

| | Claude Agent | Next.js Agent |
|--|-------------|---------------|
| **做什么** | JD评估、风险检测、报表生成 | 聊天对话、面试教练、快速评估 |
| **数据写入** | `db-write.mjs` → SQLite | SQLite（通过 API） |
| **上下文** | 全量：cv + profile + modes + risk-intel | CareerDNA + SessionContext + AgentKnowledge |
| **知道彼此吗** | ❌ 不知道 Next.js Agent 的对话 | ❌ 不知道 Claude Agent 的评估 |

问题场景：用户在 `/agent` 页面问"我上次评估的那个岗位怎么样"，Next.js Agent 不知道"上次"是哪个——Claude Agent 尽管 30 秒前刚写入 SQLite。

---

## 2. 方案

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

---

## 3. 实现

### 三处改动

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

## 4. 效果

面试教练 Agent 拿到上下文后的能力：

```
用户: "我上次面的那个公司准备下"

Agent (有互通):
"你最近评估了字节跳动 AI产品经理 4.2/5 🔴高风险。
JD 显示有'亲自带'和'弹性工作制'的加班信号。
建议准备：1. 追问工作安排的提问话术 2. AI产品case展示..."
```

vs 无互通：Agent 只能回复"请告诉我你要面试哪家公司？"
