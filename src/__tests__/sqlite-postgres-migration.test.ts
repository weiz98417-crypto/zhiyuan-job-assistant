import { afterEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import fs from "fs";
import os from "os";
import path from "path";

// @ts-ignore - migration helper is a Node CLI ESM module.
import {
  analyzeOwnership,
  buildMigrationInventory,
  resolveDefaultOwner,
  validateSqliteJson,
} from "../../scripts/lib/sqlite-postgres-migration.mjs";

const cleanupPaths: string[] = [];

afterEach(() => {
  for (const dir of cleanupPaths.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function createFixtureDb(options: { invalidJson?: boolean } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "zhiyuan-migration-"));
  cleanupPaths.push(dir);
  const dbPath = path.join(dir, "fixture.db");
  const db = new Database(dbPath);

  db.exec(`
    CREATE TABLE users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      display_name TEXT NOT NULL
    );
    CREATE TABLE applications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company TEXT NOT NULL,
      role TEXT NOT NULL,
      user_id TEXT
    );
    CREATE TABLE reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      report_num INTEGER NOT NULL UNIQUE,
      blocks_json TEXT NOT NULL DEFAULT '{}',
      keywords_json TEXT NOT NULL DEFAULT '[]',
      user_id TEXT
    );
    CREATE TABLE jds (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company TEXT NOT NULL DEFAULT '',
      role TEXT NOT NULL DEFAULT '',
      keywords_json TEXT NOT NULL DEFAULT '[]'
    );
    CREATE TABLE reference_resumes_fts(raw_text TEXT);
  `);

  db.prepare("INSERT INTO users (id, username, password_hash, display_name) VALUES (?, ?, ?, ?)").run(
    "user-admin",
    "admin",
    "hash",
    "Admin",
  );
  db.prepare("INSERT INTO applications (company, role, user_id) VALUES (?, ?, ?)").run("Acme", "PM", null);
  db.prepare("INSERT INTO reports (report_num, blocks_json, keywords_json, user_id) VALUES (?, ?, ?, ?)").run(
    10,
    options.invalidJson ? "{bad" : '{"A":{"score":3}}',
    '["AI","PM"]',
    "user-admin",
  );
  db.prepare("INSERT INTO jds (company, role, keywords_json) VALUES (?, ?, ?)").run("Acme", "PM", '["AI"]');

  return db;
}

describe("SQLite to PostgreSQL migration inventory", () => {
  it("enumerates runtime SQLite tables and excludes non-durable FTS tables", () => {
    const db = createFixtureDb();
    const inventory = buildMigrationInventory(db);

    expect(inventory.excluded).toContain("reference_resumes_fts");
    expect(inventory.tables.find((table) => table.name === "applications")).toMatchObject({
      exists: true,
      rowCount: 1,
      target: "applications",
    });
    expect(inventory.tables.find((table) => table.name === "jds")?.columns).not.toContain("user_id");

    db.close();
  });

  it("requires an explicit default owner for null or missing user_id rows", () => {
    const db = createFixtureDb();

    const missing = analyzeOwnership(db).missing;
    expect(missing).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ table: "applications", count: 1, reason: "null or empty user_id" }),
        expect.objectContaining({ table: "jds", count: 1, reason: "missing user_id column" }),
      ]),
    );

    const owner = resolveDefaultOwner(db, "admin");
    const withOwner = analyzeOwnership(db, owner.id);
    expect(withOwner.missing).toHaveLength(0);
    expect(withOwner.assignments).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ table: "applications", assignedUserId: "user-admin" }),
        expect.objectContaining({ table: "jds", assignedUserId: "user-admin" }),
      ]),
    );

    db.close();
  });

  it("validates JSON columns before jsonb insertion", () => {
    const db = createFixtureDb({ invalidJson: true });

    expect(validateSqliteJson(db)).toEqual([
      expect.objectContaining({ table: "reports", column: "blocks_json", id: 1 }),
    ]);

    db.close();
  });
});
