## Context

当前系统有 30+ 工具注册在 `ToolRegistry`，每个工具通过 `ToolResult` 返回结果。但 `ToolResult` 只有 `success: boolean` + `recoverable?: boolean`——LLM 无法区分"网络超时该重试"和"文件编码错误该告诉用户"。同时 agent 无原生文件读取工具，只能用 Claude Code 的 Read 工具直接读文件全文灌入上下文。

参考模式(直接应用):
- **OpenAI Assistants API**: `run.status` 用 `completed`/`requires_action`/`failed`/`cancelled` 四态，每个状态触发不同的客户端行为
- **Cursor Agent**: 原生 `read_file` 按语义路径路由(符号→索引,文件→磁盘,数据库→API),始终控制返回大小
- **LangChain**: `ToolException` 子类化,框架层自动处理重试/降级/用户介入

## Goals / Non-Goals

**Goals:**
- ToolResult 自带错误分类，LLM 和 Loop 引擎不用猜
- 原生 read_file 工具替换 Claude Code Read,控制上下文不爆炸
- 系统 prompt 教会 LLM 何时重试、何时告诉用户
- 向后兼容:旧工具不填 errorCategory 默认 `ok`

**Non-Goals:**
- 不改造所有 30+ 工具的 handler(逐个改是后续渐进工作)
- 不做 iconv/jschardet 编码自动修复
- 不改变 maxIterations

## Decisions

### Decision 1: errorCategory 四态(参考 OpenAI Assistants API)

```typescript
type ErrorCategory = "ok" | "transient" | "permanent" | "need_user_input";
```

| 状态 | 含义 | Loop 行为 | LLM 行为 |
|------|------|-----------|---------|
| ok | 成功 | 继续 | 分析回答 |
| transient | 临时故障(网络/限流) | autoRetry+1 | 换参数重试 |
| permanent | 永久故障(编码/权限) | degradeToUser | 告知用户 |
| need_user_input | 需用户信息 | degradeToUser | 询问用户 |

淘汰 `recoverable?: boolean`(保留兼容但不再作为主要判断依据)。

### Decision 2: read_file 智能路由(参考 Cursor Agent)

Cursor 的 `read_file` 不直接读磁盘——它按路径模式路由:
- `符号名` → 索引查询
- `文件路径` → 磁盘读取(带 caps)
- `数据库资源` → API 查询

我们的实现:
```
read_file(path)
  ├─ path 匹配 "参考简历/*" → fetch /api/cv/references/{id}
  ├─ path 匹配 "我的简历" → fetch /api/data/profile (返回摘要)
  ├─ path 匹配 "*.md" / "*.yml" → fetch /api/agent/read-file?path=...
  │   └─ 服务端: 文件存在检查 → 读取 → isGarbledText → 截断到2000字
  └─ 其他 → /api/agent/read-file 统一处理
```

返回值始终包含:
```typescript
{
  content: string,       // 截断后的文本(≤2000字)
  truncated: boolean,    // 是否被截断
  source: "db" | "fs" | "profile",  // 来源
  errorCategory: ErrorCategory
}
```

### Decision 3: 服务端 /api/agent/read-file(安全边界)

文件读取必须在服务端执行(浏览器无 fs 权限):
1. 白名单校验:只能读项目根目录下的 `.md`/`.yml`/`.json`/`.txt` 文件
2. 乱码检测:读完后跑 `isGarbledText()`,乱码→errorCategory=permanent
3. 强制截断:成功读取后截断到 2000 字符
4. 文件不存在→errorCategory=permanent

### Decision 4: Loop 引擎统一处理(淘汰 qualityHint)

当前 `client-runner.ts` 和 `server-runner.ts` 中的质量检查逻辑:
```typescript
// Before: 分散的 if-else + qualityHint 字符串拼接
if (!toolResult.success) { qualityHint = "..."; autoRetryCount++; }
else if (quality === "empty") { ... }
else if (quality === "garbled") { ... }

// After: 基于 errorCategory 的统一调度
const action = ERROR_CATEGORY_ACTIONS[result.errorCategory ?? (result.success ? "ok" : "transient")];
if (action.degradeToUser) { /* 直接进入 responding */ }
if (action.autoRetry) { autoRetryCount++; }
```

`ERROR_CATEGORY_ACTIONS` 表驱动,不再拼接 HTML 注释 hint。

## Risks / Trade-offs

- **旧工具未填 errorCategory** → 默认值:success=true→ok, success=false→transient(保持旧行为的"可重试")
- **read_file 路由误判** → 未识别路径走 `/api/agent/read-file` 通用处理,不会丢数据
- **服务端白名单限制** → 只允许项目根下特定扩展名,防路径遍历攻击

## Migration Plan

1. 部署后旧工具无需改动(errorCategory 默认值保持兼容)
2. 新增工具必须填写 errorCategory
3. 逐步迁移高频工具(evaluate_jd, web_search 等)显式标注 errorCategory
