# 0040 - Agent traces store metadata only in production

Date: 2026-10-01

## Status

Accepted

## Context

The 2026-10 review adopted agent observability: model calls in ModelGateway currently record nothing (no tokens, no latency), and Run Evidence is visible only as a flat events table. A trace model shaped like Langfuse's trace→observations tree, named with OTel GenAI conventions, was chosen. The production host is a single ECS without Docker, so self-hosting Langfuse now is not practical. Prompts and completions carry resume and job-seeking personal data, while memory erasure governance does not cover trace storage.

## Decision

1. Traces are recorded in the application's own Postgres as additive tables shaped like Langfuse (trace → observations tree; generations carry model, token usage, latency, finish reason) and rendered in the admin panel. An OpenTelemetry-shaped export point is reserved, so a self-hosted Langfuse can be attached later by changing only the exporter.
2. Production stores metadata only: model identity, token counts, latency, tool names, error summaries. Prompt and completion content is stored in development environments only, and never in production trace tables. Personal data therefore stays out of a store that memory erasure does not govern.
3. Token usage capture is added to ModelGateway as part of this work.

## Consequences

Content-level debugging must happen against development data. If trace content is ever enabled in production, erasure governance must be extended to trace tables first. Langfuse self-host and Langfuse Cloud were rejected for now (no Docker on the host; data leaves the operator's control respectively); the shape-compatible tables keep both doors open at exporter cost only.
