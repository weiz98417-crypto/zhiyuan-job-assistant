# Design: cutover-server-data-to-postgres

## Context

The current code mixes server SQLite APIs with client Dexie/localStorage fallback paths. This was useful for local-first development, but it undermines multi-user LAN consistency and makes agent memory unreliable.

## Goals / Non-Goals

**Goals:**

- Make PostgreSQL the selectable server source of truth.
- Keep SQLite selectable for rollback.
- Remove silent client fallback from authoritative workflows.
- Preserve current API response contracts where possible.

**Non-Goals:**

- Do not remove all client caching.
- Do not introduce vector search.
- Do not redesign UI pages unless required to handle cache/fetch errors clearly.

## Decisions

- Introduce repository-style database access around the current server DB functions before touching API routes broadly.
- Keep API response shapes stable so frontend behavior does not drift during cutover.
- Client local storage may cache recent data and drafts, but server data wins whenever authenticated.
- Errors must be visible. If PostgreSQL is selected and unavailable, the app should fail clearly rather than silently reading stale browser data.

## Risks / Trade-offs

- Many API routes import `getDb` directly -> mitigate with phased repository wrappers and focused route groups.
- LAN users may see stale cached data after cutover -> mitigate by cache invalidation and no-store fetches on authoritative pages.
- SQLite rollback complexity -> mitigate by keeping `DB_DRIVER=sqlite` path intact until PostgreSQL is stable.

## Migration Plan

1. Add repository wrappers for core entities.
2. Convert high-risk APIs first: auth/users, CV, reports, JDs, sessions.
3. Convert offer/interview/profile APIs.
4. Demote Dexie/localStorage fallback to cache/draft.
5. Run multi-user and regression tests under both drivers where feasible.

Rollback means setting `DB_DRIVER=sqlite` and using the pre-cutover SQLite database.
