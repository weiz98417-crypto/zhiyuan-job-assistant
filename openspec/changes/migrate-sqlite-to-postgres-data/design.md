# Design: migrate-sqlite-to-postgres-data

## Context

SQLite currently contains user accounts, reports, JDs, sessions, CV data, offer reports, profile signals, preferences, scan jobs, and interview-related data. Several older rows may have nullable `user_id` because multi-user auth was added after initial data existed.

## Goals / Non-Goals

**Goals:**

- Migrate current durable SQLite data into PostgreSQL.
- Preserve public identifiers such as `report_num`.
- Preserve JSON payloads exactly unless a documented type conversion is required.
- Produce a verification report that the user can inspect before cutover.

**Non-Goals:**

- Do not change the app runtime driver.
- Do not generate embeddings.
- Do not clean profile quality during migration beyond lossless normalization.

## Decisions

- Migration runs from SQLite read-only into PostgreSQL transactions. This avoids corrupting the old database and makes failures recoverable.
- Migration order follows ownership and foreign-key dependencies: users first, then profiles/CV, applications, reports, JDs, offers, sessions, stories, signals, preferences, memory.
- Null `user_id` rows require an explicit migration owner. For a single-user legacy DB, the script may assign them to a chosen admin/default user and log every assignment.
- Scripts must support `--dry-run`, `--apply`, and `--verify-only`.
- Migration must be idempotent by using stable keys and upsert rules where safe.

## Risks / Trade-offs

- Hidden JSON shape differences -> mitigate by sampling and JSON parsing validation.
- Duplicate uniqueness rules change from global to per-user -> mitigate by reporting conflicts before applying.
- Rows with missing users -> mitigate by requiring a default owner argument or failing fast.

## Migration Plan

1. Backup `data/zhiyuan.db`.
2. Run dry-run and inspect counts/conflicts.
3. Apply migration into PostgreSQL.
4. Run verification and export a report.
5. Keep SQLite untouched as rollback source.

Rollback means switching runtime back to SQLite or dropping/recreating the PostgreSQL database before cutover.
