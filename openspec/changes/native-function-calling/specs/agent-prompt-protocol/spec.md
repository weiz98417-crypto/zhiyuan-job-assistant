## MODIFIED Requirements

### Requirement: Agent SHALL output tool calls for data/action requests

When a user requests information or actions that map to an available tool, the agent SHALL invoke the tool via DeepSeek's native function calling API rather than outputting `<<TOOL>>` text markers. The system prompt SHALL NOT include `<<TOOL>>` format instructions.

#### Scenario: User requests application status

- **WHEN** user sends "查投递" or "我的投递进度"
- **THEN** DeepSeek SHALL respond with `finish_reason: "tool_calls"` and a `tool_calls` block for `search_applications`
- **AND** the agent SHALL NOT output `<<TOOL>>` text markers

#### Scenario: User requests JD evaluation

- **WHEN** user sends a JD text or URL for evaluation
- **THEN** DeepSeek SHALL respond with `finish_reason: "tool_calls"` invoking `evaluate_jd` or `evaluate_jd_full`

#### Scenario: User chats without needing tools

- **WHEN** user sends casual conversation ("你好", "今天怎么样")
- **THEN** DeepSeek SHALL respond with `finish_reason: "stop"` containing natural language text

## REMOVED Requirements

### Requirement: Parser SHALL tolerate LLM format variations

**Reason**: Native function calling API returns structured `tool_calls` objects, eliminating the need for regex-based parsing of LLM text output. Format variations (code fences, whitespace) are no longer relevant.
**Migration**: `parseToolCall()` and `parsePlan()` functions are removed. Client consumes `tool_calls` SSE events directly.

## REMOVED Requirements

### Requirement: System prompt SHALL include few-shot examples

**Reason**: Native function calling API handles tool invocation semantics. The model knows how to use tools from the API contract, not from few-shot text examples about `<<TOOL>>` syntax.
**Migration**: Remove few-shot examples from system prompt that demonstrate `<<TOOL>>` format. Keep domain-specific examples if they serve non-format purposes.
