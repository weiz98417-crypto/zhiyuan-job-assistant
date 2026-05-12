## ADDED Requirements

### Requirement: Streaming tools return ReadableStream instead of reading it

When a tool handler needs to stream intermediate progress events (like per-block evaluation status), the handler SHALL open the SSE connection but NOT read the response body. Instead, the handler SHALL return the `ReadableStream` attached to `ToolResult.data._stream` with the `_streaming` flag set to `true`.

#### Scenario: evaluate_jd_full returns stream
- **WHEN** the evaluate_jd_full tool handler is called with valid jd_text
- **THEN** it SHALL call `/api/evaluate/stream` and return `{ success: true, data: { _stream: response.body }, _streaming: true }`

#### Scenario: evaluate_jd_full on HTTP error
- **WHEN** `/api/evaluate/stream` returns a non-2xx status
- **THEN** the handler SHALL return `{ success: false, error: "评估管道启动失败: HTTP {status}", recoverable: true, retryHint: "..." }`

### Requirement: Client-runner reads stream and yields events

The client-runner generator SHALL check for `_streaming` flag on tool results. When a stream is present, it SHALL read the SSE stream chunk by chunk, parse each event, and yield it through the generator loop. The stream reading SHALL happen inside a `try/finally` block that guarantees `reader.releaseLock()` is called.

#### Scenario: Stream events forwarded to UI
- **WHEN** the stream emits `{ type: "block_start", block: "a", label: "A·职位概览" }`
- **THEN** the client-runner SHALL yield `{ type: "block_start", block: "a", label: "A·职位概览" }`

#### Scenario: Stream aborted by user
- **WHEN** the AbortSignal is triggered during stream reading
- **THEN** the client-runner SHALL call `reader.cancel()` and break the read loop

#### Scenario: Final data extracted from done event
- **WHEN** the stream emits `{ type: "done", company: "字节", role: "AI PM", overallScore: 4.2, blocks: {...} }`
- **THEN** the client-runner SHALL extract these fields as finalData (checking `event.company` not `event.data`)

### Requirement: Stream lifecycle safety

The ReadableStream reading loop SHALL use `try/finally` to ensure `reader.releaseLock()` is always called. The reader SHALL be cancelled when `signal.aborted` is true.

#### Scenario: Release lock on error
- **WHEN** an exception occurs during stream reading (e.g., JSON parse error from malformed SSE)
- **THEN** `reader.releaseLock()` SHALL still be called in the finally block
