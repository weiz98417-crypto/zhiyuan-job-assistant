## Context

两个前端系统各有独立的实现质量问题：

1. **Go TUI 仪表盘** (`dashboard/internal/data/career.go:545-583`)：`UpdateApplicationStatus` 用大小写不敏感的字符串替换更新 Markdown 表格行。如果状态词出现在公司名或备注中（如 "Applied Materials" 公司），会把公司名中的 "Applied" 替换为新状态。没有文件锁，与 Claude Agent 并发写入 `applications.md` 会损坏数据。

2. **Next.js Web 前端** (`frontend/src/app/agent/page.tsx` 34,055 行, `analytics/page.tsx` 25,024 行)：单文件巨型组件，业务逻辑、状态管理、UI 渲染、API 调用全部混在一个文件中。

`unify-data-layer` change 已经将 Agent 写入切换到 SQLite。此 change 将前端读取也切换到 SQLite，并修复组件结构。

## Goals / Non-Goals

**Goals:**
- Go TUI 的数据读写从 `applications.md` 切换到 SQLite
- Go TUI 的状态更新走 SQLite API，消除字符串替换的误伤风险
- Next.js agent page 和 analytics page 拆分为可维护的组件目录

**Non-Goals:**
- 不重写 Go TUI 的 TUI 框架或主题系统
- 不改变 Next.js 的路由结构或 API 设计
- 不在此 change 中落地 DESIGN.md 的设计系统（属于后续 `/design-review`）

## Decisions

### Decision 1: Go TUI 通过 SQLite 驱动直接读写

**选择：** Go TUI 使用 `github.com/mattn/go-sqlite3`（纯 Go 的 SQLite driver，CGO 可选）直接读写 `data/zhiyuan.db`，不再解析 `applications.md`。

**替代方案：**
- *通过 Next.js API*：被拒绝——Go TUI 是独立进程，不应依赖 Next.js 运行。
- *保持 Markdown 解析 + 加列级替换*：被拒绝——SQLite 已经是规范存储，继续维护 Markdown 解析器是技术债务。

### Decision 2: Next.js 组件拆分策略

**选择：** 按功能边界拆分，每个组件 < 500 行。

`agent/` 拆分：
```
agent/
├── page.tsx              # 页面入口（<100行）：路由、layout
├── _components/
│   ├── ChatPanel.tsx      # 聊天消息列表 + 滚动
│   ├── ChatInput.tsx      # 输入框 + 发送
│   ├── ToolCallLog.tsx    # 工具调用日志面板
│   ├── AgentSelector.tsx  # Agent 切换下拉
│   ├── SessionMemory.tsx  # 会话记忆侧边栏
│   └── useAgentChat.ts    # 聊天状态管理 hook
```

`analytics/` 拆分：
```
analytics/
├── page.tsx               # 页面入口（<100行）
├── _components/
│   ├── ScoreDistribution.tsx  # 分数分布图
│   ├── FunnelChart.tsx        # 漏斗图（评估→投递→面试→offer）
│   ├── WeeklyActivity.tsx     # 周活跃趋势
│   ├── ConversionRate.tsx     # 转化率指标卡
│   └── StatusBreakdown.tsx    # 状态分布饼图
```

## Risks / Trade-offs

1. **[R] go-sqlite3 的 CGO 依赖** → 在 Windows 上编译可能需要 GCC。
   → **缓解:** 使用 `modernc.org/sqlite`（纯 Go 实现，无 CGO），或使用现有的 `mattn/go-sqlite3` + 预编译二进制。

2. **[R] 组件拆分引入回归** → 34K 行拆分为 6 个文件，可能遗漏某些交互逻辑。
   → **缓解:** 拆分时不做逻辑改动，纯提取。先拆 agent page（改动大），验证无回归后再拆 analytics。

## Migration Plan

1. Go TUI：添加 SQLite driver 依赖，修改 `career.go` 数据读取路径
2. Go TUI：重写 `UpdateApplicationStatus`，走 SQLite UPDATE
3. Go TUI：移除 `applications.md` 的写入逻辑（保留读取作为历史数据回退）
4. Next.js agent：逐个提取组件到 `_components/`，每个提取后验证编译通过
5. Next.js analytics：同上
6. 端到端测试：Agent 评估 → SQLite → Go TUI 显示 → Next.js 显示
