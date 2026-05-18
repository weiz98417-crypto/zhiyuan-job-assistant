import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

const DB_PATH = path.join(process.cwd(), "data", "zhiyuan.db");
const SCHEMA_PATH = path.join(process.cwd(), "src", "lib", "server-schema.sql");

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!_db) {
    const dir = path.dirname(DB_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    _db = new Database(DB_PATH);
    _db.pragma("journal_mode = WAL");
    _db.pragma("foreign_keys = ON");
    const schema = fs.readFileSync(SCHEMA_PATH, "utf-8");
    _db.exec(schema);

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

    // Migration: multi-user auth — add user_id to private + attribution tables
    const userTables = [
      'profiles', 'profile_signals', 'sessions', 'stories', 'cv_data',
      'applications', 'agent_preferences', 'session_memory',
      'optimization_preferences', 'reports',
    ];
    for (const table of userTables) {
      const tCols = _db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
      if (!tCols.some((c) => c.name === 'user_id')) {
        _db.exec(`ALTER TABLE ${table} ADD COLUMN user_id TEXT REFERENCES users(id)`);
      }
    }
  }
  return _db;
}

/* ── Applications ── */

export interface AppRow {
  id?: number; num: number; date: string; company: string; role: string;
  score: number; status: string; pdf_generated: number; report_path: string; notes: string;
}

export function listApps(filters?: { status?: string; company?: string; limit?: number; offset?: number }, userId?: string): AppRow[] {
  const db = getDb();
  let sql = "SELECT * FROM applications WHERE 1=1";
  const params: Record<string, unknown> = {};
  if (userId) { sql += " AND user_id = @userId"; params.userId = userId; }
  if (filters?.status) { sql += " AND status = @status"; params.status = filters.status; }
  if (filters?.company) { sql += " AND company LIKE @company"; params.company = `%${filters.company}%`; }
  sql += " ORDER BY num DESC";
  if (filters?.limit) { sql += " LIMIT @limit"; params.limit = filters.limit; }
  if (filters?.offset) { sql += " OFFSET @offset"; params.offset = filters.offset; }
  return db.prepare(sql).all(params) as AppRow[];
}

export function upsertApp(app: AppRow, userId?: string): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO applications (user_id, num, date, company, role, score, status, pdf_generated, report_path, notes, updated_at)
    VALUES (@userId, @num, @date, @company, @role, @score, @status, @pdf_generated, @report_path, @notes, datetime('now'))
    ON CONFLICT(company, role) DO UPDATE SET
      score=excluded.score, status=excluded.status, report_path=excluded.report_path,
      notes=excluded.notes, updated_at=datetime('now')
  `).run({ ...app, userId: userId || null });
}

/* ── Reports ── */

export interface ReportRow {
  id?: number; report_num: number; date: string; company: string; role: string;
  archetype: string; overall_score: number; legitimacy: string; blocks_json: string; keywords_json: string;
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
    INSERT INTO reports (user_id, report_num, date, company, role, archetype, overall_score, legitimacy, blocks_json, keywords_json)
    VALUES (@userId, @report_num, @date, @company, @role, @archetype, @overall_score, @legitimacy, @blocks_json, @keywords_json)
    ON CONFLICT(report_num) DO UPDATE SET
      overall_score=excluded.overall_score, legitimacy=excluded.legitimacy,
      blocks_json=excluded.blocks_json, keywords_json=excluded.keywords_json
  `).run({ ...r, userId: userId || null });
}

/* ── JDs ── */

export interface JDRow {
  id?: number; company: string; role: string; source_type: string;
  source_url?: string; body: string; keywords_json: string; report_id?: number;
}

export function listJDs(): JDRow[] {
  return getDb().prepare("SELECT * FROM jds ORDER BY id DESC").all() as JDRow[];
}

export function insertJD(jd: JDRow): void {
  getDb().prepare(`
    INSERT INTO jds (company, role, source_type, source_url, body, keywords_json, report_id)
    VALUES (@company, @role, @source_type, @source_url, @body, @keywords_json, @report_id)
  `).run(jd);
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
  name: string;
  source: string;
  sections_json: string;
  raw_text: string;
  tags: string;
  notes: string;
  created_at: string;
}

export interface ReferenceResumeSummary {
  id: number;
  name: string;
  source: string;
  tags: string;
  notes: string;
  created_at: string;
}

export function insertReferenceResume(r: {
  name: string;
  source: string;
  sections_json: string;
  raw_text: string;
  tags?: string;
  notes?: string;
}): number {
  const db = getDb();
  const result = db.prepare(`
    INSERT INTO reference_resumes (name, source, sections_json, raw_text, tags, notes)
    VALUES (@name, @source, @sections_json, @raw_text, @tags, @notes)
  `).run({
    name: r.name,
    source: r.source,
    sections_json: r.sections_json,
    raw_text: r.raw_text,
    tags: r.tags || "[]",
    notes: r.notes || "",
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
  const appsPath = path.join(root, "data", "applications.md");
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
