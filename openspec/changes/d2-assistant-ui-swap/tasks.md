# Tasks: d2-assistant-ui-swap

## 1. 依赖与兼容验证
- [ ] 1.1 安装 `@assistant-ui/react@^0.15` 并记录依赖树快照（含传递依赖许可证核对）
- [ ] 1.2 React 19.2 / Next 16 import 级兼容验证（最小渲染冒烟）
- [ ] 1.3 不兼容时停止并回报选项（不硬塞）

## 2. ExternalStoreRuntime 接线
- [ ] 2.1 convertMessage：对话项/事件条目 → ThreadMessageLike（含 data parts：step/subagent/agent_switch/persist_done）
- [ ] 2.2 store 接线：messages = mergeServerTranscript 合并层；isRunning = streaming；onNew = 既有 Turn 提交流程；onCancel = 既有取消
- [ ] 2.3 不注册 onEdit/onReload/分支回调

## 3. 领域卡与审批
- [ ] 3.1 ToolUI 注册：delegation/handoff/报告/岗位卡（复用 0.11.0-B 组件）
- [ ] 3.2 ApprovalCard 接线 Run Gate（保留 reconcileRunGateMessages 修正逻辑）
- [ ] 3.3 Composer 替换输入框（Enter/Shift+Enter/自动伸缩）

## 4. 退役与门禁
- [ ] 4.1 旧 AgentChat.tsx 及专属测试删除（条件：走查 + 全量绿）
- [ ] 4.2 PE2E 13 条全解冻全绿 + 连贯性验收集通过（0.11.0 最终发布门禁）
- [ ] 4.3 CHANGELOG（面向用户）；0.11.0 定版
- [ ] 4.4 方言一致性断言测试扩展到新壳注册表
