## ADDED Requirements

### Requirement: Agent page component structure
The `frontend/src/app/agent/` directory SHALL contain a `page.tsx` entry point (< 100 lines) and a `_components/` directory with focused components, each < 500 lines.

#### Scenario: Developer navigates agent directory
- **WHEN** a developer opens `frontend/src/app/agent/`
- **THEN** they see `page.tsx` and `_components/` directory
- **AND** `_components/` contains ChatPanel, ChatInput, ToolCallLog, AgentSelector, SessionMemory
- **AND** a shared hook `useAgentChat.ts` manages chat state

#### Scenario: Agent page functionality unchanged after split
- **WHEN** user uses the agent chat page
- **THEN** all existing functionality works: chat input, streaming responses, tool call display, agent switching, session memory
- **AND** no visual regressions

### Requirement: Analytics page component structure
The `frontend/src/app/analytics/` directory SHALL contain a `page.tsx` entry point (< 100 lines) and a `_components/` directory.

#### Scenario: Developer navigates analytics directory
- **WHEN** a developer opens `frontend/src/app/analytics/`
- **THEN** they see `page.tsx` and `_components/` directory
- **AND** `_components/` contains ScoreDistribution, FunnelChart, WeeklyActivity, ConversionRate, StatusBreakdown

### Requirement: Split is logic-preserving
The component extraction SHALL NOT change any business logic, API calls, or state management. It is a pure code organization change.

#### Scenario: No behavioral diff
- **WHEN** the split is complete
- **THEN** all existing API calls use the same endpoints and parameters
- **AND** state management uses the same hooks and stores
- **AND** user interactions produce identical results to before the split
