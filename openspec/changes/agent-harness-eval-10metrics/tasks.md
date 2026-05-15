## Phase 1: Eval Framework

- [x] 1.1 创建 `scripts/eval-agent.mjs` — 20 test cases + 10 metrics calculator
- [x] 1.2 Case 设计: 6 个场景 (参考简历查询/我的简历/文件读取/JD评估/搜索/闲聊)
- [x] 1.3 `--mock` 模式: mock LLM 返回 + 只测 harness 逻辑
- [x] 1.4 `--live` 模式: 真实 API 调用 + 收集 telemetry
- [x] 1.5 运行 mock 验证: `node scripts/eval-agent.mjs --mock`

## Phase 2: Harness 硬截断

- [x] 2.1 `client-runner.ts`: capToolCtx 改为硬截断，不追加提示
- [x] 2.2 `client-runner.ts`: contextBudget pushWithBudget 函数
- [x] 2.3 `server-runner.ts`: 同上对称修改

## Phase 3: matchHints + Prompt 精简

- [x] 3.1 `tools/types.ts`: ToolDefinition 加 matchHints 字段
- [x] 3.2 `tools/registry.ts`: buildToolListText 输出 matchHints
- [x] 3.3 `read_file` 工具加 matchHints
- [x] 3.4 `prompt.ts`: 核心 prompt 从 88 行砍到 25 行
- [x] 3.5 `resume-agent.ts`: 同步精简

## Phase 4: Telemetry + 白名单

- [x] 4.1 `client-runner.ts`: 每次迭代末尾 emit `type: "telemetry"` SSE 事件
- [x] 4.2 `registry.ts`: execute() 加工具名白名单校验 → 不存在返回 permanent
- [x] 4.3 eval 脚本接 telemetry 事件计算指标

## Phase 5: 对比验证

- [x] 5.1 `--live` 跑 baseline → 10 项指标初始值
- [x] 5.2 `--live` 跑改后 → 对比提升幅度
- [x] 5.3 编译通过 + 服务正常运行
