# Documentation Index

Start here when you need to understand, run, or change Zhiyuan.

## Core Docs

| Document | Use it for |
| --- | --- |
| [../README.md](../README.md) | Product overview, quick start, and high-level capabilities. |
| [PRD.md](PRD.md) | Detailed product requirements, module map, Agent governance, eval gates, and loop engineering goals. |
| [course-system/README.md](course-system/README.md) | Full course system built from the project: requirements, POC, multi-agent architecture, evals, page collaboration, auth, privacy, and safety. |
| [SETUP.md](SETUP.md) | Local setup, LAN testing, auth, OCR, PostgreSQL, and embeddings. |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Runtime architecture, Agent loop, data layer, image intake, and memory. |
| [SCRIPTS.md](SCRIPTS.md) | npm scripts and operational commands. |

## Operations

| Document | Use it for |
| --- | --- |
| [POSTGRES_MIGRATION.md](POSTGRES_MIGRATION.md) | SQLite to PostgreSQL migration runbook. |
| [MEMORY_EVALS.md](MEMORY_EVALS.md) | Long-term memory evals and embedding smoke checks. |
| [agent-interaction-review.md](agent-interaction-review.md) | Root-cause notes for Agent output/routing regressions. |

## Evolution Notes

The `docs/evolution/` files describe product modules and earlier design decisions. The most relevant current entries are:

| Document | Topic |
| --- | --- |
| [evolution/11-Agent聊天页-完整功能拆解.md](evolution/11-Agent聊天页-完整功能拆解.md) | Agent chat UI and interaction model. |
| [evolution/17-Agent工具生态.md](evolution/17-Agent工具生态.md) | Tooling ecosystem. |
| [evolution/18-服务端Agent-Loop.md](evolution/18-服务端Agent-Loop.md) | Server-side Agent loop. |
| [evolution/19-分层记忆系统.md](evolution/19-分层记忆系统.md) | Layered memory model. |
| [evolution/21-面试模拟引擎.md](evolution/21-面试模拟引擎.md) | Interview coach engine. |

## OpenSpec Changes

Implementation plans live under `openspec/changes/`. This PR includes plans for:

- PostgreSQL + pgvector foundation.
- SQLite to PostgreSQL migration.
- Server data repository cutover.
- Vector long-term memory.
- Agent memory integration.
- Memory eval harness.
- Memory feedback promotion.
- Admin memory governance.
- Hardened memory and tool policy.

Keep docs and OpenSpec changes aligned when a task changes runtime behavior, data schema, or user-facing workflow.
