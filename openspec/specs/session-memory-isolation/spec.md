## ADDED Requirements

### Requirement: Per-session memory isolation
Each session SHALL maintain an independent `memoryDigest` field. When switching sessions, the system SHALL inject the new session's `memoryDigest` into the agent's system prompt context. Sessions SHALL NOT share memory or message history.

#### Scenario: Memory isolated between sessions
- **WHEN** user discusses "remote work preference" in Session A
- **THEN** Session B's agent does NOT reference this preference unless also mentioned in Session B

#### Scenario: Memory digest injected on session load
- **WHEN** user switches to a session with `memoryDigest: "用户偏好远程工作，目标薪资25-35K"`
- **THEN** the system prompt includes this digest as context for the agent

### Requirement: Memory digest auto-generation
When a session reaches 5+ messages, the system SHALL generate a brief `memoryDigest` summarizing key user preferences, decisions, and context from the conversation. Digest SHALL be stored on the session record.

#### Scenario: Digest generated after sufficient conversation
- **WHEN** session has 5+ messages including user messages
- **THEN** a digest is generated containing key facts (e.g., "用户目标: 前端高级工程师, 偏好: 远程/混合办公, 薪资: 25-35K")

### Requirement: Context isolation during agent loop
When `agentLoopClient` is invoked, it SHALL use only the messages from the current session plus the session's `memoryDigest`. Messages from other sessions SHALL NOT be included in the context.

#### Scenario: Agent loop scoped to current session
- **WHEN** agent processes a user query in Session A
- **THEN** the LLM context contains only Session A's messages and Session A's memoryDigest, with no messages from Session B
