# Agent Runtime deployment

The release remains inside the existing Alibaba Cloud ECS topology: Nginx exposes Web, PM2 supervises Web and the private Agent Worker, PostgreSQL stores Run state, and `current` is an atomic symlink to an immutable release.

## Server access

The production host is reached as `root@121.43.198.13` over the default SSH port. Nginx exposes the application at `https://121.43.198.13:38084`; the release scripts use the private local health endpoint `http://127.0.0.1:3100/login` after PM2 reload.

## Production filesystem contract

```text
/root/zhiyuan-job-assistant/
  current -> releases/<release-id>
  releases/<release-id>/
  shared/agent-artifacts/
  shared/secrets/production.env
```

`AGENT_ARTIFACT_DIR` must resolve to `/root/zhiyuan-job-assistant/shared/agent-artifacts` (or the equivalent `$APP_ROOT/shared/agent-artifacts`). The release and rollback scripts create and export this directory before preflight and PM2 reload. Both Web and Worker receive the same value from `ecosystem.config.cjs`; generated PDFs and other durable artifacts therefore survive release switches and rollback.

Set `shared/secrets` to mode `700` and `shared/secrets/production.env` to mode `600`. Each staged release links `.env.local` to this shared file, so Web and Worker receive the same secrets across release switches. Before the first release using this layout, create the shared file from the current production values and verify its database target and model key without printing either value. Also prepare the intended rollback release: its `.env.local` must point to the same shared file, or rollback stops before pausing the Worker. Required production values include `DB_DRIVER=postgres`, `DATABASE_URL`, `DEEPSEEK_API_KEY`, `AGENT_ARTIFACT_DIR`, and `AGENT_RUNTIME_MODE=worker_all`. The release preflight fails before switching traffic if the Worker model key is missing or contains the example placeholder. Never hand an already Worker-owned Run to legacy execution.

## Release

Apply the staged release's additive Postgres schema in a controlled maintenance window before switching traffic. Load `DATABASE_URL` from the verified shared production environment into the shell before running `psql`; do not reuse a value left in the deployment shell. The release script verifies the schema but never mutates it:

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
  -f /root/zhiyuan-job-assistant/releases/<release-id>/src/lib/postgres-schema.sql
```

Then build and preflight the staged release before switching traffic:

```bash
bash deploy/agent-runtime/release.sh /root/zhiyuan-job-assistant /root/zhiyuan-job-assistant/releases/<release-id>
```

The release command installs dependencies, builds Web and the standalone Worker, backs up PostgreSQL with owner-only file permissions, verifies the Worker artifact, complete Runtime schema, mode, and writable shared artifact directory, atomically switches `current`, reloads PM2 with updated environment, and checks the local Web health endpoint. Values in the shared production environment take precedence over values inherited from the deployment shell.

Do not run the preflight against a developer `.env.local` when it points at live PostgreSQL. Database integration and fault-injection tests require a dedicated disposable database.

## Rollback

Rollback always pauses new Worker claims first, switches `current` to an explicit prior release, reloads both PM2 processes, and runs the local canary:

```bash
bash deploy/agent-runtime/rollback.sh /root/zhiyuan-job-assistant /root/zhiyuan-job-assistant/releases/<previous-release>
```

Do not restore PostgreSQL to an older snapshot for application rollback. The durable schema is additive, and already Worker-owned Runs must remain Worker-owned until they drain, reconcile, or finish.

## Operational checks

- Confirm both `zhiyuan-web` and `zhiyuan-agent-worker` are online in PM2.
- Alert when a running heartbeat is older than 45 seconds, outbox lag exceeds 60 seconds, critical dead-letter is non-zero, or the Worker repeatedly restarts.
- Use the Runtime Admin action to pause claims before maintenance; allow active Runs to checkpoint or enter reconciliation.
- Treat observer backlog as an operations issue, not a reason to change a Run result.
- Keep `shared/agent-artifacts` in backup and retention policy separately from immutable release cleanup.
