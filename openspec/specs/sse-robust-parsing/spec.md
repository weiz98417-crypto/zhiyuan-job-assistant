# Spec: SSE Robust Parsing

## Purpose

Ensure the SSE stream parser reliably processes streaming responses from the DeepSeek API, correctly handling chunk boundaries, partial data lines, and structured section tags that may arrive in fragmented form.

## Requirements

### Requirement: SSE stream parser handles chunk boundaries

The SSE stream parser SHALL correctly reassemble partial data lines that are split across chunk boundaries from the DeepSeek streaming API.

#### Scenario: Data line split across two chunks

- **WHEN** a chunk ends with a partial `data:` line and the next chunk completes it
- **THEN** the parser SHALL concatenate the fragment with the next chunk before attempting JSON parse
- **AND** no content SHALL be lost

#### Scenario: Multiple SSE events in a single chunk

- **WHEN** a single chunk contains multiple complete SSE events separated by `\n\n`
- **THEN** the parser SHALL extract and process each event individually

#### Scenario: Empty or whitespace-only chunk

- **WHEN** a chunk contains only whitespace or newlines
- **THEN** the parser SHALL skip it without error

### Requirement: Structured section extraction tolerates partial tags

The section extraction SHALL handle `<<SECTION_<key>>##` tags that arrive in partial chunks by deferring incomplete tag matches.

#### Scenario: Section tag split across chunks

- **WHEN** the buffer contains `<<SECT` at chunk boundary and the next chunk completes `ION_analysis>>## 分析\n...content...<<\/SECTION_analysis>>`
- **THEN** the full section SHALL be emitted with correct key, label, and content once the closing tag arrives

#### Scenario: Multiple sections in stream

- **WHEN** the model outputs 3 complete sections
- **THEN** the parser SHALL emit 3 separate `section` SSE events, each with unique key

#### Scenario: Section content contains newlines

- **WHEN** section body contains multiple paragraphs separated by newlines
- **THEN** the regex SHALL capture all content between opening and closing tags
