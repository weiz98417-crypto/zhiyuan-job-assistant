## 1. SSE 事件协议扩展

- [x] 1.1 在 `loop/types.ts` 中 SSEEvent 联合类型增加 `reflecting` phase 和 `thinking_content` 事件
- [x] 1.2 在 `loop/types.ts` 中 LoopState.phase 增加 `reflecting` 和 `observe` 阶段

## 2. ReAct 循环重写（client-runner.ts）

- [x] 2.1 重构 `agentLoopClient`：去掉 plan-first 架构，改为 while 循环的 Think-Act-Observe-Reflect 结构
- [x] 2.2 Think 阶段：LLM 调用后 parse 出 `thinking_content`（推理文本）和 `tool_call`（如有），yield 对应事件
- [x] 2.3 Act 阶段：执行工具，yield `tool_call` + `tool_result` 事件
- [x] 2.4 Observe 阶段：工具结果追加到消息上下文
- [x] 2.5 Reflect 阶段：带反思指令再调 LLM，判断 `next_action`（call_tool / respond），yield `reflecting` + `thinking_content`
- [x] 2.6 保留 plan/tool/chat 三段兼容 fallback：LLM 输出 `<<PLAN>>` 时仍走 PlanCard + 任务执行路径
- [x] 2.7 `maxIterations` 达到上限时强制 Respond

## 3. System Prompt 更新

- [x] 3.1 在 `prompt.ts` 中增加 ReAct 协议指令：Think → Act → Observe → Reflect 四阶段格式要求
- [x] 3.2 增加 Reflect 阶段示例：工具返回后一句话判断"数据够不够，下一步做什么"

## 4. ToolResultCard 重写

- [x] 4.1 重写 `ToolResultCard`：成功显示绿色左边框 + ✓ 图标，失败显示红色左边框 + ✗ 图标
- [x] 4.2 主内容区使用 `formatResult` 的格式化字符串，不展示 `{result, success}` JSON 对象
- [x] 4.3 失败卡片展示 `result.error` 作为错误原因
- [x] 4.4 添加可折叠的"查看详情"区域（默认折叠），展示原始数据
- [x] 4.5 最大高度 12 行，超出滚动

## 5. 新 UI 组件

- [x] 5.1 创建 `ThinkingBubble` 组件：斜体、弱背景色、动画淡入，展示 Agent 推理文本
- [x] 5.2 创建 `ReflectingIndicator` 组件："分析结果中..." + 动画点，展示反思内容
- [x] 5.3 在 `AgentChat.tsx` 中整合新组件，按 phase 切换展示

## 6. page.tsx 修复与适配

- [x] 6.1 处理新 SSE 事件：`reflecting` phase、`thinking_content` 
- [x] 6.2 修复 `toolResult` 包装问题：`toolMsg.toolResult` 直接存格式化字符串，不再包装 `{result, success}` 对象
- [x] 6.3 移除 `toolResult` 不再需要的对象包装逻辑

## 7. 验证

- [x] 7.1 `npx tsc --noEmit` — 0 errors
- [x] 7.2 `npm run build` — 通过
- [ ] 7.3 手动测试：发送"查投递" → Think → Act → Observe → Reflect → Respond 全流程可视化
- [ ] 7.4 手动测试：发送"分析JD" → 多轮 ReAct → 每轮工具调用和反思可见
- [ ] 7.5 手动测试：工具失败场景 → 红色卡片 + 错误原因 + Reflect 决定重试或跳过
- [ ] 7.6 手动测试：纯聊天"你好" → 聊天路径无多余可视化元素
