## ADDED Requirements

### Requirement: ToolResult declares failure recoverability
The system SHALL extend `ToolResult` with optional `recoverable` (boolean) and `retryHint` (string) fields. When not set, `recoverable` defaults to `true` for backward compatibility.

#### Scenario: Tool returns recoverable failure
- **WHEN** a tool handler returns `{ success: false, error: "API timeout", recoverable: true, retryHint: "请减少搜索范围重试" }`
- **THEN** the Agent Loop SHALL inject `retryHint` into the LLM context and increment `autoRetryCount`

#### Scenario: Tool returns permanent failure
- **WHEN** a tool handler returns `{ success: false, error: "简历板块内容不足", recoverable: false }`
- **THEN** the Agent Loop SHALL NOT increment `autoRetryCount` and SHALL communicate the permanent failure reason to the user without offering retry

#### Scenario: Tool omits recoverable field
- **WHEN** a legacy tool handler returns `{ success: false, error: "some error" }` without `recoverable`
- **THEN** the Agent Loop SHALL treat it as `recoverable: true` and apply the default retry hint

### Requirement: Agent Loop yields tool error events
The Agent Loop (`client-runner.ts` and `server-runner.ts`) SHALL yield a `tool_error` SSE event when a tool execution fails, containing the tool name, error message, and recoverability flag.

#### Scenario: Recoverable error event
- **WHEN** a tool execution fails with `recoverable: true`
- **THEN** the SSE stream MUST emit `{ type: "tool_error", name: "<tool>", error: "<message>", recoverable: true }`

#### Scenario: Permanent error event
- **WHEN** a tool execution fails with `recoverable: false`
- **THEN** the SSE stream MUST emit `{ type: "tool_error", name: "<tool>", error: "<message>", recoverable: false }`

### Requirement: Context injection includes retry guidance
When a tool fails with `recoverable: true`, the Agent Loop SHALL inject the `retryHint` (or a default hint) into the LLM context as an HTML comment alongside the tool result.

#### Scenario: Custom retryHint injected
- **WHEN** a tool returns `retryHint: "请用更短的关键词搜索"`
- **THEN** the LLM context SHALL contain `<!-- ⚠️ 工具执行失败: ... 请用更短的关键词搜索 -->`

#### Scenario: Default retryHint fallback
- **WHEN** a tool returns `recoverable: true` without `retryHint`
- **THEN** the LLM context SHALL contain the default hint: `请换参数重试、使用其他工具获取信息、或基于已有知识直接回答`

### Requirement: Permanent failures skip auto-retry
The Agent Loop SHALL NOT count permanent failures (`recoverable: false`) toward `autoRetryCount`, and SHALL NOT force the LLM to attempt alternative search strategies for permanent failures.

#### Scenario: Permanent failure does not trigger retry limit
- **WHEN** a tool returns `recoverable: false`
- **THEN** `autoRetryCount` MUST remain unchanged
- **AND** the quality hint SHALL be omitted from the context injection

#### Scenario: Recoverable failures still trigger retry limit
- **WHEN** 3 consecutive recoverable failures occur (MAX_AUTO_RETRY exceeded)
- **THEN** the Agent Loop SHALL force the LLM to respond based on existing knowledge

### Requirement: Critical tools specify recoverable status
The following tools SHALL return explicit `recoverable` and `retryHint` on failure: `optimize_resume_section`, `evaluate_jd_full`, `analyze_jd_risks`, `decode_terms`.

#### Scenario: Empty CV section optimization
- **WHEN** `optimize_resume_section` handler detects section content < 20 characters
- **THEN** it MUST return `recoverable: false` with `retryHint` indicating the user should first populate the CV section

#### Scenario: JD evaluation API timeout
- **WHEN** `evaluate_jd_full` handler receives HTTP 504 or network error from the evaluation API
- **THEN** it MUST return `recoverable: true` with `retryHint` suggesting to retry with a shorter JD or different approach

#### Scenario: JD text too short for risk analysis
- **WHEN** `analyze_jd_risks` handler receives JD text < 20 characters
- **THEN** it MUST return `recoverable: false` with `retryHint` asking for the complete JD text
