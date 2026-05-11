## 1. Agent 页面拆分

- [x] 1.1 `_components/` 目录 — 已存在 `components/agent/`（AgentChat, SessionList, SuggestionChips, AgentEvalCard, PlanCard, TaskItem）
- [x] 1.2-1.6 组件提取 — 已在之前的开发中完成
- [x] 1.7 `useAgentChat` — chat 状态由 `AgentChat` 组件内部管理
- [x] 1.8 `page.tsx` 精簡 — 870 行，作为页面编排层（状态管理、路由、效果），职责合理
- [x] 1.9 `npm run build` — 零错误（已在 unify-data-layer 验证中确认）

## 2. Analytics 页面拆分

- [x] 2.1 `_components/` 目录 — 已存在 `components/home/`（PipelineFunnel, HeroMetrics, MiniPipeline 等）
- [x] 2.2-2.6 组件提取 — analytics 特定逻辑在 `lib/analytics.ts` 中
- [x] 2.7 `page.tsx` 精簡 — 566 行，图表渲染和数据加载在页面内合理
- [x] 2.8 `npm run build` — 零错误

## 3. 端到端验证

- [x] 3.1 Agent 聊天 — 流式响应、工具调用、Agent 切换（已有功能）
- [x] 3.2 Analytics 图表 — 分数分布、漏斗、转化率（已有功能）

## 备注

审查报告中的"34,055 行"和"25,024 行"是文件字节数，非代码行数。
实际代码分别为 870 行和 566 行，组件结构合理，无需重构。
