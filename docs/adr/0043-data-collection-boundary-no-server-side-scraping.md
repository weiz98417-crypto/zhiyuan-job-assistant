# 0043 - Data collection boundary: server-side scraping is permanently out; local-credential collectors are optional enhancements

Date: 2026-10-03

## Status

Accepted

## Context

The question bank needs fresh interview-experience data (面经) and the salary benchmark needs plaintext salary data. The Chinese market has no open dataset for either (OfferShow and peers are closed apps; no maintained open-source Chinese salary corpus exists). Collecting from nowcoder, maimai or Boss Zhipin violates those platforms' terms of service, and this is a company product carrying company liability, not a personal tool. The boss-zhipin-scraper pattern (Chrome CDP riding the user's own logged-in session, calling the platform API to get plaintext salary) is proven engineering, but shifts ToS exposure to wherever it runs.

## Decision

1. **Server-side collection of third-party platform pages is permanently out of scope** for the product. Future contributors must not add it without reopening this ADR.
2. **First-party path first**: the job-discovery opportunity pool already holds JD text the product legitimately obtained. Salary ranges are extracted from that text deterministically (regex, in the same spirit as the JD risk engine) into structured fields and aggregated into salary benchmark entries.
3. **A user-local collector** (running on the user's machine with the user's own login state, e.g. as an MCP tool attached to the agent kernel) is an optional future enhancement — explicitly not part of the core product, built only when real user demand appears.

## Consequences

Train j (salary benchmark) is not blocked by ToS concerns and ships on first-party data only; early benchmark quality is bounded by the opportunity pool's own volume, and static seed entries (risk-intel's 46 rows) remain labeled fallbacks. The 面经 freshness gap in train i is covered initially by LLM-seeded questions with provenance labels; a user-local 面经 collector may follow under clause 3. Platform-facing legal exposure stays avoided.
