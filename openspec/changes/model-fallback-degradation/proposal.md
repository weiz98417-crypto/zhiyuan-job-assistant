## Why

Agent 的所有 LLM 调用硬编码 DeepSeek V4 Flash。DeepSeek 挂了 → 全部 502。需要模型降级链保证可用性。

## What Changes

- `think/route.ts` 和 `server-runner.ts` 中的 LLM 调用加 fallback 链
- 降级顺序：DeepSeek V4 Flash → GLM-4 Flash → Qwen-Long → 错误
- 环境变量已有 ZHIPU_API_KEY 和 DASHSCOPE_API_KEY（import-reference 已用）

## Capabilities

- `model-fallback`: LLM 调用自动降级——DeepSeek 失败时自动尝试智谱 GLM-4，再失败尝试阿里 Qwen-Long

## Impact

- **修改**: `frontend/src/app/api/agent/think/route.ts`（加 `fetchWithFallback()`）
- **修改**: `frontend/src/lib/agent/loop/server-runner.ts`（`callDeepSeek()` → fallback 链）
