# Agent Runtime deployment

The release remains inside the existing Alibaba Cloud ECS topology: Nginx exposes Web, PM2 supervises Web and the private Agent Worker, PostgreSQL stores Run state, and `current` is an atomic symlink to an immutable release.

## Filesystem contract

```text
/srv/zhiyuan/
  current -> releases/<release-id>
  releases/<release-id>/
  shared/agent-artifacts/
```

`AGENT_ARTIFACT_DIR` must resolve to `/srv/zhiyuan/shared/agent-artifacts` (or the equivalent `$APP_ROOT/shared/agent-artifacts`). The release and rollback scripts create and export this directory before preflight and PM2 reload. Both Web and Worker receive the same value from `ecosystem.config.cjs`; generated PDFs and other durable artifacts therefore survive release switches and rollback.

Required production values include `DB_DRIVER=postgres`, `DATABASE_URL`, `AGENT_ARTIFACT_DIR`, and an explicit `AGENT_RUNTIME_MODE`. Start at `shadow`, then promote stable cohorts through `worker_readonly` and `worker_all`. A mode change applies to new Runs; never hand an already Worker-owned Run to legacy execution.

## Release

Build and preflight a staged release before switching traffic:

```bash
./deploy/agent-runtime/release.sh /srv/zhiyuan /srv/zhiyuan/releases/20260824-180000
```

The release command installs dependencies, builds Web and the standalone Worker, backs up PostgreSQL, verifies the Worker artifact, Runtime schema, mode, and writable shared artifact directory, atomically switches `current`, reloads PM2 with updated environment, and checks the local Web health endpoint.

Do not run the preflight against a developer `.env.local` when it points at live PostgreSQL. Database integration and fault-injection tests require a dedicated disposable database.

## Rollback

Rollback always pauses new Worker claims first, switches `current` to an explicit prior release, reloads both PM2 processes, and runs the local canary:

```bash
./deploy/agent-runtime/rollback.sh /srv/zhiyuan /srv/zhiyuan/releases/20260823-220000
```

Do not restore PostgreSQL to an older snapshot for application rollback. The durable schema is additive, and already Worker-owned Runs must remain Worker-owned until they drain, reconcile, or finish.

## Operational checks

- Confirm both `zhiyuan-web` and `zhiyuan-agent-worker` are online in PM2.
- Alert when a running heartbeat is older than 45 seconds, outbox lag exceeds 60 seconds, critical dead-letter is non-zero, or the Worker repeatedly restarts.
- Use the Runtime Admin action to pause claims before maintenance; allow active Runs to checkpoint or enter reconciliation.
- Treat observer backlog as an operations issue, not a reason to change a Run result.
- Keep `shared/agent-artifacts` in backup and retention policy separately from immutable release cleanup.
