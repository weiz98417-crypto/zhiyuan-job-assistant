import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import { getDatabaseDriver } from "@/lib/postgres";
import { normalizeApplicationStatus } from "@/lib/application-status";

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");
const DB_PATH = path.join(DATA_DIR, "zhiyuan.db");
const SCHEMA_PATH = path.join(process.cwd(), "src", "lib", "server-schema.sql");

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  const archiveReadonly = getDatabaseDriver() === "postgres" && process.env.ALLOW_SQLITE_LEGACY === "readonly";
  if (getDatabaseDriver() === "postgres" && !archiveReadonly) {
    throw new Error("SQLite getDb() used while DB_DRIVER=postgres. Use data repositories for authoritative server data, or ALLOW_SQLITE_LEGACY=readonly for archive reads.");
  }
  if (!_db) {
    const dir = path.dirname(DB_PATH);
    if (!fs.existsSync(dir) && !archiveReadonly) fs.mkdirSync(dir, { recursive: true });
    _db = new Database(DB_PATH, archiveReadonly ? { readonly: true, fileMustExist: true } : undefined);
    if (archiveReadonly) {
      console.warn("[server-db] SQLite opened as read-only archive because ALLOW_SQLITE_LEGACY=readonly.");
      return _db;
    }
    _db.pragma("journal_mode = WAL");
    _db.pragma("foreign_keys = ON");
    const schema = fs.readFileSync(SCHEMA_PATH, "utf-8");
    _db.exec(schema);

    const userColumns = _db.prepare("PRAGMA table_info(users)").all() as { name: string }[];
    const userSecurityMigrations = [
      ["password_changed_at", "ALTER TABLE users ADD COLUMN password_changed_at TEXT"],
      ["password_changed_by", "ALTER TABLE users ADD COLUMN password_changed_by TEXT"],
      ["must_change_password", "ALTER TABLE users ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 0"],
      ["last_security_event_at", "ALTER TABLE users ADD COLUMN last_security_event_at TEXT"],
    ];
    for (const [name, sql] of userSecurityMigrations) {
      if (!userColumns.some((column) => column.name === name)) _db.exec(sql);
    }

    // Migration: jds.report_id stores the public report_num used by the UI,
    // not the internal reports.id primary key.
    const jdForeignKeys = _db.prepare("PRAGMA foreign_key_list(jds)").all() as { from: string; table: string; to: string }[];
    const jdReportIdReferencesInternalId = jdForeignKeys.some(
      (fk) => fk.from === "report_id" && fk.table === "reports" && fk.to === "id",
    );
    if (jdReportIdReferencesInternalId) {
      _db.pragma("foreign_keys = OFF");
      _db.exec(`
        DROP TABLE IF EXISTS jds_new;
        CREATE TABLE jds_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          company TEXT NOT NULL DEFAULT '',
          role TEXT NOT NULL DEFAULT '',
          source_type TEXT NOT NULL DEFAULT 'paste',
          source_url TEXT,
          body TEXT NOT NULL DEFAULT '',
          keywords_json TEXT NOT NULL DEFAULT '[]',
          report_id INTEGER REFERENCES reports(report_num),
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        INSERT INTO jds_new (id, company, role, source_type, source_url, body, keywords_json, report_id, created_at)
        SELECT
          j.id,
          j.company,
          j.role,
          j.source_type,
          j.source_url,
          j.body,
          j.keywords_json,
          COALESCE((SELECT r.report_num FROM reports r WHERE r.id = j.report_id), j.report_id),
          j.created_at
        FROM jds j;
        DROP TABLE jds;
        ALTER TABLE jds_new RENAME TO jds;
      `);
      _db.pragma("foreign_keys = ON");
    }

    // Migration: add goals_json column to existing profiles table
    const cols = _db.prepare("PRAGMA table_info(profiles)").all() as { name: string }[];
    if (!cols.some((c) => c.name === "goals_json")) {
      _db.exec("ALTER TABLE profiles ADD COLUMN goals_json TEXT NOT NULL DEFAULT '{}'");
    }

    // Migration: add operation column to optimization_preferences
    const prefCols = _db.prepare("PRAGMA table_info(optimization_preferences)").all() as { name: string }[];
    if (!prefCols.some((c) => c.name === "operation")) {
      _db.exec("ALTER TABLE optimization_preferences ADD COLUMN operation TEXT NOT NULL DEFAULT ''");
    }

    // Migration: source hash for idempotent report persistence
    const reportCols = _db.prepare("PRAGMA table_info(reports)").all() as { name: string }[];
    if (!reportCols.some((c) => c.name === "source_hash")) {
      _db.exec("ALTER TABLE reports ADD COLUMN source_hash TEXT NOT NULL DEFAULT ''");
    }
    _db.exec("CREATE INDEX IF NOT EXISTS idx_reports_source_hash ON reports(source_hash)");

    const appCols = _db.prepare("PRAGMA table_info(applications)").all() as { name: string }[];
    const applicationMigrations = [
      ["user_id", "ALTER TABLE applications ADD COLUMN user_id TEXT REFERENCES users(id)"],
      ["jd_id", "ALTER TABLE applications ADD COLUMN jd_id INTEGER"],
      ["source_url", "ALTER TABLE applications ADD COLUMN source_url TEXT NOT NULL DEFAULT ''"],
      ["metadata_json", "ALTER TABLE applications ADD COLUMN metadata_json TEXT NOT NULL DEFAULT '{}'"],
    ];
    for (const [name, sql] of applicationMigrations) {
      if (!appCols.some((c) => c.name === name)) _db.exec(sql);
    }
    const appIndexes = _db.prepare("PRAGMA index_list(applications)").all() as { name: string; unique: number }[];
    const hasLegacyCompanyRoleUnique = appIndexes.some((index) => {
      if (!index.unique) return false;
      const indexName = `'${index.name.replace(/'/g, "''")}'`;
      const columns = (_db!.prepare(`PRAGMA index_info(${indexName})`).all() as { name: string }[]).map((column) => column.name);
      return columns.length === 2 && columns[0] === "company" && columns[1] === "role";
    });
    if (hasLegacyCompanyRoleUnique) {
      _db.pragma("foreign_keys = OFF");
      _db.exec(`
        DROP TABLE IF EXISTS applications_new;
        CREATE TABLE applications_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id TEXT REFERENCES users(id),
          num INTEGER NOT NULL DEFAULT 0,
          date TEXT NOT NULL DEFAULT '',
          company TEXT NOT NULL DEFAULT '',
          role TEXT NOT NULL DEFAULT '',
          score REAL NOT NULL DEFAULT 0,
          status TEXT NOT NULL DEFAULT 'evaluated',
          pdf_generated INTEGER NOT NULL DEFAULT 0,
          report_path TEXT NOT NULL DEFAULT '',
          notes TEXT NOT NULL DEFAULT '',
          jd_id INTEGER,
          source_url TEXT NOT NULL DEFAULT '',
          metadata_json TEXT NOT NULL DEFAULT '{}',
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now')),
          UNIQUE(user_id, company, role)
        );
        INSERT OR IGNORE INTO applications_new (
          id, user_id, num, date, company, role, score, status, pdf_generated,
          report_path, notes, jd_id, source_url, metadata_json, created_at, updated_at
        )
        SELECT
          id, user_id, num, date, company, role, score, lower(status), pdf_generated,
          report_path, notes, jd_id, source_url, metadata_json, created_at, updated_at
        FROM applications;
        DROP TABLE applications;
        ALTER TABLE applications_new RENAME TO applications;
      `);
      _db.pragma("foreign_keys = ON");
    }
    _db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_applications_user_company_role ON applications(user_id, company, role)");
    _db.exec("CREATE INDEX IF NOT EXISTS idx_applications_user_status ON applications(user_id, status, updated_at)");
    _db.exec(`
      CREATE TABLE IF NOT EXISTS application_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL REFERENCES users(id),
        application_id INTEGER NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
        event_type TEXT NOT NULL DEFAULT 'note',
        from_status TEXT,
        to_status TEXT,
        note TEXT NOT NULL DEFAULT '',
        source TEXT NOT NULL DEFAULT 'system',
        metadata_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_application_events_user_app ON application_events(user_id, application_id, created_at);
      CREATE INDEX IF NOT EXISTS idx_application_events_type ON application_events(user_id, event_type, created_at);
    `);

    // Migration: job discovery scan queue + discovered jobs
    _db.exec(`
      CREATE TABLE IF NOT EXISTS scan_queue (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id),
        status TEXT DEFAULT 'pending',
        title_positive_json TEXT DEFAULT '[]',
        title_negative_json TEXT DEFAULT '[]',
        location_filter TEXT DEFAULT '',
        max_results INTEGER DEFAULT 50,
        companies_total INTEGER DEFAULT 0,
        companies_done INTEGER DEFAULT 0,
        jobs_found INTEGER DEFAULT 0,
        jobs_new INTEGER DEFAULT 0,
        error_log TEXT DEFAULT '[]',
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS scan_jobs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        scan_id TEXT NOT NULL REFERENCES scan_queue(id),
        user_id TEXT NOT NULL REFERENCES users(id),
        jd_id INTEGER REFERENCES jds(id),
        company TEXT NOT NULL,
        title TEXT NOT NULL,
        url TEXT NOT NULL,
        location TEXT DEFAULT '',
        department TEXT DEFAULT '',
        jd_snippet TEXT DEFAULT '',
        status TEXT DEFAULT 'new',
        last_error TEXT DEFAULT '',
        dedup_key TEXT NOT NULL UNIQUE,
        first_seen_at TEXT DEFAULT (datetime('now')),
        last_interaction_at TEXT,
        discovered_at TEXT DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS scan_source_runs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        scan_id TEXT NOT NULL REFERENCES scan_queue(id),
        user_id TEXT NOT NULL REFERENCES users(id),
        source_name TEXT NOT NULL,
        source_type TEXT NOT NULL DEFAULT 'company_portal',
        status TEXT NOT NULL DEFAULT 'pending',
        attempted INTEGER NOT NULL DEFAULT 0,
        parsed INTEGER NOT NULL DEFAULT 0,
        matched INTEGER NOT NULL DEFAULT 0,
        inserted INTEGER NOT NULL DEFAULT 0,
        deduped INTEGER NOT NULL DEFAULT 0,
        blocked_reason TEXT NOT NULL DEFAULT '',
        error TEXT NOT NULL DEFAULT '',
        metrics_json TEXT NOT NULL DEFAULT '{}',
        started_at TEXT DEFAULT (datetime('now')),
        finished_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_scan_jobs_user_status ON scan_jobs(user_id, status);
      CREATE INDEX IF NOT EXISTS idx_scan_jobs_scan ON scan_jobs(scan_id);
      CREATE INDEX IF NOT EXISTS idx_scan_jobs_jd ON scan_jobs(jd_id);
      CREATE INDEX IF NOT EXISTS idx_scan_queue_user ON scan_queue(user_id, status);
      CREATE INDEX IF NOT EXISTS idx_scan_source_runs_scan ON scan_source_runs(scan_id, source_name);
      CREATE INDEX IF NOT EXISTS idx_scan_source_runs_user ON scan_source_runs(user_id, status);
    `);

    const scanQueueCols = _db.prepare("PRAGMA table_info(scan_queue)").all() as { name: string }[];
    if (!scanQueueCols.some((c) => c.name === "title_positive_json")) {
      _db.exec("ALTER TABLE scan_queue ADD COLUMN title_positive_json TEXT DEFAULT '[]'");
    }
    if (!scanQueueCols.some((c) => c.name === "title_negative_json")) {
      _db.exec("ALTER TABLE scan_queue ADD COLUMN title_negative_json TEXT DEFAULT '[]'");
    }
    if (!scanQueueCols.some((c) => c.name === "location_filter")) {
      _db.exec("ALTER TABLE scan_queue ADD COLUMN location_filter TEXT DEFAULT ''");
    }
    if (!scanQueueCols.some((c) => c.name === "max_results")) {
      _db.exec("ALTER TABLE scan_queue ADD COLUMN max_results INTEGER DEFAULT 50");
    }

    const scanJobCols = _db.prepare("PRAGMA table_info(scan_jobs)").all() as { name: string }[];
    if (!scanJobCols.some((c) => c.name === "jd_id")) {
      _db.exec("ALTER TABLE scan_jobs ADD COLUMN jd_id INTEGER REFERENCES jds(id)");
    }
    if (!scanJobCols.some((c) => c.name === "last_error")) {
      _db.exec("ALTER TABLE scan_jobs ADD COLUMN last_error TEXT DEFAULT ''");
    }
    const scanJobMigrations = [
      ["source_name", "ALTER TABLE scan_jobs ADD COLUMN source_name TEXT NOT NULL DEFAULT ''"],
      ["source_type", "ALTER TABLE scan_jobs ADD COLUMN source_type TEXT NOT NULL DEFAULT ''"],
      ["source_url", "ALTER TABLE scan_jobs ADD COLUMN source_url TEXT NOT NULL DEFAULT ''"],
      ["verification_status", "ALTER TABLE scan_jobs ADD COLUMN verification_status TEXT NOT NULL DEFAULT 'verified_jd'"],
      ["match_confidence", "ALTER TABLE scan_jobs ADD COLUMN match_confidence TEXT NOT NULL DEFAULT 'medium'"],
      ["source_metadata_json", "ALTER TABLE scan_jobs ADD COLUMN source_metadata_json TEXT NOT NULL DEFAULT '{}'"],
    ];
    for (const [name, sql] of scanJobMigrations) {
      if (!scanJobCols.some((c) => c.name === name)) _db.exec(sql);
    }
    _db.exec("CREATE INDEX IF NOT EXISTS idx_scan_jobs_jd ON scan_jobs(jd_id)");

    // Migration: multi-user auth — add user_id to private + attribution tables
    const userTables = [
      'profiles', 'profile_signals', 'sessions', 'stories', 'cv_data',
      'applications', 'agent_preferences', 'session_memory',
      'optimization_preferences', 'resume_edit_proposals', 'reports', 'jds', 'reference_resumes',
      'offers', 'offer_reports',
    ];
    for (const table of userTables) {
      const tCols = _db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
      if (!tCols.some((c) => c.name === 'user_id')) {
        _db.exec(`ALTER TABLE ${table} ADD COLUMN user_id TEXT REFERENCES users(id)`);
      }
    }

    const sessionCols = _db.prepare("PRAGMA table_info(sessions)").all() as { name: string }[];
    if (!sessionCols.some((c) => c.name === "interview_state_json")) {
      _db.exec("ALTER TABLE sessions ADD COLUMN interview_state_json TEXT NOT NULL DEFAULT '{}'");
    }
    if (!sessionCols.some((c) => c.name === "agent_state_json")) {
      _db.exec("ALTER TABLE sessions ADD COLUMN agent_state_json TEXT NOT NULL DEFAULT '{}'");
    }

    const referenceResumeCols = _db.prepare("PRAGMA table_info(reference_resumes)").all() as { name: string }[];
    const referenceResumeMigrations = [
      ["role_category", "ALTER TABLE reference_resumes ADD COLUMN role_category TEXT NOT NULL DEFAULT ''"],
      ["industry_tags", "ALTER TABLE reference_resumes ADD COLUMN industry_tags TEXT NOT NULL DEFAULT '[]'"],
      ["seniority", "ALTER TABLE reference_resumes ADD COLUMN seniority TEXT NOT NULL DEFAULT ''"],
      ["visibility", "ALTER TABLE reference_resumes ADD COLUMN visibility TEXT NOT NULL DEFAULT 'private'"],
      ["status", "ALTER TABLE reference_resumes ADD COLUMN status TEXT NOT NULL DEFAULT 'active'"],
      ["quality_score", "ALTER TABLE reference_resumes ADD COLUMN quality_score REAL NOT NULL DEFAULT 0"],
      ["anonymized", "ALTER TABLE reference_resumes ADD COLUMN anonymized INTEGER NOT NULL DEFAULT 0"],
      ["shared_text_redacted", "ALTER TABLE reference_resumes ADD COLUMN shared_text_redacted TEXT NOT NULL DEFAULT ''"],
      ["source_hash", "ALTER TABLE reference_resumes ADD COLUMN source_hash TEXT NOT NULL DEFAULT ''"],
      ["metadata_json", "ALTER TABLE reference_resumes ADD COLUMN metadata_json TEXT NOT NULL DEFAULT '{}'"],
      ["approved_by", "ALTER TABLE reference_resumes ADD COLUMN approved_by TEXT"],
      ["approved_at", "ALTER TABLE reference_resumes ADD COLUMN approved_at TEXT"],
      ["updated_at", "ALTER TABLE reference_resumes ADD COLUMN updated_at TEXT NOT NULL DEFAULT (datetime('now'))"],
    ];
    for (const [name, sql] of referenceResumeMigrations) {
      if (!referenceResumeCols.some((c) => c.name === name)) _db.exec(sql);
    }
    _db.exec("CREATE INDEX IF NOT EXISTS idx_reference_resumes_user ON reference_resumes(user_id, created_at)");
    _db.exec("CREATE INDEX IF NOT EXISTS idx_reference_resumes_visibility ON reference_resumes(visibility, status, role_category)");
    _db.exec("CREATE INDEX IF NOT EXISTS idx_reference_resumes_hash ON reference_resumes(source_hash)");

    const offerCols = _db.prepare("PRAGMA table_info(offers)").all() as { name: string }[];
    const offerMigrations = [
      ["employment_form", "ALTER TABLE offers ADD COLUMN employment_form TEXT NOT NULL DEFAULT 'unknown'"],
      ["employer_name", "ALTER TABLE offers ADD COLUMN employer_name TEXT"],
      ["contract_months", "ALTER TABLE offers ADD COLUMN contract_months INTEGER"],
      ["overtime_policy", "ALTER TABLE offers ADD COLUMN overtime_policy TEXT NOT NULL DEFAULT 'unknown'"],
      ["bonus_guarantee", "ALTER TABLE offers ADD COLUMN bonus_guarantee TEXT NOT NULL DEFAULT 'unknown'"],
      ["equity_type", "ALTER TABLE offers ADD COLUMN equity_type TEXT"],
      ["equity_vesting", "ALTER TABLE offers ADD COLUMN equity_vesting TEXT"],
      ["commute_minutes", "ALTER TABLE offers ADD COLUMN commute_minutes INTEGER"],
      ["city_cost_level", "ALTER TABLE offers ADD COLUMN city_cost_level TEXT NOT NULL DEFAULT 'unknown'"],
      ["job_nature", "ALTER TABLE offers ADD COLUMN job_nature TEXT"],
      ["latest_report_id", "ALTER TABLE offers ADD COLUMN latest_report_id INTEGER"],
      ["updated_at", "ALTER TABLE offers ADD COLUMN updated_at TEXT NOT NULL DEFAULT (datetime('now'))"],
    ];
    for (const [name, sql] of offerMigrations) {
      if (!offerCols.some((c) => c.name === name)) _db.exec(sql);
    }
    _db.exec("CREATE INDEX IF NOT EXISTS idx_offers_user ON offers(user_id, updated_at)");

    const offerReportCols = _db.prepare("PRAGMA table_info(offer_reports)").all() as { name: string }[];
    const offerReportMigrations = [
      ["report_type", "ALTER TABLE offer_reports ADD COLUMN report_type TEXT NOT NULL DEFAULT 'comparison'"],
      ["model_version", "ALTER TABLE offer_reports ADD COLUMN model_version TEXT NOT NULL DEFAULT ''"],
      ["offer_id", "ALTER TABLE offer_reports ADD COLUMN offer_id INTEGER REFERENCES offers(id)"],
      ["overall_score", "ALTER TABLE offer_reports ADD COLUMN overall_score REAL NOT NULL DEFAULT 0"],
      ["verdict", "ALTER TABLE offer_reports ADD COLUMN verdict TEXT NOT NULL DEFAULT ''"],
      ["summary", "ALTER TABLE offer_reports ADD COLUMN summary TEXT NOT NULL DEFAULT ''"],
      ["offer_snapshot_json", "ALTER TABLE offer_reports ADD COLUMN offer_snapshot_json TEXT NOT NULL DEFAULT '{}'"],
      ["modules_json", "ALTER TABLE offer_reports ADD COLUMN modules_json TEXT NOT NULL DEFAULT '[]'"],
      ["red_flags_json", "ALTER TABLE offer_reports ADD COLUMN red_flags_json TEXT NOT NULL DEFAULT '[]'"],
      ["missing_info_json", "ALTER TABLE offer_reports ADD COLUMN missing_info_json TEXT NOT NULL DEFAULT '[]'"],
      ["negotiation_levers_json", "ALTER TABLE offer_reports ADD COLUMN negotiation_levers_json TEXT NOT NULL DEFAULT '[]'"],
      ["hr_questions_json", "ALTER TABLE offer_reports ADD COLUMN hr_questions_json TEXT NOT NULL DEFAULT '[]'"],
      ["assumptions_json", "ALTER TABLE offer_reports ADD COLUMN assumptions_json TEXT NOT NULL DEFAULT '[]'"],
      ["take_home_json", "ALTER TABLE offer_reports ADD COLUMN take_home_json TEXT NOT NULL DEFAULT '{}'"],
    ];
    for (const [name, sql] of offerReportMigrations) {
      if (!offerReportCols.some((c) => c.name === name)) _db.exec(sql);
    }
    _db.exec("CREATE INDEX IF NOT EXISTS idx_offer_reports_user ON offer_reports(user_id, created_at)");
    _db.exec("CREATE INDEX IF NOT EXISTS idx_offer_reports_offer ON offer_reports(offer_id, created_at)");
  }
  return _db;
}

/* ── Applications ── */

export interface AppRow {
  id?: number; num: number; date: string; company: string; role: string;
  score: number; status: string; pdf_generated: number; report_path: string; notes: string;
  jd_id?: number | null; source_url?: string | null; metadata_json?: string; user_id?: string | null;
  created_at?: string; updated_at?: string;
}

export interface ApplicationEventRow {
  id?: number;
  user_id?: string;
  application_id: number;
  event_type: string;
  from_status?: string | null;
  to_status?: string | null;
  note: string;
  source: string;
  metadata_json: string;
  created_at?: string;
}

export function listApps(filters?: { status?: string; company?: string; limit?: number; offset?: number }, userId?: string): AppRow[] {
  const db = getDb();
  let sql = "SELECT * FROM applications WHERE 1=1";
  const params: Record<string, unknown> = {};
  if (userId) { sql += " AND user_id = @userId"; params.userId = userId; }
  if (filters?.status) { sql += " AND lower(status) = @status"; params.status = normalizeApplicationStatus(filters.status); }
  if (filters?.company) { sql += " AND company LIKE @company"; params.company = `%${filters.company}%`; }
  sql += " ORDER BY num DESC";
  if (filters?.limit) { sql += " LIMIT @limit"; params.limit = filters.limit; }
  if (filters?.offset) { sql += " OFFSET @offset"; params.offset = filters.offset; }
  return (db.prepare(sql).all(params) as AppRow[]).map((row) => ({ ...row, status: normalizeApplicationStatus(row.status) }));
}

export function upsertApp(app: AppRow, userId?: string): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO applications (user_id, num, date, company, role, score, status, pdf_generated, report_path, notes, jd_id, source_url, metadata_json, updated_at)
    VALUES (@userId, @num, @date, @company, @role, @score, @status, @pdf_generated, @report_path, @notes, @jd_id, @source_url, @metadata_json, datetime('now'))
    ON CONFLICT(user_id, company, role) DO UPDATE SET
      score=excluded.score, status=excluded.status, report_path=excluded.report_path,
      notes=excluded.notes, jd_id=COALESCE(excluded.jd_id, applications.jd_id),
      source_url=COALESCE(NULLIF(excluded.source_url, ''), applications.source_url),
      metadata_json=excluded.metadata_json, updated_at=datetime('now')
  `).run({
    ...app,
    status: normalizeApplicationStatus(app.status),
    jd_id: app.jd_id ?? null,
    source_url: app.source_url || "",
    metadata_json: app.metadata_json || "{}",
    userId: userId || null,
  });
}

/* ── Reports ── */

export interface ReportRow {
  id?: number; report_num: number; date: string; company: string; role: string;
  archetype: string; overall_score: number; legitimacy: string; blocks_json: string; keywords_json: string; source_hash?: string; created_at?: string;
}

export function listReports(userId?: string): ReportRow[] {
  if (userId) {
    return getDb().prepare("SELECT * FROM reports WHERE user_id = ? ORDER BY report_num DESC").all(userId) as ReportRow[];
  }
  return getDb().prepare("SELECT * FROM reports ORDER BY report_num DESC").all() as ReportRow[];
}

export function getReport(reportNum: number): ReportRow | undefined {
  return getDb().prepare("SELECT * FROM reports WHERE report_num = ?").get(reportNum) as ReportRow | undefined;
}

export function upsertReport(r: ReportRow, userId?: string): void {
  getDb().prepare(`
    INSERT INTO reports (user_id, report_num, date, company, role, archetype, overall_score, legitimacy, blocks_json, keywords_json, source_hash)
    VALUES (@userId, @report_num, @date, @company, @role, @archetype, @overall_score, @legitimacy, @blocks_json, @keywords_json, @source_hash)
    ON CONFLICT(report_num) DO UPDATE SET
      date=excluded.date, company=excluded.company, role=excluded.role, archetype=excluded.archetype,
      overall_score=excluded.overall_score, legitimacy=excluded.legitimacy,
      blocks_json=excluded.blocks_json, keywords_json=excluded.keywords_json,
      source_hash=excluded.source_hash
  `).run({ ...r, source_hash: r.source_hash || "", userId: userId || null });
}

/* ── JDs ── */

export interface JDRow {
  id?: number; user_id?: string | null; company: string; role: string; source_type: string;
  source_url?: string; body: string; keywords_json: string; report_id?: number; created_at?: string;
}

export function listJDs(): JDRow[] {
  return getDb().prepare("SELECT * FROM jds ORDER BY id DESC").all() as JDRow[];
}

export function getJD(id: number): JDRow | undefined {
  return getDb().prepare("SELECT * FROM jds WHERE id = ?").get(id) as JDRow | undefined;
}

export function insertJD(jd: JDRow, userId?: string): number {
  const result = getDb().prepare(`
    INSERT INTO jds (user_id, company, role, source_type, source_url, body, keywords_json, report_id)
    VALUES (@user_id, @company, @role, @source_type, @source_url, @body, @keywords_json, @report_id)
  `).run({
    ...jd,
    user_id: userId || jd.user_id || null,
    source_url: jd.source_url || "",
    report_id: jd.report_id ?? null,
  });
  return Number(result.lastInsertRowid);
}

function normalizeBodyForMatch(body: string): string {
  return body.replace(/\s+/g, " ").trim().slice(0, 500).toLowerCase();
}

export function findReusableJD(input: { source_url?: string; body?: string }, userId?: string): JDRow | undefined {
  const db = getDb();
  if (input.source_url) {
    const byUrl = userId
      ? db.prepare("SELECT * FROM jds WHERE source_url = ? AND (user_id = ? OR user_id IS NULL) ORDER BY id DESC LIMIT 1").get(input.source_url, userId) as JDRow | undefined
      : db.prepare("SELECT * FROM jds WHERE source_url = ? ORDER BY id DESC LIMIT 1").get(input.source_url) as JDRow | undefined;
    if (byUrl) return byUrl;
  }

  const normalized = normalizeBodyForMatch(input.body || "");
  if (!normalized) return undefined;
  const rows = (userId
    ? db.prepare("SELECT * FROM jds WHERE body != '' AND (user_id = ? OR user_id IS NULL) ORDER BY id DESC LIMIT 200").all(userId)
    : db.prepare("SELECT * FROM jds WHERE body != '' ORDER BY id DESC LIMIT 200").all()) as JDRow[];
  return rows.find((row) => normalizeBodyForMatch(row.body) === normalized);
}

/* ── Profiles ── */

export interface ProfileRow {
  id: number; data_json: string; goals_json: string; history_json: string; last_updated: string;
}

export function getProfile(userId?: string): ProfileRow | undefined {
  if (userId) {
    return getDb().prepare("SELECT * FROM profiles WHERE user_id = ?").get(userId) as ProfileRow | undefined;
  }
  return getDb().prepare("SELECT * FROM profiles WHERE id = 1").get() as ProfileRow | undefined;
}

export function upsertProfile(dataJson: string, historyJson: string, goalsJson?: string, userId?: string): void {
  if (userId) {
    const existing = getDb().prepare("SELECT id FROM profiles WHERE user_id = ?").get(userId);
    if (existing) {
      getDb().prepare(
        "UPDATE profiles SET data_json = ?, goals_json = ?, history_json = ?, last_updated = datetime('now') WHERE user_id = ?"
      ).run(dataJson, goalsJson || "{}", historyJson, userId);
    } else {
      getDb().prepare(
        "INSERT INTO profiles (user_id, data_json, goals_json, history_json, last_updated) VALUES (?, ?, ?, ?, datetime('now'))"
      ).run(userId, dataJson, goalsJson || "{}", historyJson);
    }
    return;
  }
  getDb().prepare(`
    INSERT INTO profiles (id, data_json, goals_json, history_json, last_updated)
    VALUES (1, @data, @goals, @history, datetime('now'))
    ON CONFLICT(id) DO UPDATE SET
      data_json=excluded.data_json,
      goals_json=excluded.goals_json,
      history_json=excluded.history_json,
      last_updated=datetime('now')
  `).run({ data: dataJson, goals: goalsJson || "{}", history: historyJson });
}

export function getProfileGoals(userId?: string): Record<string, unknown> | null {
  if (userId) {
    const row = getDb().prepare("SELECT goals_json FROM profiles WHERE user_id = ?").get(userId) as { goals_json: string } | undefined;
    if (!row) return null;
    try { return JSON.parse(row.goals_json); } catch { return null; }
  }
  const row = getDb().prepare("SELECT goals_json FROM profiles WHERE id = 1").get() as { goals_json: string } | undefined;
  if (!row) return null;
  try { return JSON.parse(row.goals_json); } catch { return null; }
}

export function upsertProfileGoals(goals: Record<string, unknown>): void {
  const goalsJson = JSON.stringify(goals);
  const existing = getDb().prepare("SELECT id FROM profiles WHERE id = 1").get();
  if (existing) {
    getDb().prepare("UPDATE profiles SET goals_json = ?, last_updated = datetime('now') WHERE id = 1").run(goalsJson);
  } else {
    getDb().prepare("INSERT INTO profiles (id, data_json, goals_json, history_json) VALUES (1, '{}', ?, '[]')").run(goalsJson);
  }
}

/* ── Profile Signals ── */

export interface SignalRow {
  id?: number;
  source: string;
  signal_type: string;
  content_json: string;
  session_id?: string;
  created_at: string;
}

export interface SignalQuery {
  signal_type?: string;
  source?: string;
  since?: string; // ISO date string
  limit?: number;
}

export function insertSignal(signal: Pick<SignalRow, "source" | "signal_type" | "content_json" | "session_id">, userId?: string): void {
  getDb().prepare(`
    INSERT INTO profile_signals (user_id, source, signal_type, content_json, session_id)
    VALUES (@user_id, @source, @signal_type, @content_json, @session_id)
  `).run({
    user_id: userId || null,
    source: signal.source,
    signal_type: signal.signal_type,
    content_json: typeof signal.content_json === "string" ? signal.content_json : JSON.stringify(signal.content_json),
    session_id: signal.session_id || null,
  });
}

export function insertSignals(signals: Pick<SignalRow, "source" | "signal_type" | "content_json" | "session_id">[], userId?: string): void {
  if (!signals.length) return;
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO profile_signals (user_id, source, signal_type, content_json, session_id)
    VALUES (@user_id, @source, @signal_type, @content_json, @session_id)
  `);
  const tx = db.transaction(() => {
    for (const s of signals) {
      stmt.run({
        user_id: userId || null,
        source: s.source,
        signal_type: s.signal_type,
        content_json: typeof s.content_json === "string" ? s.content_json : JSON.stringify(s.content_json),
        session_id: s.session_id || null,
      });
    }
  });
  tx();
}

export function querySignals(q: SignalQuery = {}, userId?: string): SignalRow[] {
  const conditions: string[] = [];
  const params: Record<string, unknown> = {};

  if (userId) {
    conditions.push("user_id = @user_id");
    params.user_id = userId;
  }
  if (q.signal_type) {
    conditions.push("signal_type = @signal_type");
    params.signal_type = q.signal_type;
  }
  if (q.source) {
    conditions.push("source = @source");
    params.source = q.source;
  }
  if (q.since) {
    conditions.push("created_at >= @since");
    params.since = q.since;
  }

  let sql = "SELECT * FROM profile_signals";
  if (conditions.length > 0) sql += " WHERE " + conditions.join(" AND ");
  sql += " ORDER BY created_at DESC";

  if (q.limit) {
    sql += " LIMIT @limit";
    params.limit = q.limit;
  }

  return getDb().prepare(sql).all(params) as SignalRow[];
}

export function listSignals(limit = 50): SignalRow[] {
  return getDb().prepare("SELECT * FROM profile_signals ORDER BY created_at DESC LIMIT ?").all(limit) as SignalRow[];
}

export function clearProfileSignals(): number {
  const result = getDb().prepare("DELETE FROM profile_signals").run();
  return result.changes;
}

/* ── Reference Resumes ── */

export interface ReferenceResumeRow {
  id: number;
  user_id?: string | null;
  name: string;
  source: string;
  sections_json: string;
  raw_text: string;
  tags: string;
  notes: string;
  role_category?: string;
  industry_tags?: string;
  seniority?: string;
  visibility?: string;
  status?: string;
  quality_score?: number;
  anonymized?: number | boolean;
  shared_text_redacted?: string;
  source_hash?: string;
  metadata_json?: string;
  approved_by?: string | null;
  approved_at?: string | null;
  updated_at?: string;
  created_at: string;
}

export interface ReferenceResumeSummary {
  id: number;
  user_id?: string | null;
  name: string;
  source: string;
  tags: string;
  notes: string;
  role_category?: string;
  visibility?: string;
  status?: string;
  quality_score?: number;
  anonymized?: number | boolean;
  created_at: string;
  updated_at?: string;
}

export interface ReferenceResumeInsertInput {
  name: string;
  source: string;
  sections_json: string;
  raw_text: string;
  tags?: string;
  notes?: string;
  role_category?: string;
  industry_tags?: string;
  seniority?: string;
  visibility?: string;
  status?: string;
  quality_score?: number;
  anonymized?: number | boolean;
  shared_text_redacted?: string;
  source_hash?: string;
  metadata_json?: string;
  approved_by?: string | null;
  approved_at?: string | null;
  created_at: string;
}

export function insertReferenceResume(r: Omit<ReferenceResumeInsertInput, "created_at">): number {
  const db = getDb();
  const result = db.prepare(`
    INSERT INTO reference_resumes (
      name, source, sections_json, raw_text, tags, notes, role_category,
      industry_tags, seniority, visibility, status, quality_score, anonymized,
      shared_text_redacted, source_hash, metadata_json, approved_by, approved_at
    )
    VALUES (
      @name, @source, @sections_json, @raw_text, @tags, @notes, @role_category,
      @industry_tags, @seniority, @visibility, @status, @quality_score, @anonymized,
      @shared_text_redacted, @source_hash, @metadata_json, @approved_by, @approved_at
    )
  `).run({
    name: r.name,
    source: r.source,
    sections_json: r.sections_json,
    raw_text: r.raw_text,
    tags: r.tags || "[]",
    notes: r.notes || "",
    role_category: r.role_category || "",
    industry_tags: r.industry_tags || "[]",
    seniority: r.seniority || "",
    visibility: r.visibility || "private",
    status: r.status || "active",
    quality_score: r.quality_score || 0,
    anonymized: r.anonymized ? 1 : 0,
    shared_text_redacted: r.shared_text_redacted || "",
    source_hash: r.source_hash || "",
    metadata_json: r.metadata_json || "{}",
    approved_by: r.approved_by || null,
    approved_at: r.approved_at || null,
  });
  return result.lastInsertRowid as number;
}

export function listReferenceResumes(): ReferenceResumeSummary[] {
  return getDb().prepare(
    "SELECT id, name, source, tags, notes, created_at FROM reference_resumes ORDER BY created_at DESC"
  ).all() as ReferenceResumeSummary[];
}

export function getReferenceResume(id: number): ReferenceResumeRow | undefined {
  return getDb().prepare("SELECT * FROM reference_resumes WHERE id = ?").get(id) as ReferenceResumeRow | undefined;
}

export function deleteReferenceResume(id: number): boolean {
  const result = getDb().prepare("DELETE FROM reference_resumes WHERE id = ?").run(id);
  return result.changes > 0;
}

export function updateReferenceResume(id: number, updates: {
  name?: string;
  sections_json?: string;
  raw_text?: string;
  tags?: string;
  notes?: string;
}): boolean {
  const db = getDb();
  const sets: string[] = [];
  const params: Record<string, unknown> = { id };

  if (updates.name !== undefined) { sets.push("name = @name"); params.name = updates.name; }
  if (updates.sections_json !== undefined) { sets.push("sections_json = @sections_json"); params.sections_json = updates.sections_json; }
  if (updates.raw_text !== undefined) { sets.push("raw_text = @raw_text"); params.raw_text = updates.raw_text; }
  if (updates.tags !== undefined) { sets.push("tags = @tags"); params.tags = updates.tags; }
  if (updates.notes !== undefined) { sets.push("notes = @notes"); params.notes = updates.notes; }

  if (sets.length === 0) return false;

  const result = db.prepare(`UPDATE reference_resumes SET ${sets.join(", ")} WHERE id = @id`).run(params);
  return result.changes > 0;
}

export function checkReferenceResumeName(name: string, excludeId?: number): boolean {
  const db = getDb();
  if (excludeId) {
    const row = db.prepare("SELECT id FROM reference_resumes WHERE name = ? AND id != ?").get(name, excludeId);
    return !!row;
  }
  const row = db.prepare("SELECT id FROM reference_resumes WHERE name = ?").get(name);
  return !!row;
}

export function searchReferenceResumes(query: string, limit = 5): ReferenceResumeRow[] {
  const db = getDb();
  // Build FTS5 query: escape quotes, split into terms for prefix matching
  const terms = query
    .replace(/['"]/g, "")
    .split(/\s+/)
    .filter(t => t.length > 0)
    .map(t => `"${t}"`)
    .join(" OR ");

  if (!terms) return [];

  try {
    const sql = `
      SELECT rr.* FROM reference_resumes rr
      INNER JOIN reference_resumes_fts fts ON rr.id = fts.rowid
      WHERE reference_resumes_fts MATCH @query
      ORDER BY rank LIMIT @limit
    `;
    return db.prepare(sql).all({ query: terms, limit }) as ReferenceResumeRow[];
  } catch {
    // FTS5 query parse error — fall back to LIKE search
    return db.prepare(
      "SELECT * FROM reference_resumes WHERE raw_text LIKE @like ORDER BY id DESC LIMIT @limit"
    ).all({ like: `%${query.slice(0, 50)}%`, limit }) as ReferenceResumeRow[];
  }
}

/* ── Optimization Preferences ── */

export interface PreferenceRow {
  id?: number;
  section_id: string;
  variant_type: string;
  action: string;
  operation?: string;
  original_text?: string;
  optimized_text?: string;
}

export function recordPreference(p: PreferenceRow, userId?: string): void {
  getDb().prepare(`
    INSERT INTO optimization_preferences (user_id, section_id, variant_type, action, original_text, optimized_text, operation)
    VALUES (@user_id, @section_id, @variant_type, @action, @original_text, @optimized_text, @operation)
  `).run({
    user_id: userId || null,
    section_id: p.section_id,
    variant_type: p.variant_type,
    action: p.action,
    original_text: p.original_text || null,
    optimized_text: p.optimized_text || null,
    operation: p.operation || "",
  });
}

export function getRecentPreferences(limit = 10): PreferenceRow[] {
  return getDb().prepare(
    "SELECT * FROM optimization_preferences ORDER BY created_at DESC LIMIT ?"
  ).all(limit) as PreferenceRow[];
}

/* ── News Cache ── */

export interface NewsCacheRow {
  id?: number;
  source: string;
  source_name?: string;
  title: string;
  summary?: string;
  url?: string;
  published_at?: string;
  cached_at: string;
}

export function cacheNews(news: Omit<NewsCacheRow, "id" | "cached_at">[]): void {
  if (!news.length) return;
  const db = getDb();
  const del = db.prepare("DELETE FROM news_cache WHERE source = ? AND source_name = ?");
  const ins = db.prepare(`
    INSERT INTO news_cache (source, source_name, title, summary, url, published_at)
    VALUES (@source, @source_name, @title, @summary, @url, @published_at)
  `);
  const tx = db.transaction(() => {
    for (const item of news) {
      del.run(item.source, item.source_name || null);
      ins.run({
        source: item.source,
        source_name: item.source_name || null,
        title: item.title,
        summary: item.summary || null,
        url: item.url || null,
        published_at: item.published_at || null,
      });
    }
  });
  tx();
}

export function getCachedNews(source: string, limit = 5): NewsCacheRow[] {
  return getDb().prepare(
    "SELECT * FROM news_cache WHERE source = ? ORDER BY cached_at DESC LIMIT ?"
  ).all(source, limit) as NewsCacheRow[];
}

export function cleanExpiredNews(maxAgeHours = 24): number {
  const result = getDb().prepare(
    `DELETE FROM news_cache WHERE cached_at < datetime('now', '-' || ? || ' hours')`
  ).run(maxAgeHours);
  return result.changes;
}

export function isNewsCacheFresh(source: string, maxAgeHours = 6): boolean {
  const row = getDb().prepare(
    `SELECT cached_at FROM news_cache WHERE source = ? AND cached_at > datetime('now', '-' || ? || ' hours') LIMIT 1`
  ).get(source, maxAgeHours) as { cached_at: string } | undefined;
  return !!row;
}

/* ── Migration: Markdown → SQLite ── */

export function migrateFromFiles(): number {
  const db = getDb();
  let count = 0;
  const root = path.join(process.cwd());

  // applications.md
  const appsPath = path.join(DATA_DIR, "applications.md");
  if (fs.existsSync(appsPath)) {
    const content = fs.readFileSync(appsPath, "utf-8");
    const lines = content.split("\n");
    for (const line of lines) {
      const m = line.match(/^\|\s*(\d+)\s*\|\s*(\S+)\s*\|\s*(.+?)\s*\|\s*(.+?)\s*\|\s*([\d.]+)\s*\|\s*(\S+)\s*\|\s*(\S+)\s*\|\s*(.+?)\s*\|\s*(.*?)\s*\|$/);
      if (!m) continue;
      const existing = db.prepare("SELECT id FROM applications WHERE company=? AND role=?").get(m[3].trim(), m[4].trim());
      if (!existing) {
        db.prepare(`INSERT INTO applications (num,date,company,role,score,status,pdf_generated,report_path,notes)
          VALUES (?,?,?,?,?,?,?,?,?)`).run(
          parseInt(m[1]), m[2].trim(), m[3].trim(), m[4].trim(), parseFloat(m[5]), m[6].trim(),
          m[7].trim() === "✅" ? 1 : 0, m[8].trim(), m[9].trim()
        );
        count++;
      }
    }
  }

  // reports/*.md
  const reportsDir = path.join(root, "reports");
  if (fs.existsSync(reportsDir)) {
    for (const f of fs.readdirSync(reportsDir).filter(f => /^\d{3}-/.test(f))) {
      const numMatch = f.match(/^(\d+)/);
      if (!numMatch) continue;
      const rn = parseInt(numMatch[1]);
      const existing = db.prepare("SELECT id FROM reports WHERE report_num=?").get(rn);
      if (existing) continue;
      const rc = fs.readFileSync(path.join(reportsDir, f), "utf-8");
      const dateMatch = rc.match(/\*\*日期[：:]\*\*\s*(.+)/);
      const companyMatch = rc.match(/\*\*公司[：:]\*\*\s*(.+)/) || rc.match(/^# .+[：—]\s*(.+)/m);
      const roleMatch = rc.match(/\*\*岗位[：:]\*\*\s*(.+)/) || rc.match(/— (.+)$/m);
      const archMatch = rc.match(/\*\*Archetype[：:]\*\*\s*(.+)/);
      const scoreMatch = rc.match(/\*\*Score[：:]\*\*\s*([\d.]+)/);
      const legitMatch = rc.match(/\*\*Legitimacy[：:]\*\*\s*(.+)/);
      db.prepare(`INSERT INTO reports (report_num,date,company,role,archetype,overall_score,legitimacy,blocks_json,keywords_json)
        VALUES (?,?,?,?,?,?,?,?,?)`).run(
        rn,
        dateMatch?.[1]?.trim() || "",
        companyMatch?.[1]?.trim() || "未知",
        roleMatch?.[1]?.trim() || "未知",
        archMatch?.[1]?.trim() || "",
        parseFloat(scoreMatch?.[1] || "0"),
        legitMatch?.[1]?.trim() || "",
        "{}", "[]"
      );
      count++;
    }
  }

  return count;
}
