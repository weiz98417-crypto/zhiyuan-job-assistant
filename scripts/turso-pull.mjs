/**
 * Pull Turso → local SQLite. Runs before `next start`.
 * Usage: node scripts/turso-pull.mjs
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

if (!TURSO_URL || !TURSO_TOKEN) {
  console.log("[turso] TURSO_URL/TURSO_TOKEN not set, skipping pull");
  process.exit(0);
}

const DATA_DIR = process.env.DATA_DIR || path.join(ROOT, "data");
const DB_PATH = path.join(DATA_DIR, "zhiyuan.db");

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

// If local DB has users, skip pull
if (fs.existsSync(DB_PATH)) {
  try {
    const local = new Database(DB_PATH, { readonly: true });
    const cnt = local.prepare("SELECT COUNT(*) as cnt FROM users").get();
    local.close();
    if (cnt && cnt.cnt > 0) {
      console.log("[turso] Local DB has data, skipping pull");
      process.exit(0);
    }
  } catch { /* corrupt */ }
}

console.log("[turso] Pulling from Turso...");
const turso = createClient({ url: TURSO_URL, authToken: TURSO_TOKEN });

try {
  const tables = (await turso.execute(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE '_cf%' AND name NOT LIKE 'libsql%'"
  )).rows.map(r => r.name);

  if (tables.length === 0) {
    console.log("[turso] Turso is empty, starting fresh");
    process.exit(0);
  }

  const local = new Database(DB_PATH);
  local.pragma("journal_mode = WAL");
  local.pragma("foreign_keys = ON");

  let pulled = 0;
  for (const table of tables) {
    // Create table
    const cr = await turso.execute("SELECT sql FROM sqlite_master WHERE type='table' AND name = ?", [table]);
    if (cr.rows[0]?.sql) {
      try { local.exec(cr.rows[0].sql); } catch { /* exists */ }
    }

    // Copy rows
    try {
      const rows = await turso.execute(`SELECT * FROM "${table}"`);
      if (rows.rows.length === 0) continue;
      const cols = Object.keys(rows.rows[0]);
      const ph = cols.map(() => "?").join(",");
      const cn = cols.map(c => `"${c}"`).join(",");
      const stmt = local.prepare(`INSERT OR IGNORE INTO "${table}" (${cn}) VALUES (${ph})`);
      const tx = local.transaction(() => {
        for (const row of rows.rows) {
          stmt.run(...cols.map(c => row[c]));
        }
      });
      tx();
      pulled += rows.rows.length;
    } catch (e) {
      console.warn(`[turso] Table ${table}: ${e.message.slice(0, 60)}`);
    }
  }

  local.close();
  console.log(`[turso] Pulled ${tables.length} tables, ${pulled} rows`);
} catch (e) {
  console.error("[turso] Pull failed:", e.message);
}
