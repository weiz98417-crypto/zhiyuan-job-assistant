-- Zhiyuan SQLite Schema
-- Single source of truth for all job search data

-- Users (multi-user auth system)
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,              -- UUID
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  display_name TEXT NOT NULL,
  email TEXT DEFAULT '',
  role TEXT NOT NULL DEFAULT 'member',   -- 'admin' | 'member'
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending' | 'active' | 'rejected'
  token_version INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  approved_at TEXT,
  approved_by TEXT,
  last_login_at TEXT,
  password_changed_at TEXT,
  password_changed_by TEXT,
  must_change_password INTEGER NOT NULL DEFAULT 0,
  last_security_event_at TEXT
);

CREATE TABLE IF NOT EXISTS auth_security_events (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  actor_user_id TEXT,
  target_user_id TEXT,
  actor_role TEXT,
  outcome TEXT NOT NULL,
  reason_code TEXT,
  request_id TEXT NOT NULL,
  source_ip TEXT,
  user_agent TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_auth_security_events_type
  ON auth_security_events(event_type, created_at);
CREATE INDEX IF NOT EXISTS idx_auth_security_events_actor
  ON auth_security_events(actor_user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_auth_security_events_target
  ON auth_security_events(target_user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_auth_security_events_request
  ON auth_security_events(request_id);

CREATE TRIGGER IF NOT EXISTS auth_security_events_no_update
BEFORE UPDATE ON auth_security_events
BEGIN
  SELECT RAISE(ABORT, 'auth_security_events is append-only');
END;

CREATE TRIGGER IF NOT EXISTS auth_security_events_no_delete
BEFORE DELETE ON auth_security_events
BEGIN
  SELECT RAISE(ABORT, 'auth_security_events is append-only');
END;

CREATE TABLE IF NOT EXISTS applications (
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
CREATE INDEX IF NOT EXISTS idx_applications_user_status ON applications(user_id, status, updated_at);

CREATE TABLE IF NOT EXISTS reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  report_num INTEGER NOT NULL UNIQUE,
  date TEXT NOT NULL DEFAULT '',
  company TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL DEFAULT '',
  archetype TEXT NOT NULL DEFAULT '',
  overall_score REAL NOT NULL DEFAULT 0,
  legitimacy TEXT NOT NULL DEFAULT '',
  blocks_json TEXT NOT NULL DEFAULT '{}',
  keywords_json TEXT NOT NULL DEFAULT '[]',
  source_hash TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_reports_source_hash ON reports(source_hash);

CREATE TABLE IF NOT EXISTS jds (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT REFERENCES users(id),
  company TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL DEFAULT '',
  source_type TEXT NOT NULL DEFAULT 'paste',
  source_url TEXT,
  body TEXT NOT NULL DEFAULT '',
  keywords_json TEXT NOT NULL DEFAULT '[]',
  report_id INTEGER REFERENCES reports(report_num),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS profiles (
  id INTEGER PRIMARY KEY DEFAULT 1,
  data_json TEXT NOT NULL DEFAULT '{}',
  goals_json TEXT NOT NULL DEFAULT '{}',
  history_json TEXT NOT NULL DEFAULT '[]',
  last_updated TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS profile_signals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT NOT NULL DEFAULT 'dingwei',
  signal_type TEXT NOT NULL,
  content_json TEXT NOT NULL DEFAULT '{}',
  session_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_profile_signals_type ON profile_signals(signal_type);
CREATE INDEX IF NOT EXISTS idx_profile_signals_created ON profile_signals(created_at);

-- Reference Resumes (user-uploaded exemplary resumes for AI-assisted optimization)
CREATE TABLE IF NOT EXISTS reference_resumes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT REFERENCES users(id),
  name TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'paste',
  sections_json TEXT NOT NULL DEFAULT '[]',
  raw_text TEXT NOT NULL DEFAULT '',
  tags TEXT NOT NULL DEFAULT '[]',
  notes TEXT NOT NULL DEFAULT '',
  role_category TEXT NOT NULL DEFAULT '',
  industry_tags TEXT NOT NULL DEFAULT '[]',
  seniority TEXT NOT NULL DEFAULT '',
  visibility TEXT NOT NULL DEFAULT 'private',
  status TEXT NOT NULL DEFAULT 'active',
  quality_score REAL NOT NULL DEFAULT 0,
  anonymized INTEGER NOT NULL DEFAULT 0,
  shared_text_redacted TEXT NOT NULL DEFAULT '',
  source_hash TEXT NOT NULL DEFAULT '',
  metadata_json TEXT NOT NULL DEFAULT '{}',
  approved_by TEXT,
  approved_at TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_reference_resumes_user ON reference_resumes(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_reference_resumes_visibility ON reference_resumes(visibility, status, role_category);
CREATE INDEX IF NOT EXISTS idx_reference_resumes_hash ON reference_resumes(source_hash);

-- FTS5 full-text index for reference resumes
CREATE VIRTUAL TABLE IF NOT EXISTS reference_resumes_fts USING fts5(
  raw_text,
  content='reference_resumes',
  content_rowid='id',
  tokenize='unicode61'
);

-- Triggers to keep FTS5 index in sync
CREATE TRIGGER IF NOT EXISTS ref_resumes_ai AFTER INSERT ON reference_resumes BEGIN
  INSERT INTO reference_resumes_fts(rowid, raw_text) VALUES (new.id, new.raw_text);
END;

CREATE TRIGGER IF NOT EXISTS ref_resumes_ad AFTER DELETE ON reference_resumes BEGIN
  INSERT INTO reference_resumes_fts(reference_resumes_fts, rowid, raw_text) VALUES ('delete', old.id, old.raw_text);
END;

CREATE TRIGGER IF NOT EXISTS ref_resumes_au AFTER UPDATE ON reference_resumes BEGIN
  INSERT INTO reference_resumes_fts(reference_resumes_fts, rowid, raw_text) VALUES ('delete', old.id, old.raw_text);
  INSERT INTO reference_resumes_fts(rowid, raw_text) VALUES (new.id, new.raw_text);
END;

-- Optimization preference tracking (accept/reject events)
CREATE TABLE IF NOT EXISTS optimization_preferences (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  section_id TEXT NOT NULL,
  variant_type TEXT NOT NULL,
  action TEXT NOT NULL,
  original_text TEXT,
  optimized_text TEXT,
  operation TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_opt_prefs_created ON optimization_preferences(created_at);

-- Resume edit proposals: durable draft approval queue for agent-generated CV edits
CREATE TABLE IF NOT EXISTS resume_edit_proposals (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id),
  section_id TEXT NOT NULL,
  base_version TEXT NOT NULL DEFAULT '',
  base_hash TEXT NOT NULL DEFAULT '',
  original_content TEXT NOT NULL DEFAULT '',
  proposed_content TEXT NOT NULL DEFAULT '',
  proposed_hash TEXT NOT NULL DEFAULT '',
  reason TEXT NOT NULL DEFAULT '',
  risk_flags_json TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_resume_edit_proposals_user_status ON resume_edit_proposals(user_id, status, updated_at);

-- News Cache for homepage industry/company news feed
CREATE TABLE IF NOT EXISTS news_cache (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT NOT NULL,
  source_name TEXT,
  title TEXT NOT NULL,
  summary TEXT,
  url TEXT,
  published_at TEXT,
  cached_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_news_cache_source ON news_cache(source);
CREATE INDEX IF NOT EXISTS idx_news_cache_cached ON news_cache(cached_at);

-- Chat Sessions (P1: server-side session persistence)
CREATE TABLE IF NOT EXISTS sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL DEFAULT '新对话',
  messages_json TEXT NOT NULL DEFAULT '[]',
  memory_digest TEXT,
  interview_state_json TEXT NOT NULL DEFAULT '{}',
  agent_state_json TEXT NOT NULL DEFAULT '{}',
  pinned INTEGER NOT NULL DEFAULT 0,
  deleted_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_sessions_updated ON sessions(updated_at);

-- CV Data (P1: server-side CV storage)
CREATE TABLE IF NOT EXISTS cv_data (
  id INTEGER PRIMARY KEY DEFAULT 1,
  data_json TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Offers (P2: offer comparison data)
CREATE TABLE IF NOT EXISTS offers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT REFERENCES users(id),
  company TEXT NOT NULL,
  role TEXT NOT NULL,
  monthly_salary REAL NOT NULL DEFAULT 0,
  months_per_year INTEGER NOT NULL DEFAULT 12,
  annual_bonus REAL DEFAULT 0,
  has_social_insurance INTEGER NOT NULL DEFAULT 1,
  housing_fund_rate INTEGER NOT NULL DEFAULT 7,
  options TEXT,
  probation_months INTEGER NOT NULL DEFAULT 3,
  start_date TEXT,
  other_benefits TEXT,
  location TEXT,
  level TEXT,
  employment_form TEXT NOT NULL DEFAULT 'unknown',
  employer_name TEXT,
  contract_months INTEGER,
  overtime_policy TEXT NOT NULL DEFAULT 'unknown',
  bonus_guarantee TEXT NOT NULL DEFAULT 'unknown',
  equity_type TEXT,
  equity_vesting TEXT,
  commute_minutes INTEGER,
  city_cost_level TEXT NOT NULL DEFAULT 'unknown',
  job_nature TEXT,
  benefits_json TEXT NOT NULL DEFAULT '{}',
  application_id INTEGER REFERENCES applications(id),
  latest_report_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, company, role)
);

-- Offer comparison reports (P2: persisted export snapshots)
CREATE TABLE IF NOT EXISTS offer_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT REFERENCES users(id),
  title TEXT NOT NULL DEFAULT 'Offer 对比报告',
  report_type TEXT NOT NULL DEFAULT 'comparison',
  model_version TEXT NOT NULL DEFAULT '',
  offer_id INTEGER REFERENCES offers(id),
  overall_score REAL NOT NULL DEFAULT 0,
  verdict TEXT NOT NULL DEFAULT '',
  summary TEXT NOT NULL DEFAULT '',
  offer_snapshot_json TEXT NOT NULL DEFAULT '{}',
  modules_json TEXT NOT NULL DEFAULT '[]',
  red_flags_json TEXT NOT NULL DEFAULT '[]',
  missing_info_json TEXT NOT NULL DEFAULT '[]',
  negotiation_levers_json TEXT NOT NULL DEFAULT '[]',
  hr_questions_json TEXT NOT NULL DEFAULT '[]',
  assumptions_json TEXT NOT NULL DEFAULT '[]',
  take_home_json TEXT NOT NULL DEFAULT '{}',
  offers_json TEXT NOT NULL DEFAULT '[]',
  report_markdown TEXT NOT NULL DEFAULT '',
  num_offers INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_offers_user ON offers(user_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_offer_reports_user ON offer_reports(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_offer_reports_offer ON offer_reports(offer_id, created_at);

-- STAR Stories (P2: interview story bank)
CREATE TABLE IF NOT EXISTS stories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  situation TEXT NOT NULL DEFAULT '',
  task TEXT NOT NULL DEFAULT '',
  action TEXT NOT NULL DEFAULT '',
  result TEXT NOT NULL DEFAULT '',
  tags_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Agent Preferences (P1: preference model with decay)
CREATE TABLE IF NOT EXISTS agent_preferences (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type TEXT NOT NULL,
  entity_key TEXT NOT NULL,
  weight REAL NOT NULL DEFAULT 1.0,
  decay_rate REAL NOT NULL DEFAULT 0.05,
  last_updated TEXT NOT NULL DEFAULT (datetime('now')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(entity_type, entity_key)
);
CREATE INDEX IF NOT EXISTS idx_agent_prefs_type ON agent_preferences(entity_type);

-- Session Memory (cross-session semantic + episodic)
CREATE TABLE IF NOT EXISTS session_memory (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER DEFAULT 0,
  summary_type TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_session_memory_type ON session_memory(summary_type);
