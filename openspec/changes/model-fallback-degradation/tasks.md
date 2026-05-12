## 1. think/route.ts 降级

- [x] 1.1 在 `think/route.ts` 中新增 `fetchWithFallback()` 函数
- [x] 1.2 模型配置：`[{ name: "deepseek-v4-flash", url, key }, { name: "glm-4.6v-flashx", url, key }, { name: "qwen-long", url, key }]`
- [x] 1.3 降级逻辑：当前模型失败(429/503/超时) → 下一个模型

## 2. server-runner.ts 降级

- [x] 2.1 `callDeepSeek()` 改用 `fetchWithFallback(tryModels)` 协议

## 3. 验证

- [x] 3.1 临时改错 DEEPSEEK_API_KEY → 验证自动切换到 GLM-4
- [x] 3.2 全部 key 错误 → 验证返回清晰错误而非 502
