## Why

`agent-loop-infrastructure` 把 Agent Loop 架在了服务端 (`route.ts`)，但工具系统有 6 个 query 工具依赖浏览器 IndexedDB，在服务端全部返回 "仅在浏览器可用"。还有 3 个 action 工具调用的 API 端点根本不存在。结果：12 个工具只有 3 个能用，Agent Loop 等于白做。

用户无法完成 "分析 JD → 生成报告 → 下载到本地" 这类端到端任务——不是 loop 设计有问题，是工具的手被砍了。

## What Changes

- **Agent Loop 客户端化**：Think→Act→Observe 循环从 `route.ts` 搬到 `page.tsx`（或独立 hook），在浏览器里跑
- **Think 走服务端代理**：LLM 调用通过 `POST /api/agent/think`，API key 安全留在服务端
- **工具系统全复活**：6 个 DexieDB query 工具不再 `isServerSide()` 报错；修复 3 个调用不存在 API 的 action 工具
- **新增 export_file 工具**：触发浏览器下载，支持 md/pdf/html 格式
- **route.ts 精简**：只保留 `/api/agent/think`（LLM 代理）+ 原有的业务 API

## Capabilities

### New Capabilities
- `agent-loop-client`: Agent Loop 在浏览器端运行，直接访问 DexieDB + 浏览器 API
- `agent-think-proxy`: `/api/agent/think` 服务端代理，安全持有 API key 转发 LLM 请求

### Modified Capabilities
- `agent-loop-engine`: 运行环境从服务端改为客户端
- `tool-plugin-system`: 修复 3 个无效 API 的工具，移除 `isServerSide()` 限制

## Impact

- **修改**: `src/lib/agent/loop/runner.ts` → 适配客户端 fetch（不再直接 `fetch()` DeepSeek，改为调 `/api/agent/think`）
- **修改**: `src/app/api/agent/chat/route.ts` → 删掉 Agent Loop 分支，只保留 explore 流 + 新增 `/api/agent/think`
- **新增**: `src/lib/agent/tools/action/export-file.ts` → 浏览器下载工具
- **修改**: 3 个 action 工具的 API 路径修正（evaluate-offer → 现有 API，cv/generate → cv，scan → 已有 scan API）
- **修改**: `src/app/agent/page.tsx` → Agent Loop 客户端 hook
