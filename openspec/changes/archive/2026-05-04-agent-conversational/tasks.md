## 1. Agent 页面骨架

- [x] 1.1 创建 `/agent` 页面路由（`src/app/agent/page.tsx`）
- [x] 1.2 实现探索/执行双 Tab 切换 UI
- [x] 1.3 Tab 状态通过 URL search param（`?tab=explore` | `?tab=execute`）管理
- [x] 1.4 两个 Tab 共享 messages 数组状态，Tab 切换不丢失消息

## 2. AgentChat 通用聊天组件

- [x] 2.1 从 explore 页面提取聊天渲染逻辑为 `src/components/agent/AgentChat.tsx`
- [x] 2.2 消息模型升级为 AgentMessage（role/mode/toolName/toolResult/timestamp）
- [x] 2.3 探索 Tab：tool 消息渲染为纯文本，显示"总结"按钮
- [x] 2.4 执行 Tab：tool 消息渲染为工具结果卡片（toolName + 格式化摘要）

## 3. 统一 Chat Stream 路由

- [x] 3.1 创建 `POST /api/agent/chat` 路由
- [x] 3.2 复用 `assembleContext(scenario)` 获取分层 System Prompt
- [x] 3.3 探索模式下不注入工具列表，保持轻量聊天风格
- [x] 3.4 执行模式下注入完整工具列表到 System Prompt

## 4. 执行模式工具调用

- [x] 4.1 实现 `<<TOOL>>name\n{params}\n<</TOOL>>` 标记解析
- [x] 4.2 工具调用暂停 SSE 流 → 执行工具 → 注入结果到 LLM 上下文 → 二次 LLM 生成最终回复
- [x] 4.3 单次最多一个工具调用，执行完等待用户下一条消息
- [x] 4.4 工具结果格式化渲染为卡片（公司+职位+状态摘要 / 错误提示）

## 5. 探索模式总结与画像

- [x] 5.1 迁移"总结"按钮到 AgentChat 探索模式
- [x] 5.2 总结结果保留现有写入链路（localStorage + DexieDB CareerProfile + AgentPreferenceModel）
- [x] 5.3 画像面板复用现有 ProfileData 渲染，在探索 Tab 右侧持久显示（>=1280px）

## 6. localStorage → DexieDB 迁移

- [x] 6.1 首次加载 /agent 时检测 localStorage `lingji-explore-chat` 有数据 → 导入 DexieDB `agentInteractions`
- [x] 6.2 迁移完成清除 localStorage key
- [x] 6.3 迁移失败不阻塞页面（best-effort），静默降级

## 7. 导航与路由迁移

- [x] 7.1 AppShell 侧边栏 "需求探索" → "AI Agent"，图标改为 Bot，链接 `/agent`
- [x] 7.2 首页仪表盘所有指向 `/explore` 的链接改为 `/agent?tab=explore`
- [x] 7.3 `/explore` 页面改为 302 redirect 到 `/agent?tab=explore`
- [x] 7.4 `/api/chat/stream` 保留路由但内部改为委托 `/api/agent/chat`（或直接引用 context assembler）

## 8. System Prompt 结构化（SKILL.md 模式）

- [x] 8.1 创建 `skills/zhiyuan-explore.md`：Stance + Steps（接住情绪→识别信号→自然探索→判断转场）+ Guardrails + Transitions + Output
- [x] 8.2 创建 `skills/zhiyuan-execute.md`：Stance + Steps（理解意图→决定行动→基于结果回复→关闭本轮）+ Tool Decision Matrix + Guardrails + Output
- [x] 8.3 创建 `src/lib/agent/skill-loader.ts`：`loadSkill(name)` — fs.readFileSync + 模块级缓存 + frontmatter 解析
- [x] 8.4 更新 `route.ts` 的 `buildServerSystemPrompt()`：调用 loadSkill 读取 .md，替换硬编码字符串
- [ ] 8.5 验证：探索模式对话质量（能否自然引导？能否识别 DEEP 信号？）
- [ ] 8.6 验证：执行模式工具选择准确率（Decision Matrix 查表是否覆盖常见意图？）

## 9. Phase 可视化（SSE 事件 → UI 状态）

- [x] 9.1 AgentChat 添加 `phase` 和 `executingTool` props
- [x] 9.2 MessageBubble 根据 phase 渲染三种视觉状态：thinking（弹跳圆点）、executing（工具名+spinner）、responding（流式文本+光标）
- [x] 9.3 page.tsx 添加 `phase` 和 `executingTool` 状态管理
- [x] 9.4 重写 sendMessage 的 SSE 解析：buffer + `\n\n` 分割 → JSON.parse → dispatch 事件
- [x] 9.5 tool_result 事件触发时实时插入 tool 消息卡片（非等到 done）
- [x] 9.6 探索模式跳过 executing phase，thinking → responding 直接过渡

## 10. 验证

- [x] 10.1 TypeScript 编译零错误
- [ ] 10.2 全流程验证：/agent → 探索 Tab 聊天 → 思考动画 → 流式回复 → 总结 → 切换执行 Tab → 思考→执行→回复 → 工具卡片
- [x] 10.3 旧路由兼容：访问 /explore → 302 → /agent?tab=explore
- [x] 10.4 消息持久化：刷新 /agent 后消息恢复
- [x] 10.5 执行模式注入工具列表、探索模式不注入
- [x] 10.6 探索模式保持"轻"——无工具、无行业知识注入
