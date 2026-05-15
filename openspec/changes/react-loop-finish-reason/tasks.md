## 1. think proxy 注入 finish_reason

- [x] 1.1 `think/route.ts` — SSE 流末尾解析并注入 `finish_reason` 事件

## 2. client-runner 收集 finish_reason

- [x] 2.1 `collectThinkResponseStreaming` — 收集 `finish_reason` 事件并作为返回值导出

## 3. client-runner + server-runner 循环改造

- [x] 3.1 while 循环停止条件:用 `finish_reason` 替代 `toolCalls.length===0`
- [x] 3.2 错误处理: `degradeToUser` 不 `return`,改为注入 Observation 后 `continue`
- [x] 3.3 `intermediate_steps` 结构化累积
- [x] 3.4 超限时用 intermediate_steps 生成步骤总结替代硬编码提示
- [x] 3.5 server-runner 对称修改

## 4. system prompt 更新

- [x] 4.1 `prompt.ts` — 错误处理段改为 Anthropic 模式:"收到 [TOOL_ERROR] 时,请自然告知用户…"

## 5. 验证

- [x] 5.1 permanent 错误 → 模型自然告知用户(不是引擎硬编码提示)
- [x] 5.2 finish_reason 驱动循环 → 模型能多轮调用工具
- [x] 5.3 超限 → intermediate_steps 总结,用户看到"试了X次"而不是"达到思考上限"
- [x] 5.4 编译通过
