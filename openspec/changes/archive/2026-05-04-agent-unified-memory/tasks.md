## 1. 类型与数据库 Schema

- [x] 1.1 新增 AgentMemory 相关类型定义（AgentInteraction, AgentDecision, AgentPreferenceModel）
- [x] 1.2 DexieDB v5 migration — 新增 agentInteractions, agentDecisions, agentPreferences 三张表
- [x] 1.3 创建 `frontend/src/lib/agent/` 目录结构

## 2. Agent Memory 系统

- [x] 2.1 实现 AgentInteraction CRUD（记录交互/查询历史/自动清理 90 天前数据）
- [x] 2.2 实现 AgentDecision CRUD（记录决策/更新响应/追踪结果）
- [x] 2.3 实现 AgentPreferenceModel CRUD（角色偏好/公司偏好/薪资敏感度/行为模式）
- [x] 2.4 实现偏好模型衰减逻辑（90 天半衰期，|score|<0.05 移除）
- [x] 2.5 实现偏好边界保护（±0.15 上限，confidence<0.3 不生效）

## 3. Agent 工具注册表

- [x] 3.1 创建 AgentTool 类型定义 + ToolRegistry 注册表
- [x] 3.2 注册查询工具（search_applications, get_report_detail, get_profile）
- [x] 3.3 注册行动工具（evaluate_jd, check_health, recommend, generate_interview, tailor_cv 等）
- [x] 3.4 实现工具结果格式化器（formatResult — 控制在 500 tokens 以内）
- [x] 3.5 实现工具列表 LLM 注入（执行模式下注入可用工具描述到 system prompt）

## 4. Agent 知识库

- [x] 4.1 创建行业职级知识（BAT/TMD 级别映射表 + 年限/薪资/职责描述）
- [x] 4.2 创建薪资基准知识（城市×级别×行业的月薪范围 + 年终奖惯例）
- [x] 4.3 创建公司面试风格知识（主流公司面试轮次/风格/侧重点）
- [x] 4.4 创建 JD 信号词典（常见信号词→可能含义映射）
- [x] 4.5 实现知识按场景选择性注入（执行模式按用户目标角色筛选，避免 context 膨胀）

## 5. Agent 上下文组装器

- [x] 5.1 创建 context assembler — 并行查询 Memory + Data + Knowledge
- [x] 5.2 实现 System Prompt 分层组装（Base Persona + Mode Overlay + Knowledge + Tools）
- [x] 5.3 实现 context 缓存（1 小时内相同 Pipeline 状态复用 context，避免重复 LLM 调用）
- [x] 5.4 创建 `POST /api/agent/context` 路由（返回组装好的 Agent 上下文）

## 6. 偏好模型与推荐引擎集成

- [x] 6.1 修改 `computeMatchScore` — 叠加 AgentPreferenceModel 的权重加成（liked +5, disliked -10, max ±15）
- [x] 6.2 实现偏好加成的向后兼容（无偏好模型时行为与 V2.0 一致）
- [x] 6.3 创建 `POST /api/agent/feedback` 路由（接收反馈 → 写入 Memory → 更新偏好模型）

## 7. 探索 → 画像链路打通

- [x] 7.1 修改 explore 页面 summarize 成功回调 — 额外写入 CareerProfile.goals（source="explore"）
- [x] 7.2 探索总结的角色偏好同步写入 AgentPreferenceModel（confidence 基于对话轮数）
- [x] 7.3 实现 source 优先级：手工设定（manual）> 探索总结（explore），冲突时保留手工设定

## 8. 推荐反馈闭环

- [x] 8.1 修改首页 RecommendCard dismiss 回调 — 异步调用 `/api/agent/feedback` 写入反馈
- [x] 8.2 修改首页 RecommendCard "查看评估"回调 — 异步记录 feedback="clicked"
- [x] 8.3 偏好模型更新后自动刷新推荐排序（前端 useEffect 响应 profile 变化）

## 9. 验证

- [x] 9.1 TypeScript 编译零错误
- [x] 9.2 全流程验证：探索总结 → 偏好写入 → 仪表盘推荐 → 反馈 → 偏好更新 → 后续推荐受影响
- [x] 9.3 向后兼容验证：新用户无偏好模型时推荐行为与 V2.0 一致
- [x] 9.4 边界验证：偏好 ±0.15 上限、confidence<0.3 不生效、90 天衰减
