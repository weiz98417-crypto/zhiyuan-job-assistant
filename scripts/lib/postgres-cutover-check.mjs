import fs from "fs";
import path from "path";
import {
  DEFAULT_SQLITE_PATH,
  MIGRATION_TABLES,
  createPostgresPool,
  formatVerificationReport,
  getTableCount,
  openSqlite,
  verifyMigration,
} from "./sqlite-postgres-migration.mjs";

const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".mjs", ".js"]);

const DEFAULT_SCAN_ROOTS = [
  path.join(process.cwd(), "src", "app"),
  path.join(process.cwd(), "src", "lib"),
];

const SQLITE_IMPORT_PATTERNS = [
  { kind: "better-sqlite3", pattern: /from\s+["']better-sqlite3["']|import\s+Database\s+from\s+["']better-sqlite3["']/ },
  { kind: "getDb-call", pattern: /\bgetDb\s*\(/ },
];

const SQLITE_RUNTIME_ALLOWLIST = new Map([
  ["src/lib/server-db.ts", "legacy SQLite adapter with DB_DRIVER=postgres guard"],
  ["src/lib/data-repositories.ts", "dual-driver repository factory"],
  ["src/lib/memory/governance.ts", "driver-gated memory governance bridge"],
  ["src/lib/scan-data.ts", "driver-gated scan repository bridge"],
  ["src/lib/team-insights.ts", "driver-gated analytics bridge"],
]);

function toPosixRelative(rootDir, filePath) {
  return path.relative(rootDir, filePath).replace(/\\/g, "/");
}

function walkSourceFiles(dir, files = []) {
  if (!fs.existsSync(dir)) return files;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".next" || entry.name === ".git") continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkSourceFiles(fullPath, files);
    } else if (SOURCE_EXTENSIONS.has(path.extname(entry.name))) {
      files.push(fullPath);
    }
  }
  return files;
}

export function scanRuntimeSqliteImports(options = {}) {
  const rootDir = options.rootDir || process.cwd();
  const scanRoots = options.scanRoots || DEFAULT_SCAN_ROOTS;
  const hits = [];

  for (const scanRoot of scanRoots) {
    for (const filePath of walkSourceFiles(scanRoot)) {
      const rel = toPosixRelative(rootDir, filePath);
      const content = fs.readFileSync(filePath, "utf-8");
      const fileHits = [];
      for (const { kind, pattern } of SQLITE_IMPORT_PATTERNS) {
        if (pattern.test(content)) fileHits.push(kind);
      }
      if (hasRuntimeServerDbImport(content)) fileHits.push("server-db-import");
      if (fileHits.length === 0) continue;
      const allowReason = SQLITE_RUNTIME_ALLOWLIST.get(rel);
      hits.push({
        file: rel,
        hits: fileHits,
        allowed: Boolean(allowReason),
        reason: allowReason || "production runtime path can still reach SQLite APIs",
      });
    }
  }

  return hits.sort((a, b) => a.file.localeCompare(b.file));
}

function hasRuntimeServerDbImport(content) {
  return content
    .split(/\r?\n/)
    .some((line) => {
      const trimmed = line.trim();
      if (!trimmed.startsWith("import ") || trimmed.startsWith("import type ")) return false;
      if (!/from\s+["'][^"']*server-db["']/.test(trimmed)) return false;
      const namedImport = trimmed.match(/^import\s+\{([^}]+)\}\s+from/);
      if (namedImport) {
        const specifiers = namedImport[1].split(",").map((item) => item.trim()).filter(Boolean);
        if (specifiers.length > 0 && specifiers.every((item) => item.startsWith("type "))) return false;
      }
      return true;
    });
}

export function collectSqliteRowCounts(sqlitePath = DEFAULT_SQLITE_PATH) {
  if (!fs.existsSync(sqlitePath)) {
    return {
      exists: false,
      path: sqlitePath,
      tables: [],
    };
  }

  const db = openSqlite(sqlitePath);
  try {
    return {
      exists: true,
      path: sqlitePath,
      tables: MIGRATION_TABLES.map((table) => {
        try {
          return { table: table.name, rowCount: getTableCount(db, table.name) };
        } catch {
          return { table: table.name, rowCount: 0, missing: true };
        }
      }),
    };
  } finally {
    db.close();
  }
}

export async function collectPostgresRowCounts(databaseUrl) {
  if (!databaseUrl) {
    return {
      configured: false,
      tables: [],
    };
  }

  const pool = createPostgresPool(databaseUrl);
  const client = await pool.connect();
  try {
    const tables = [];
    for (const table of MIGRATION_TABLES) {
      try {
        const result = await client.query(`SELECT COUNT(*) AS count FROM "${table.name}"`);
        tables.push({ table: table.name, rowCount: Number(result.rows[0]?.count || 0) });
      } catch (error) {
        tables.push({ table: table.name, rowCount: 0, missing: true, error: error instanceof Error ? error.message : String(error) });
      }
    }
    return { configured: true, tables };
  } finally {
    client.release();
    await pool.end();
  }
}

export async function runPostgresCutoverCheck(options = {}) {
  const rootDir = options.rootDir || process.cwd();
  const driver = (options.driver || process.env.DB_DRIVER || "sqlite").trim().toLowerCase() === "postgres" ? "postgres" : "sqlite";
  const databaseUrl = options.databaseUrl ?? process.env.DATABASE_URL ?? "";
  const sqlitePath = options.sqlitePath || DEFAULT_SQLITE_PATH;
  const defaultOwner = options.defaultOwner || process.env.MIGRATION_DEFAULT_OWNER || "";

  const sqliteImports = scanRuntimeSqliteImports({
    rootDir,
    scanRoots: options.scanRoots || DEFAULT_SCAN_ROOTS,
  });
  const blockingSqliteImports = sqliteImports.filter((hit) => !hit.allowed);
  const sqliteCounts = collectSqliteRowCounts(sqlitePath);
  const postgresCounts = await collectPostgresRowCounts(databaseUrl);

  let migrationVerification = null;
  let migrationVerificationText = "";
  if (sqliteCounts.exists && databaseUrl) {
    const sqliteDb = openSqlite(sqlitePath);
    const pool = createPostgresPool(databaseUrl);
    const client = await pool.connect();
    try {
      migrationVerification = await verifyMigration({
        sqliteDb,
        pgClient: client,
        defaultOwner: defaultOwner || null,
      });
      migrationVerificationText = formatVerificationReport(migrationVerification);
    } finally {
      client.release();
      await pool.end();
      sqliteDb.close();
    }
  }

  const gates = [
    { name: "driver", ok: driver === "postgres", message: `DB_DRIVER=${driver}` },
    { name: "database_url", ok: Boolean(databaseUrl), message: databaseUrl ? "DATABASE_URL configured" : "DATABASE_URL missing" },
    {
      name: "runtime_sqlite_imports",
      ok: blockingSqliteImports.length === 0,
      message: `${blockingSqliteImports.length} blocking SQLite runtime path(s)`,
    },
    {
      name: "migration_hash_checks",
      ok: migrationVerification ? migrationVerification.ok : false,
      message: migrationVerification ? (migrationVerification.ok ? "migration verification passed" : "migration verification failed") : "migration verification skipped",
    },
  ];

  return {
    ok: gates.every((gate) => gate.ok),
    driver,
    databaseUrlConfigured: Boolean(databaseUrl),
    sqliteImports,
    blockingSqliteImports,
    sqliteCounts,
    postgresCounts,
    migrationVerification,
    migrationVerificationText,
    gates,
  };
}

export function formatCutoverReport(report) {
  const lines = [];
  lines.push("# PostgreSQL cutover checklist");
  lines.push("");
  lines.push(`Status: ${report.ok ? "PASS" : "FAIL"}`);
  lines.push(`Runtime driver: ${report.driver}`);
  lines.push(`DATABASE_URL: ${report.databaseUrlConfigured ? "configured" : "missing"}`);
  lines.push("");
  lines.push("## Gates");
  for (const gate of report.gates) {
    lines.push(`- ${gate.ok ? "PASS" : "FAIL"} ${gate.name}: ${gate.message}`);
  }
  lines.push("");
  lines.push("## Runtime SQLite imports");
  if (report.sqliteImports.length === 0) lines.push("- none");
  for (const hit of report.sqliteImports) {
    lines.push(`- ${hit.allowed ? "allowed" : "blocking"} ${hit.file}: ${hit.hits.join(", ")} (${hit.reason})`);
  }
  lines.push("");
  lines.push("## Row counts");
  lines.push(`SQLite: ${report.sqliteCounts.exists ? report.sqliteCounts.path : "missing"}`);
  for (const item of report.sqliteCounts.tables.slice(0, 40)) {
    lines.push(`- sqlite.${item.table}: ${item.missing ? "missing" : item.rowCount}`);
  }
  lines.push(`Postgres: ${report.postgresCounts.configured ? "configured" : "missing"}`);
  for (const item of report.postgresCounts.tables.slice(0, 40)) {
    lines.push(`- postgres.${item.table}: ${item.missing ? `missing (${item.error || "no table"})` : item.rowCount}`);
  }
  if (report.migrationVerificationText) {
    lines.push("");
    lines.push("## Migration verification");
    lines.push(report.migrationVerificationText.trim());
  }
  return `${lines.join("\n")}\n`;
}
