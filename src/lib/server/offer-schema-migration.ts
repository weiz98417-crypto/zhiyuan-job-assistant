import type Database from "better-sqlite3";

export function migrateSqliteOfferUnknownTerms(database: Database.Database): void {
  const columns = database.prepare("PRAGMA table_info(offers)").all() as Array<{ name: string; notnull: number; dflt_value: string | null }>;
  const nullableTerms = ["annual_bonus", "has_social_insurance", "housing_fund_rate", "probation_months"];
  if (!columns.some((column) => nullableTerms.includes(column.name) && (column.notnull || column.dflt_value !== null))) return;
  const original = database.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='offers'").get() as { sql: string };
  const sequence = database.prepare("SELECT seq FROM sqlite_sequence WHERE name='offers'").get() as { seq: number } | undefined;
  const indexes = database.prepare("SELECT sql FROM sqlite_master WHERE tbl_name='offers' AND type IN ('index', 'trigger') AND sql IS NOT NULL").all() as Array<{ sql: string }>;
  const nullableDefinition = original.sql
    .replace(/CREATE TABLE\s+(?:IF NOT EXISTS\s+)?["`]?offers["`]?/i, "CREATE TABLE offers_unknown_terms")
    .replace(/(annual_bonus|has_social_insurance|housing_fund_rate|probation_months)\s+(REAL|INTEGER|DOUBLE PRECISION)(?:\s+NOT NULL)?(?:\s+DEFAULT\s+[\d.]+)?/gi, "$1 $2");
  const columnList = columns.map((column) => `"${column.name.replace(/"/g, '""')}"`).join(",");
  const foreignKeysEnabled = database.pragma("foreign_keys", { simple: true });
  database.pragma("foreign_keys = OFF");
  try {
    database.transaction(() => {
      database.exec(nullableDefinition);
      database.exec(`INSERT INTO offers_unknown_terms (${columnList}) SELECT ${columnList} FROM offers`);
      database.exec("DROP TABLE offers");
      database.exec("ALTER TABLE offers_unknown_terms RENAME TO offers");
      if (sequence) database.prepare("UPDATE sqlite_sequence SET seq = MAX(seq, ?) WHERE name='offers'").run(sequence.seq);
      for (const index of indexes) database.exec(index.sql);
    })();
  } finally {
    database.pragma(`foreign_keys = ${foreignKeysEnabled ? "ON" : "OFF"}`);
  }
}
