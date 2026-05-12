## ADDED Requirements

### Requirement: Think proxy SHALL accept and forward native tool definitions

`/api/agent/think` SHALL accept an optional `tools` parameter in the request body containing an array of OpenAI-compatible function definitions. When present, the proxy SHALL include `tools` in the forwarded DeepSeek API request body.

#### Scenario: Tools passed to DeepSeek

- **WHEN** client POSTs `{ systemPrompt, messages, tools: [{ type: "function", function: { name: "evaluate_jd_full", ... } }] }`
- **THEN** the DeepSeek API request SHALL include the `tools` field with the same array
- **AND** the request remains a valid streaming chat completion

#### Scenario: No tools provided

- **WHEN** client POSTs `{ systemPrompt, messages }` without `tools`
- **THEN** the DeepSeek API request SHALL NOT include a `tools` field
- **AND** the proxy behaves identically to the pre-native-tool-calling version

### Requirement: Think proxy SHALL parse streaming tool_call deltas

When DeepSeek returns `choices[0].delta.tool_calls[]` in the streaming response, the think proxy SHALL accumulate fragments by `index` field and emit a single `tool_calls` SSE event after the stream ends.

#### Scenario: Single tool call

- **WHEN** DeepSeek streams a single tool call with `id`, `function.name`, and `function.arguments` across multiple deltas
- **THEN** the proxy accumulates all fragments into one `{ id, name, arguments }` object
- **AND** emits `{ type: "tool_calls", tool_calls: [{ id: "...", name: "...", arguments: "{\"key\":\"value\"}" }] }` as the final SSE event before `done`

#### Scenario: Text and tool call in same response

- **WHEN** DeepSeek streams both text content and tool calls
- **THEN** text content SHALL be streamed as `{ type: "text", content: "..." }` events normally
- **AND** tool calls SHALL be accumulated and emitted as a `tool_calls` event after all text chunks

#### Scenario: No tool calls

- **WHEN** DeepSeek streams only text content with no `delta.tool_calls`
- **THEN** no `tool_calls` SSE event SHALL be emitted
- **AND** the stream ends with `done` as before

### Requirement: ToolRegistry SHALL serialize to OpenAI-compatible format

`ToolRegistry` SHALL provide a `toOpenAITools()` method that converts registered tool definitions to the OpenAI/DeepSeek `tools` array format.

#### Scenario: Tool with required and optional parameters

- **WHEN** a tool has `{ jd_text: { type: "string", required: true }, language: { type: "string", required: false } }`
- **THEN** the output SHALL include `"required": ["jd_text"]`
- **AND** `language` SHALL appear in `properties` but NOT in `required`

#### Scenario: Empty registry

- **WHEN** no tools are registered
- **THEN** `toOpenAITools()` SHALL return an empty array `[]`
