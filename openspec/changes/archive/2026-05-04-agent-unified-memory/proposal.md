## Why

V2.0 的"Agent"本质上是一个推荐算法 + LLM 文案生成器，缺少真正 Agent 的三要素——Knowledge（知识库）、Tools（工具调用）、Memory（持久记忆）。用户点击"不感兴趣"只是前端淡出，Agent 没学到任何东西；探索页聊出来的方向建议停留在 localStorage，Agent 不知道；所有 API 都存在但 Agent 不会主动调用。这个 change 补上 Agent 的基础设施，让纸鸢从一个"推荐算法"升级为一个有记忆、会使用工具、能持续学习的 Agent。

## What Changes

- 新建 Agent Memory 系统（三层记忆：交互记忆 → 决策记忆 → 偏好模型），DexieDB 持久化
- 新建 Agent Tool Registry（工具注册 + 调用引擎），将现有 15 个 API 路由注册为 Agent 可调用的工具
- 新建 Agent Knowledge Base（行业职级、薪资基准、公司画像、JD 信号词典），嵌入 LLM system prompt
- 打通探索 → 画像链路：`/api/chat/summarize` 的结果不再只存 localStorage，同步写入 CareerProfile.goals 和 AgentPreferenceModel
- "不感兴趣"反馈闭环：用户 dismiss 推荐 → 更新偏好模型 → 影响后续推荐排序
- 统一 System Prompt 分层：base persona（纸鸢） + 模式 overlay（探索模式 / 执行模式）

## Capabilities

### New Capabilities

- `agent-memory`: Agent 记忆系统——交互日志、决策追踪、偏好学习（三层模型），DexieDB 持久化，支持反馈闭环
- `agent-tools`: Agent 工具系统——工具注册表 + 调用引擎，将现有 API 封装为 Agent 可调用的工具，支持参数校验和结果格式化
- `agent-knowledge`: Agent 知识库——行业职级体系、薪资基准表、公司面试风格、JD 信号词典，按场景注入 LLM context

### Modified Capabilities

- `explore-chat-ui`: summarize 结果从仅存 localStorage 改为同步写入 CareerProfile.goals + AgentPreferenceModel
- `frontend-shell`: 推荐反馈（"不感兴趣"）从纯 UI 淡出改为写入 AgentMemory，影响后续推荐；仪表盘空状态引导文案统一

## Impact

- 新建: `frontend/src/lib/agent/` 目录（memory.ts, tools.ts, knowledge.ts, orchestrator.ts）
- 新建: DexieDB v5 migration — 新增 agentMemory, agentDecisions, agentPreferences 三张表
- 修改: `frontend/src/lib/recommend.ts` — 推荐排序叠加偏好模型权重
- 修改: `frontend/src/lib/db.ts` — v5 schema migration
- 修改: `frontend/src/types/index.ts` — 新增 AgentMemory 相关类型
- 修改: `frontend/src/app/explore/page.tsx` — summarize 成功后同步写入 Agent 画像
- 修改: `frontend/src/app/page.tsx` — dismiss 推荐时写入 Agent 反馈记忆
- 新增 API: `POST /api/agent/feedback` — 记录用户对 Agent 决策的反馈
- 新增 API: `POST /api/agent/context` — 组装 Agent 当前上下文（Knowledge + Memory + State）
