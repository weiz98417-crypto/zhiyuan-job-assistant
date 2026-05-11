## 1. /api/agent/think 代理端点

- [ ] 1.1 新建 `src/app/api/agent/think/route.ts` — POST 端点，接收 `{ systemPrompt, messages }`，转发到 DeepSeek，SSE 流式返回 text 事件
- [ ] 1.2 持有 DEEPSEEK_API_KEY，不做工具解析，不区分 mode
- [ ] 1.3 返回 phase 事件（thinking → responding）与 text 事件

## 2. Agent Loop 客户端化

- [x] 2.1 新建 `src/lib/agent/loop/client-runner.ts` — 客户端版 agentLoop async generator
- [x] 2.2 Think 阶段改为 `fetch("/api/agent/think", { method:"POST", body: { systemPrompt, messages } })` → SSE 流式收集文本
- [x] 2.3 Act 阶段保持 `executeTool()` 调用不变（已在客户端）
- [x] 2.4 Observe 保持工具结果注入上下文逻辑不变
- [x] 2.5 终止条件、Quality Gate 逻辑直接复用服务端 runner.ts 的代码

## 3. 工具修复

- [x] 3.1 移除 6 个 query 工具的 `isServerSide()` 检查和相关 import
- [x] 3.2 修复 evaluate_offer → fetch("/api/evaluate", ...) 替代不存在的 /api/evaluate-offer
- [x] 3.3 修复 generate_cv → fetch("/api/cv", ...) 替代不存在的 /api/cv/generate
- [x] 3.4 修复 scan_portals → fetch("/api/scan/status", ...) 替代不存在的 /api/scan

## 4. export_file 工具

- [x] 4.1 新建 `src/lib/agent/tools/action/export-file.ts`
- [x] 4.2 注册到 `tools/index.ts`
- [x] 4.3 支持 md / html / txt 三种格式，调用 Blob + URL.createObjectURL + `<a>` click 触发下载

## 5. page.tsx 接入

- [x] 5.1 sendMessage 中用客户端 runner 替代 POST /api/agent/chat
- [x] 5.2 SSE 事件解析逻辑保持不变（已有的 plan_created、task_started 等 switch case）

## 6. 清理

- [x] 6.1 `src/app/api/agent/chat/route.ts` 移除 execute 模式的 Agent Loop 分支（保留 explore 流）
- [x] 6.2 删除服务端 `runner.ts`（逻辑已移到 client-runner.ts）

## 7. 验证

- [x] 7.1 TypeScript 检查 — 0 errors
- [x] 7.2 `next build` 通过
- [ ] 7.3 手动测试：查投递 → LLM 调 search_applications → DexieDB 返回数据 → agent 回复
- [ ] 7.4 手动测试：多步任务 → PlanCard 出现 → 工具逐项执行 → 结果正常
- [ ] 7.5 手动测试：导出文件 → agent 调 export_file → 浏览器下载 .md 文件
