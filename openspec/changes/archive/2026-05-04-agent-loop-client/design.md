## Context

`agent-loop-infrastructure` 的 Agent Loop 在服务端跑，但 6 个 query 工具依赖浏览器 IndexedDB → 全挂。3 个 action 工具的 API 不存在 → 404。核心矛盾：loop 引擎的位置错了。

约束：(1) API key 不能暴露到浏览器，(2) DexieDB 只在浏览器可用，(3) DeepSeek API 无原生 function calling，(4) 保持现有 SSE 事件协议。

## Goals / Non-Goals

**Goals:**
- Agent Loop 在浏览器端执行 Think→Act→Observe 循环
- LLM 调用走 `/api/agent/think` 服务端代理（API key 安全）
- 6 个 DexieDB query 工具恢复可用
- 3 个无效 API 的 action 工具修复或移除
- 新增 `export_file` 工具支持浏览器下载
- 保持现有 SSE 事件格式不变

**Non-Goals:**
- 不做 exe/Electron 客户端
- 不引入 Web Worker（先做单线程）
- 不改 Loop 的核心算法（终止条件、Quality Gate 等）

## Decisions

### 1. 新架构

```
┌── 浏览器 ──────────────────────────────────────┐
│                                                  │
│  useAgentLoop()  hook                            │
│    │                                              │
│    ├─ Think ──→ POST /api/agent/think ──→ 服务端  │
│    │            { systemPrompt, messages }        │
│    │            ← SSE stream (text + phase)       │
│    │                                              │
│    ├─ Act  ──→ executeTool() 直接调               │
│    │            DexieDB ✓  fetch API ✓            │
│    │            export_file (浏览器下载) ✓         │
│    │                                              │
│    └─ Yield → SSE event → page.tsx 消费           │
│       (plan_created, task_started, ...)           │
│                                                  │
└──────────────────────────────────────────────────┘

┌── 服务端 ──────────────────────────────────────┐
│                                                  │
│  /api/agent/think  (新增)                        │
│    持有 DEEPSEEK_API_KEY                          │
│    转发请求到 DeepSeek，流式返回                  │
│                                                  │
│  /api/evaluate, /api/cv, ...  (不变)             │
│                                                  │
└──────────────────────────────────────────────────┘
```

**为什么不在 page.tsx 直接调 DeepSeek？** API key 会在浏览器暴露。走服务端代理，key 只存在于 `process.env`。

### 2. `/api/agent/think` 设计

```
POST /api/agent/think
Body: { systemPrompt: string, messages: {role, content}[] }
Response: SSE stream (纯 text 事件，不做工具解析)

服务端职责：
- 注入 systemPrompt + messages → DeepSeek
- 流式返回 text + phase 事件
- 不做 TOOL 解析，不做 loop 逻辑
```

**为什么服务端不做工具解析？** Loop 在客户端，服务端是哑管道——只负责调 LLM 并透传文本。

### 3. Agent Loop 客户端化

现有 `runner.ts` 的核心逻辑不变，但改成客户端版本：

```typescript
// 新: src/lib/agent/loop/useAgentLoop.ts (或 client-runner.ts)
async function* agentLoopClient(ctx) {
  // Think: POST /api/agent/think → 流式收集 LLM 文本
  // 解析 <<PLAN>> / <<TOOL>>
  // Act: 本地执行工具 (DexieDB + fetch)
  // Observe: 注入结果到上下文
  // 循环...
  // Yield SSE 事件
}
```

**与原有 runner.ts 的区别**：`callDeepSeekStream` 替换为 `fetch("/api/agent/think")`。

### 4. 工具修复

| 工具 | 问题 | 修复 |
|------|------|------|
| search_applications | isServerSide() | 移除检查，客户端 DexieDB |
| get_report_detail | isServerSide() | 同上 |
| get_profile | isServerSide() | 同上 |
| get_recent_activity | isServerSide() | 同上 |
| get_recommendations | isServerSide() | 同上 |
| get_pipeline_status | isServerSide() | 同上 |
| evaluate_offer | /api/evaluate-offer 404 | 改用 /api/evaluate (已有 JD 评估 API，也可以评估 offer) |
| generate_cv | /api/cv/generate 404 | 改为 /api/cv (已有) |
| scan_portals | /api/scan 404 | 改为 /api/scan/status (已有) |

### 5. export_file 工具

```typescript
// tools/action/export-file.ts
{
  name: "export_file",
  description: "导出内容为文件并触发浏览器下载",
  parameters: {
    content: { type: "string", required: true, description: "文件内容" },
    filename: { type: "string", required: true, description: "文件名（不含扩展名）" },
    format: { type: "string", required: false, description: "md / html / txt，默认 md" },
  },
  category: "action",
  handler: (params) => {
    const { content, filename, format = "md" } = params;
    const mime = format === "html" ? "text/html" : format === "txt" ? "text/plain" : "text/markdown";
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${filename}.${format}`;
    a.click();
    URL.revokeObjectURL(url);
    return { success: true, data: { filename: `${filename}.${format}` } };
  },
  formatResult: (r) => r.success ? `已下载: ${r.data.filename}` : "下载失败",
}
```

### 6. route.ts 变化

```
旧: POST /api/agent/chat
      ├─ explore → 直接 stream
      └─ execute → agentLoop() (服务端，工具系统)

新: POST /api/agent/think  (新增，LLM 代理)
    POST /api/agent/chat   (保留 explore 流，或后续废弃)
```

## Risks

- [延迟增加] 每个 think 轮次多一次浏览器→服务端 fetch → DeepSeek → 服务端→浏览器 → 缓解：DeepSeek 快 + SSE 流式，无明显感知延迟
- [Loop 状态管理] 客户端 loop 状态在 hook 里，组件卸载会丢失 → 缓解：DexieDB 持久化 loop 中间状态（可选，先不做）
