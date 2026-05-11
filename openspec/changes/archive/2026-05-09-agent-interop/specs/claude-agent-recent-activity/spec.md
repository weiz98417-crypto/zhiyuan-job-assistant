## ADDED Requirements

### Requirement: getClaudeAgentActivity queries recent evaluations from SQLite
The system SHALL provide a function that returns a compact string summary of the last 5 applications evaluated by Claude Agent.

#### Scenario: Recent evaluations exist
- **WHEN** the SQLite applications table contains 5+ evaluated records
- **THEN** `getClaudeAgentActivity()` returns a formatted string listing company, role, score, risk status, and date for the 5 most recent

#### Scenario: No evaluations yet
- **WHEN** the applications table is empty
- **THEN** `getClaudeAgentActivity()` returns an empty string
- **AND** no error is thrown

#### Scenario: SQLite unavailable
- **WHEN** `better-sqlite3` cannot connect or query
- **THEN** `getClaudeAgentActivity()` returns an empty string
- **AND** the orchestrator continues normally with other context fields

### Requirement: Orchestrator injects Claude activity into AgentPromptContext
The orchestrator SHALL call `getClaudeAgentActivity()` during context assembly and pass the result to all agents via `AgentPromptContext`.

#### Scenario: Agent receives Claude activity context
- **WHEN** the orchestrator assembles context for any agent
- **THEN** `AgentPromptContext.claudeAgentActivity` contains the Claude activity summary
- **AND** the agent's `buildSystemPrompt` can include it in the system prompt

### Requirement: AgentPromptContext type extended
The TypeScript type `AgentPromptContext` SHALL include an optional `claudeAgentActivity` field.

#### Scenario: TypeScript compilation
- **WHEN** `npm run build` is executed
- **THEN** no type errors related to `AgentPromptContext` exist
