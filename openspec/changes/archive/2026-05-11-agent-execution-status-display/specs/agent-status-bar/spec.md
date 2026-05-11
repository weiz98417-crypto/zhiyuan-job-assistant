## ADDED Requirements

### Requirement: Status bar shows real-time elapsed time
The AgentChat component SHALL display an `AgentStatusBar` that updates every second to show elapsed time since the current agent run started, using a `useEffect` interval timer.

#### Scenario: Timer starts on first SSE event
- **WHEN** the SSE stream emits the first event (any type) after user sends a message
- **THEN** `startTime` SHALL be set to `Date.now()` and the status bar SHALL show `⏱ 0s`

#### Scenario: Timer increments each second
- **WHEN** the agent run has been active for 5 seconds
- **THEN** the status bar SHALL display `⏱ 5s`

#### Scenario: Timer stops on done
- **WHEN** the SSE stream emits `{ type: "done" }`
- **THEN** the status bar SHALL stop incrementing and display the final elapsed time

### Requirement: Status bar shows current tool name with display label
The status bar SHALL show the currently executing tool's display name (emoji + label from tool-display-names.ts) when a `tool_call` event is received.

#### Scenario: Tool call updates status bar
- **WHEN** SSE emits `{ type: "tool_call", name: "optimize_resume_section" }`
- **THEN** status bar SHALL display `🔄 正在：✨ 简历优化  ⏱ 8s`

#### Scenario: Unknown tool falls back to raw name
- **WHEN** SSE emits `{ type: "tool_call", name: "unknown_tool" }`
- **THEN** status bar SHALL display `🔄 正在：unknown_tool  ⏱ 3s`

### Requirement: Status bar shows phase-specific labels
The status bar SHALL display different labels based on the current agent phase: "识别中" for understanding, "分析中" for reflecting, "执行中" for executing, "验证中" for verifying, "输出中" for responding.

#### Scenario: Understanding phase
- **WHEN** phase is "understanding"
- **THEN** status bar SHALL display `🧠 识别中  ⏱ 2s`

#### Scenario: Executing phase with tool
- **WHEN** phase is "executing" and `executingTool` is set
- **THEN** status bar SHALL display `🔧 {toolLabel}  ⏱ 5s`

### Requirement: Status bar shows token consumption when available
If the SSE stream provides token usage data, the status bar SHALL display it in the format `↓ N.Nk tokens`.

#### Scenario: Token data available
- **WHEN** the stream provides `{ consumedTokens: 915 }`
- **THEN** status bar SHALL display `⏱ 33s · ↓ 1.0k tokens`
