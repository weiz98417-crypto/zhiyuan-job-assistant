# Spec Delta: Interview Coach Chat

## ADDED Requirements

### Requirement: Session-anchored mock interview runtime

AgentChat SHALL run mock interviews from an `InterviewSessionState` that contains the frozen plan snapshot, transcript, current question, question graph, scores, and recap state.

#### Scenario: AgentChat starts from a plan snapshot

- **WHEN** AgentChat receives an interview plan snapshot
- **THEN** it SHALL create or resume an interview session
- **AND** it SHALL show the active company, role, resume, mode, and session status
- **AND** it SHALL use the snapshot as the initial interview context

#### Scenario: 根据 JD 和简历出题

- **WHEN** the user asks AgentChat to simulate an interview based on their JD and resume
- **THEN** AgentChat SHALL use the active session snapshot if one exists
- **AND** if no active snapshot exists, it SHALL select or create one from local JD/resume context before starting
- **AND** it SHALL NOT fall back to an unrelated generic question set when matching JD/resume context is available

### Requirement: 自然追问但不漂移

The interview coach SHALL be allowed to ask follow-ups and probes without user confirmation, but each deviation SHALL be anchored to the active session and current question graph.

#### Scenario: 当前题下追问

- **WHEN** the user answers a main question
- **AND** the coach asks a deeper follow-up
- **THEN** the follow-up SHALL be stored as a `QuestionNode` with `kind = follow_up`
- **AND** it SHALL reference the parent main question
- **AND** the UI SHALL make it clear that this is a follow-up, not an unrelated next numbered question

#### Scenario: 不允许无锚点第九题

- **WHEN** the coach asks a question outside the initial plan
- **THEN** the question SHALL be classified as `follow_up`, `probe`, `clarification`, or a new `main` question with a reason
- **AND** the session SHALL preserve why the question was asked
- **AND** the coach SHALL NOT forget previous answered questions or ask the user to repost prior answers

### Requirement: 回答和评分来自存储状态

Scoring and recap SHALL consume stored session transcript and question graph data rather than relying on the model's transient memory.

#### Scenario: 用户完成多轮回答后请求评分

- **WHEN** the user asks for scoring after answering several questions
- **THEN** the system SHALL read the stored answers from `InterviewSessionState`
- **AND** it SHALL score the relevant question or session without asking the user to paste previous answers again

#### Scenario: 生成复盘

- **WHEN** the user ends the mock interview or requests a recap
- **THEN** the recap SHALL summarize from stored transcript, scores, and question graph
- **AND** the recap SHALL be saved to the interview session

### Requirement: 智能切换 JD/简历材料

AgentChat SHALL use smart arbitration when the user mentions another JD or resume during an active interview.

#### Scenario: 明确切换材料

- **WHEN** the user explicitly says to switch to another named JD or resume
- **AND** the system can confidently match that record
- **THEN** AgentChat MAY rebind or start a new session
- **AND** it SHALL explain the change and record it in `rebindHistory`

#### Scenario: 模糊提到另一份材料

- **WHEN** the user ambiguously mentions another JD or resume
- **THEN** AgentChat SHALL NOT silently switch the active binding
- **AND** it SHALL either treat the material as supporting context or ask one short clarification

