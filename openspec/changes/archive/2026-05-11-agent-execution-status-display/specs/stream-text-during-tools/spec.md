## ADDED Requirements

### Requirement: Stream text persists during tool execution
When the LLM has emitted text before invoking tool calls, that text SHALL remain displayed while tools execute. The tool status SHALL appear below the text, not replace it.

#### Scenario: Thinking text before tool call
- **WHEN** the LLM emits thinking text "好的，让我帮你优化简历的工作经历板块" and then invokes `optimize_resume_section`
- **THEN** the thinking text SHALL remain visible while `ExecutingIndicator` shows below it

#### Scenario: No text before tool call
- **WHEN** the LLM invokes a tool without emitting any text first
- **THEN** only the `AgentStatusBar` SHALL be displayed, showing `🔧 {tool name}  ⏱ Ns`

### Requirement: Multiple tool results render as separate cards
When the agent executes multiple tools in sequence, each tool result SHALL render as a separate `ToolResultCard` in chronological order, all visible in the chat.

#### Scenario: Two tools executed sequentially
- **WHEN** agent executes `analyze_jd_risks` then `evaluate_jd_full`
- **THEN** the chat SHALL show two `ToolResultCard` components, one for each tool

### Requirement: Tool execution phase shows progress not blank screen
During the `executing` phase, the UI SHALL always show content: either existing stream text, a tool badge with timer, or both. Never a blank/empty state.

#### Scenario: Tool is running but no text yet
- **WHEN** phase is "executing" and no stream text has been received
- **THEN** the UI SHALL display the `AgentStatusBar` with tool name and elapsed time
