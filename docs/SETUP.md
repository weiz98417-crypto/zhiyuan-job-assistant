# Setup Guide

## Prerequisites

- Node.js 20+ recommended.
- npm.
- At least one chat/evaluation model key, normally `DEEPSEEK_API_KEY`.
- `ZHIPU_API_KEY` for screenshot OCR/vision.
- A 32+ character `JWT_SECRET` for login sessions.
- PostgreSQL with pgvector for the current LAN runtime and long-term memory path.
- SQLite is still available as a local fallback/archive path.

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

## Resume PDF And DOCX Extraction With MinerU

Resume file import no longer uses DashScope `qwen-long` for PDF/DOC/DOCX extraction. The runtime path is:

```text
text PDF -> local pdf-parse text extraction -> DeepSeek section classification
scanned/empty/garbled PDF -> MinerU pipeline -> DeepSeek section classification
DOCX -> mammoth text extraction -> MinerU only if empty/garbled -> DeepSeek section classification
legacy DOC -> clear conversion-required error unless a local converter is configured
images -> existing Zhipu vision path
```

Install MinerU locally under the project copy the user placed at `C:\Users\Admin\Documents\求职\zhiyuan-job-assistant-master\MinerU-master`:

```powershell
cd C:\Users\Admin\Documents\求职\zhiyuan-job-assistant-master\MinerU-master
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -U pip
.\.venv\Scripts\pip.exe install -e ".[all]"
.\.venv\Scripts\mineru-models-download.exe -s huggingface -m pipeline
```

Only the MinerU `pipeline` models are required for this project path:

```text
models/Layout/PP-DocLayoutV2
models/MFR/unimernet_hf_small_2503
models/OCR/paddleocr_torch
models/TabRec/SlanetPlus/slanet-plus.onnx
models/TabRec/UnetStructure/unet.onnx
models/TabCls/paddle_table_cls/PP-LCNet_x1_0_table_cls.onnx
models/MFR/pp_formulanet_plus_m
```

Set these variables in `.env.local`:

```powershell
MINERU_EXECUTABLE=C:\Users\Admin\Documents\求职\zhiyuan-job-assistant-master\MinerU-master\.venv\Scripts\mineru.exe
MINERU_MODEL_SOURCE=local
MINERU_TOOLS_CONFIG_JSON=C:\Users\Admin\mineru.json
MINERU_EXTRACTION_TIMEOUT_MS=180000
```

`MINERU_TOOLS_CONFIG_JSON` points to the config written by the MinerU model download command. If MinerU is missing or too slow, CV import returns structured error codes such as `mineru_not_configured`, `mineru_timeout`, `document_text_empty`, `document_text_garbled`, or `doc_conversion_unavailable`; it does not silently fall back to qwen-long.

## Excellent Resume Memory

Users can say things like "把这份简历保存成优秀简历". If the role is missing, the agent asks which role category to use. If the user says "保存成 AI 产品经理优秀简历", it can save directly with that explicit role.

Team sharing has an approval gate:

1. User requests team sharing.
2. Reference becomes `team_pending`.
3. Admin reviews it from `/admin/memory`.
4. Only approved `team` references can be retrieved by other users.

## PostgreSQL And pgvector

The current LAN deployment uses PostgreSQL/pgvector:

```bash
DB_DRIVER=postgres
DATABASE_URL=postgresql://user:password@localhost:5432/zhiyuan
```

Prepare PostgreSQL:

```bash
POSTGRES_SCHEMA_PATH=src/lib/postgres-schema.sql
npm run check:postgres
```

Copy SQLite data into PostgreSQL:

```bash
npm run migrate:postgres -- --dry-run --default-owner admin --report reports/postgres-migration-dry-run.md
npm run migrate:postgres -- --apply --default-owner admin --report reports/postgres-migration-apply.md
npm run check:postgres-migration -- --default-owner admin --report reports/postgres-migration-verify.md
```

After migration and verification, confirm cutover:

```bash
DB_DRIVER=postgres
DATABASE_URL=postgresql://user:password@localhost:5432/zhiyuan
npm run check:postgres-cutover
```

For lightweight local fallback only, use:

```bash
DB_DRIVER=sqlite
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
