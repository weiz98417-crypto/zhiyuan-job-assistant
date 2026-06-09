import fs from "fs";
import path from "path";
import { Pool, type PoolClient, type PoolConfig } from "pg";

const DEFAULT_SCHEMA_PATH = path.join(process.cwd(), "src", "lib", "postgres-schema.sql");
const DEFAULT_MAX_CONNECTIONS = 5;

let pool: Pool | null = null;

export type DatabaseDriver = "sqlite" | "postgres";

export function getDatabaseDriver(): DatabaseDriver {
  return (process.env.DB_DRIVER || "sqlite").trim().toLowerCase() === "postgres" ? "postgres" : "sqlite";
}

export function isPostgresConfigured(): boolean {
  return Boolean((process.env.DATABASE_URL || "").trim());
}

function getPoolConfig(): PoolConfig {
  const connectionString = (process.env.DATABASE_URL || "").trim();
  if (!connectionString) {
    throw new Error("DATABASE_URL is not configured");
  }

  return {
    connectionString,
    max: Number(process.env.POSTGRES_MAX_CONNECTIONS || DEFAULT_MAX_CONNECTIONS),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  };
}

export function getPostgresPool(): Pool {
  if (!pool) {
    pool = new Pool(getPoolConfig());
  }
  return pool;
}

export async function getPostgresClient(): Promise<PoolClient> {
  return getPostgresPool().connect();
}

export function getPostgresSchemaPath(): string {
  return process.env.POSTGRES_SCHEMA_PATH?.trim() || DEFAULT_SCHEMA_PATH;
}

export function loadPostgresSchema(schemaPath = getPostgresSchemaPath()): string {
  if (!fs.existsSync(schemaPath)) {
    throw new Error(`PostgreSQL schema file not found: ${schemaPath}`);
  }
  return fs.readFileSync(schemaPath, "utf-8");
}

export async function checkPostgresHealth() {
  if (!isPostgresConfigured()) {
    return {
      ok: false,
      skipped: true,
      message: "DATABASE_URL is not configured",
    };
  }

  const client = await getPostgresClient();
  try {
    await client.query("SELECT 1 AS ok");
    await client.query("CREATE EXTENSION IF NOT EXISTS vector");
    const vectorResult = await client.query("SELECT extname FROM pg_extension WHERE extname = 'vector'");
    return {
      ok: true,
      skipped: false,
      pgvector: Boolean(vectorResult.rowCount && vectorResult.rowCount > 0),
      schemaPath: getPostgresSchemaPath(),
    };
  } finally {
    client.release();
  }
}

export async function bootstrapPostgresSchema(schemaPath = getPostgresSchemaPath()) {
  const schema = loadPostgresSchema(schemaPath);
  const client = await getPostgresClient();
  try {
    await client.query("CREATE EXTENSION IF NOT EXISTS vector");
    await client.query(schema);
  } finally {
    client.release();
  }
}

export async function withPostgresClient<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPostgresClient();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}
