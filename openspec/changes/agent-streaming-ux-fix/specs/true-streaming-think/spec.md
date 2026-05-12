## ADDED Requirements

### Requirement: LLM response streaming without full buffering

`collectThinkResponse` SHALL be refactored from a buffering function (`async function` that collects full response) to a streaming generator (`async function*`) that yields `text` chunks as soon as they arrive from the SSE stream. Tool call fragments SHALL still be accumulated and yielded as a final `tool_calls` event.

#### Scenario: Text chunk yielded immediately
- **WHEN** the think proxy SSE stream emits `{ type: "text", content: "🏁" }`
- **THEN** the generator SHALL immediately yield `{ type: "text", content: "🏁" }`

#### Scenario: Tool calls accumulated
- **WHEN** the think proxy emits multiple tool_call fragments across different SSE chunks
- **THEN** the generator SHALL accumulate them and yield `{ type: "tool_calls", tool_calls: [...] }` after the stream ends

#### Scenario: Generator returns final result
- **WHEN** the SSE stream completes
- **THEN** the generator SHALL `return { text: fullText, toolCalls: accumulatedCalls }` as the IteratorResult value

### Requirement: Preview loop removal

The 4-char/chunk preview loop (client-runner.ts lines 227-236) that yields LLM thinking text when `toolCalls.length > 0` SHALL be removed. Text is now streamed in real-time by `collectThinkResponseStreaming`.

#### Scenario: No duplicate text
- **WHEN** LLM thinks and then calls a tool
- **THEN** the thinking text SHALL appear exactly once in the chat (no duplicate from preview loop)
