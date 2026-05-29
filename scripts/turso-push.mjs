/**
 * Push local SQLite → Turso. Called periodically or on shutdown.
 * Usage: node scripts/turso-push.mjs
 */
import { createClient } from "@libsql/client";
import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const TURSO_URL = process.env.TURSO_URL;
const TURSO_TOKEN = process.env.TURSO_TOKEN;

if (!TURSO_URL || !TURSO_TOKEN) process.exit(0);

const DATA_DIR = process.env.DATA_DIR || path.join(ROOT, "data");
const DB_PATH = path.join(DATA_DIR, "zhiyuan.db");

if (!fs.existsSync(DB_PATH)) process.exit(0);

const turso = createClient({ url: TURSO_URL, authToken: TURSO_TOKEN });
const local = new Database(DB_PATH, { readonly: true });

try {
  const tables = local.prepare(
    "SELECT name, sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
  ).all();

  for (const { name: table, sql } of tables) {
    // Ensure table exists on Turso
    if (sql) {
      try { await turso.execute(sql); } catch { /* exists */ }
    }

    // Push rows
    const rows = local.prepare(`SELECT * FROM "${table}"`).all();
    if (rows.length === 0) continue;

    const cols = Object.keys(rows[0]);
    const ph = cols.map(() => "?").join(",");
    const cn = cols.map(c => `"${c}"`).join(",");

    for (const row of rows) {
      try {
        await turso.execute({
          sql: `INSERT OR REPLACE INTO "${table}" (${cn}) VALUES (${ph})`,
          args: cols.map(c => row[c]),
        });
      } catch { /* skip row */ }
    }
  }

  console.log(`[turso] Pushed ${tables.length} tables`);
} catch (e) {
  console.error("[turso] Push failed:", e.message);
} finally {
  local.close();
}
