# Spec Delta: Interview AI Coach

## MODIFIED Requirements

### Requirement: 真实模拟面试

The interview coach SHALL behave like a realistic interviewer while staying grounded in session state. It SHALL not be a rigid question script, and it SHALL not invent an unrelated new plan after the user has started answering.

#### Scenario: 允许追问和深挖

- **WHEN** the user's answer exposes a gap, contradiction, strong project detail, or unclear evidence
- **THEN** the coach MAY ask a follow-up or probe immediately
- **AND** it SHALL tie the follow-up to the current question and answer
- **AND** it SHALL continue the same interview session

#### Scenario: 保持面试主线

- **WHEN** the coach transitions from one main question to another
- **THEN** the transition SHALL respect the stored question plan, current session progress, and answered history
- **AND** the coach SHALL NOT restart from a new topic unless the user asks to restart or switch

### Requirement: 工具与状态边界

Interview tools SHALL operate on explicit session state and SHALL avoid destructive or redundant regeneration.

#### Scenario: 已有面试会话时不重新生成题纲

- **WHEN** an active interview session already has a question graph or plan snapshot
- **AND** the user continues answering or asks for feedback
- **THEN** tools SHALL update the existing session
- **AND** tools SHALL NOT call a full question-plan generator unless the user explicitly asks to restart or regenerate

#### Scenario: 评分工具读取已保存答案

- **WHEN** the user asks for feedback, scoring, or recap
- **THEN** scoring tools SHALL read the session's stored transcript and answers
- **AND** tools SHALL NOT ask the user to paste answers that are already recorded

