# Spec: Stream Fallback

## Purpose

TBD — ensures AI streaming responses degrade gracefully when structured output cannot be parsed.

## ADDED Requirements

### Requirement: Stream raw content fallback

The coach streaming system SHALL emit AI output as a raw section when the structured format cannot be parsed.

#### Scenario: AI returns unstructured content

- **WHEN** the AI returns content that does not match any `<<SECTION>>...<</SECTION>>` tag pattern
- **AND** the stream reaches its end (DeepSeek `[DONE]` marker)
- **THEN** the server SHALL emit a single `section` SSE event with `key: "raw"`, `label: "AI 反馈"`, and the full accumulated buffer as `content`

#### Scenario: AI returns properly structured content

- **WHEN** the AI returns content matching `<<SECTION>>...<</SECTION>>` tags
- **THEN** each section SHALL be emitted as a separate SSE `section` event as sections are completed
- **AND** no raw fallback SHALL be emitted

#### Scenario: Empty AI response

- **WHEN** the AI returns empty content (no delta with actual text)
- **THEN** the server SHALL emit a `done` event with no sections
- **AND** the client SHALL display an error message: "AI 未返回有效内容，请重试"

### Requirement: Unified SSE streaming architecture

All structured SSE streaming SHALL use a shared chunk-reading and line-buffering implementation from `stream-utils.ts`.

#### Scenario: Coach stream uses shared infrastructure

- **WHEN** the `/api/interview/coach/stream` endpoint processes a streaming request
- **THEN** it SHALL use `createStructuredStream` or an extended variant for the fetch + chunk + line-buffer loop
- **AND** it SHALL NOT duplicate the fetch/chunk/buffer logic inline

### Requirement: Relaxed section format

The coach system prompt SHALL use `<<SECTION>>` format (without `_key` suffix and `##` separator) for AI output formatting.

#### Scenario: AI outputs sections in simplified format

- **WHEN** the AI generates sectioned output
- **THEN** the format SHALL be `<<SECTION>>\n内容（可含 markdown heading 作为标题）\n<</SECTION>>`
- **AND** the server regex SHALL match `<<SECTION>>([\s\S]*?)<</SECTION>>` to extract section content
- **AND** section keys SHALL be derived from markdown headings within the content (e.g., `### 背景` → key `background`)
