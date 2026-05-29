## ADDED Requirements

### Requirement: 面试教练迁移为子 Agent

Phase 1 的面试教练能力 SHALL 在下述方面保持不变地迁移为独立子 Agent：
- 六种面试模式
- `generate_interview_questions` 工具
- `score_interview_answer` 工具
- 教练对话写入 Memory

#### Scenario: Prompt 迁移

- **WHEN** Interview Agent 被路由激活
- **THEN** System Prompt 来自 `buildInterviewCoachPrompt()`，内容与 Phase 1 的教练 Prompt Overlay 完全一致
- **AND** Prompt 不再需要与 General Prompt 叠加——Interview Agent 有独立的完整 Prompt

#### Scenario: 工具迁移

- **WHEN** Interview Agent 执行工具调用
- **THEN** 可用的工具集为 `INTERVIEW_TOOLS`（与 Phase 1 定义一致）
- **AND** 不包含非面试工具（如 `search_applications`、`evaluate_jd`）

#### Scenario: 运行时行为不变

- **WHEN** 用户在 Interview Agent 模式下对话
- **THEN** 对话体验与 Phase 1 的教练模式一致
- **AND** 流式输出、工具结果渲染、信号提取等行为不变

#### Scenario: 与 Phase 1 代码的关系

- **WHEN** Phase 3 完成后
- **THEN** Phase 1 的 `interview-coach-prompt.ts` 被 `registry/` 中的 Interview Agent 定义引用（不需要代码重写）
- **AND** Phase 1 的 `interview-tools.ts` 被 Interview Agent 直接 import
- **AND** `agent/page.tsx` 中不再有面试 intent 的特殊分支——统一走 Orchestrator 路由
