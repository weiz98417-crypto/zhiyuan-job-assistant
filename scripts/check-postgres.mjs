#!/usr/bin/env node

import { Pool } from "pg";

const databaseUrl = (process.env.DATABASE_URL || "").trim();

if (!databaseUrl) {
  console.error("DATABASE_URL is not configured.");
  console.error("Set DATABASE_URL to a PostgreSQL instance before running this check.");
  process.exit(1);
}

const pool = new Pool({
  connectionString: databaseUrl,
  max: Number(process.env.POSTGRES_MAX_CONNECTIONS || 5),
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});

async function main() {
  const client = await pool.connect();
  try {
    const health = await client.query("SELECT 1 AS ok");
    if (health.rowCount !== 1) {
      throw new Error("PostgreSQL health query returned no rows");
    }

    await client.query("CREATE EXTENSION IF NOT EXISTS vector");
    const ext = await client.query("SELECT extname FROM pg_extension WHERE extname = 'vector'");
    if (ext.rowCount === 0) {
      throw new Error("pgvector extension is not available");
    }

    console.log("PostgreSQL connection OK");
    console.log("pgvector extension OK");
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
