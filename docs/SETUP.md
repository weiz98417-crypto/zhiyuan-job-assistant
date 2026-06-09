# Setup Guide

## Prerequisites

- Node.js 20+ recommended.
- npm.
- At least one chat/evaluation model key, normally `DEEPSEEK_API_KEY`.
- `ZHIPU_API_KEY` for screenshot OCR/vision.
- A 32+ character `JWT_SECRET` for login sessions.
- Optional: PostgreSQL with pgvector for the new memory/database path.

## Local Setup

```bash
git clone https://github.com/weiz98417-crypto/zhiyuan-job-assistant.git
cd zhiyuan-job-assistant
npm install
cp .env.example .env.local
```

Edit `.env.local`:

```bash
DEEPSEEK_API_KEY=sk-...
ZHIPU_API_KEY=...
JWT_SECRET=replace-with-a-random-32-char-secret
```

Optional integrations:

```bash
SERPAPI_API_KEY=...
BAIDU_MAP_API_KEY=...
ZHIPU_VISION_MODEL=glm-5v-turbo
```

Run checks and start the app:

```bash
npm run doctor
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## First Admin And LAN Users

1. Register the first account from `/register`.
2. The first account becomes `admin` automatically if there is no active admin.
3. Later users register as `pending`.
4. Admin approves or rejects users from `/admin/users`.

For LAN testing on Windows:

```powershell
.\start-lan.ps1
```

Give colleagues the LAN URL printed by the script. Keep `.env.local` only on the server machine.

## Screenshot OCR

JD/offer/resume screenshots require:

```bash
ZHIPU_API_KEY=...
ZHIPU_VISION_MODEL=glm-5v-turbo
```

The image intake flow classifies image content before routing:

| Image content | User intent | Result |
| --- | --- | --- |
| JD | Evaluate JD | OCR then `evaluate_jd_full`. |
| Offer | Evaluate offer | OCR then `evaluate_offer`. |
| Resume | Save/import resume | Ask confirmation before saving. |
| Mismatch | Example: JD request + offer image | Ask clarification. |
| Unrelated | Any | Explain image content and ask for job-search intent. |

## Excellent Resume Memory

Users can say things like "把这份简历保存成优秀简历". If the role is missing, the agent asks which role category to use. If the user says "保存成 AI 产品经理优秀简历", it can save directly with that explicit role.

Team sharing has an approval gate:

1. User requests team sharing.
2. Reference becomes `team_pending`.
3. Admin reviews it from `/admin/memory`.
4. Only approved `team` references can be retrieved by other users.

## PostgreSQL And pgvector

SQLite is the default:

```bash
DB_DRIVER=sqlite
```

Prepare PostgreSQL:

```bash
DATABASE_URL=postgresql://user:password@localhost:5432/zhiyuan
POSTGRES_SCHEMA_PATH=src/lib/postgres-schema.sql
npm run check:postgres
```

Copy SQLite data into PostgreSQL:

```bash
npm run migrate:postgres -- --dry-run --default-owner admin --report reports/postgres-migration-dry-run.md
npm run migrate:postgres -- --apply --default-owner admin --report reports/postgres-migration-apply.md
npm run check:postgres-migration -- --default-owner admin --report reports/postgres-migration-verify.md
```

Switch only after verification passes:

```bash
DB_DRIVER=postgres
DATABASE_URL=postgresql://user:password@localhost:5432/zhiyuan
```

See [POSTGRES_MIGRATION.md](POSTGRES_MIGRATION.md) for backup, rollback, and excluded-table details.

## Embeddings

For Alibaba Cloud Bailian compatible embeddings:

```bash
MEMORY_EMBEDDING_PROVIDER=openai-compatible
MEMORY_EMBEDDING_API_URL=https://dashscope.aliyuncs.com/compatible-mode/v1/embeddings
MEMORY_EMBEDDING_MODEL=text-embedding-v4
MEMORY_EMBEDDING_DIMENSION=1536
MEMORY_EMBEDDING_API_KEY=...
```

Check provider connectivity:

```bash
npm run smoke:embedding
```

## Verification

```bash
npm run test
npm run eval:memory
npm run build
```

For TypeScript only:

```bash
npx tsc --noEmit
```

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Login spins or fails | Confirm `/api/auth/login` returns JSON and `JWT_SECRET` is set. |
| User approval returns 401 | Re-login as admin and verify token version/session cookie. |
| Screenshot OCR says format error | Confirm the uploaded file is the original image, not a tiny chat thumbnail; verify `ZHIPU_API_KEY`. |
| OCR rate limited | Wait and retry, or paste text/link; check provider quota. |
| PostgreSQL routes fail | Run `npm run check:postgres` and confirm `DB_DRIVER`/`DATABASE_URL`. |
| Memory retrieval empty | Run `npm run eval:memory`; if provider-backed, run `npm run smoke:embedding`. |
