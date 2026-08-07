import type { PoolClient } from "pg";
import { getDb } from "@/lib/server-db";
import {
  bootstrapPostgresSchema,
  getDatabaseDriver,
  isPostgresConfigured,
  withPostgresClient,
  type DatabaseDriver,
} from "@/lib/postgres";
import {
  applyResumeEditProposalToCvData,
  buildResumeEditProposalRecord,
  parseCvDataJson,
  ResumeEditProposalApplyError,
  rollbackResumeEditProposalInCvData,
  type ResumeEditProposalInput,
  type ResumeEditProposalApplyResult,
  type ResumeEditProposalRecord,
  type ResumeEditProposalRollbackResult,
  type ResumeEditProposalStatus,
} from "@/lib/agent/resume-edit-proposals";
import type {
  ApplicationEventRow,
  AppRow,
  JDRow,
  NewsCacheRow,
  PreferenceRow,
  ProfileRow,
  ReferenceResumeRow,
  ReferenceResumeSummary,
  ReportRow,
  SignalQuery,
  SignalRow,
} from "@/lib/server-db";
import { normalizeApplicationStatus } from "@/lib/application-status";
import { sanitizeAuditMetadata } from "@/lib/security/audit-metadata";

type AnyRow = Record<string, unknown>;

const JSON_COLUMNS = new Set([
  "blocks_json",
  "keywords_json",
  "data_json",
  "goals_json",
  "history_json",
  "content_json",
  "sections_json",
  "tags",
  "industry_tags",
  "risk_flags_json",
  "metadata_json",
  "messages_json",
  "interview_state_json",
  "agent_state_json",
  "benefits_json",
  "offer_snapshot_json",
  "modules_json",
  "red_flags_json",
  "missing_info_json",
  "negotiation_levers_json",
  "hr_questions_json",
  "assumptions_json",
  "take_home_json",
  "offers_json",
  "title_positive_json",
  "title_negative_json",
  "error_log",
]);

const USER_PRIVATE_TABLES = [
  "profiles",
  "profile_signals",
  "sessions",
  "stories",
  "cv_data",
  "applications",
  "agent_preferences",
  "session_memory",
  "optimization_preferences",
  "resume_edit_proposals",
  "reports",
  "jds",
  "offers",
  "offer_reports",
  "reference_resumes",
  "reference_resume_usage",
  "application_events",
  "memory_evidence",
  "memory_status_transitions",
  "memory_chunks",
  "memory_items",
  "scan_source_runs",
  "scan_jobs",
  "scan_queue",
];

export interface UserRecord extends AnyRow {
  id: string;
  username: string;
  password_hash: string;
  display_name: string;
  email?: string;
  role: string;
  status: string;
  token_version: number;
  password_changed_at?: string | null;
  password_changed_by?: string | null;
  must_change_password?: number | boolean;
  last_security_event_at?: string | null;
}

export interface AuthSecurityEventInput {
  id: string;
  eventType: string;
  actorUserId?: string;
  targetUserId?: string;
  actorRole?: string;
  outcome: string;
  reasonCode?: string;
  requestId: string;
  sourceIp?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
}

export interface AuthSecurityEventRecord {
  id: string;
  eventType: string;
  actorUserId?: string;
  targetUserId?: string;
  actorRole?: string;
  outcome: string;
  reasonCode?: string;
  requestId: string;
  sourceIp?: string;
  userAgent?: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface AuthSecurityEventFilters {
  eventType?: string;
  outcome?: string;
  actorUserId?: string;
  targetUserId?: string;
  limit: number;
  offset: number;
}

export interface PasswordRecoveryRequestRecord {
  id: string;
  userId: string;
  status: 'pending' | 'completed' | 'dismissed';
  sourceIp?: string;
  userAgent?: string;
  requestedAt: string;
  resolvedAt?: string;
  resolvedBy?: string;
  resolution?: string;
}

export type SecureUserMutationResult =
  | { ok: true; user: UserRecord }
  | { ok: false; reason: 'LAST_ACTIVE_SUPERADMIN' | 'TARGET_NOT_FOUND' };

export type SecureUserDeleteResult =
  | { ok: true; username: string }
  | { ok: false; reason: 'LAST_ACTIVE_SUPERADMIN' | 'TARGET_NOT_FOUND' };

export interface DataRepositories {
  driver: DatabaseDriver;
  assertReady(): Promise<void>;
  users: {
    findByUsername(username: string): Promise<UserRecord | undefined>;
    findByUsernameOrEmail(identifier: string): Promise<UserRecord | undefined>;
    findById(id: string): Promise<UserRecord | undefined>;
    list(status?: string): Promise<UserRecord[]>;
    countActiveAdmins(): Promise<number>;
    create(input: {
      id: string;
      username: string;
      passwordHash: string;
      displayName: string;
      email: string;
      role: string;
      status: string;
    }): Promise<void>;
    updateLastLogin(id: string): Promise<void>;
    activateFirstAdmin(id: string): Promise<void>;
    verifyTokenVersion(userId: string, tokenVersion: number): Promise<boolean>;
    updateStatus(id: string, status: string, approvedBy: string): Promise<UserRecord | undefined>;
    updateStatusWithAudit(input: {
      userId: string;
      status: 'pending' | 'active' | 'rejected';
      approvedBy: string;
      event: AuthSecurityEventInput;
    }): Promise<SecureUserMutationResult>;
    updateRole(id: string, role: string): Promise<UserRecord | undefined>;
    updateRoleWithAudit(input: {
      userId: string;
      role: 'member' | 'admin' | 'superadmin';
      event: AuthSecurityEventInput;
    }): Promise<SecureUserMutationResult>;
    resetPassword(id: string, passwordHash: string): Promise<boolean>;
    resetPasswordWithAudit(input: {
      userId: string;
      passwordHash: string;
      changedBy: string;
      event: AuthSecurityEventInput;
    }): Promise<boolean>;
    changeOwnPassword(input: {
      userId: string;
      passwordHash: string;
      changedBy: string;
      event: AuthSecurityEventInput;
    }): Promise<boolean>;
    deleteWithAudit(input: {
      userId: string;
      event: AuthSecurityEventInput;
    }): Promise<SecureUserDeleteResult>;
    deleteCascade(id: string): Promise<boolean>;
  };
  securityEvents: {
    append(event: AuthSecurityEventInput): Promise<void>;
    list(filters: AuthSecurityEventFilters): Promise<{
      events: AuthSecurityEventRecord[];
      total: number;
    }>;
  };
  passwordRecoveryRequests: {
    submitForUser(input: {
      id: string;
      userId: string;
      sourceIp?: string;
      userAgent?: string;
      event: AuthSecurityEventInput;
    }): Promise<PasswordRecoveryRequestRecord>;
    listPending(): Promise<PasswordRecoveryRequestRecord[]>;
    completeWithPasswordReset(input: {
      requestId: string;
      userId: string;
      passwordHash: string;
      changedBy: string;
      event: AuthSecurityEventInput;
    }): Promise<boolean>;
  };
  cv: {
    get(userId: string): Promise<{ data_json: string } | undefined>;
    upsert(userId: string, data: unknown): Promise<void>;
  };
  resumeEditProposals: {
    create(input: ResumeEditProposalInput, userId: string): Promise<ResumeEditProposalRecord>;
    get(id: string, userId: string): Promise<ResumeEditProposalRecord | undefined>;
    listPending(userId: string): Promise<ResumeEditProposalRecord[]>;
    listByStatus(userId: string, status: ResumeEditProposalStatus, limit?: number): Promise<ResumeEditProposalRecord[]>;
    apply(id: string, userId: string): Promise<ResumeEditProposalApplyResult>;
    discard(id: string, userId: string): Promise<ResumeEditProposalRecord>;
    rollback(id: string, userId: string): Promise<ResumeEditProposalRollbackResult>;
  };
  applications: {
    list(filters: ApplicationListFilters, userId: string): Promise<AppRow[]>;
    get(id: number, userId: string): Promise<AppRow | undefined>;
    upsert(app: AppRow, userId: string): Promise<AppRow>;
    updateStatus(id: number, status: string, userId: string, note?: string): Promise<AppRow | undefined>;
    insertEvent(event: ApplicationEventInput, userId: string): Promise<ApplicationEventRow>;
    listEvents(applicationId: number, userId: string): Promise<ApplicationEventRow[]>;
  };
  reports: {
    list(userId?: string): Promise<ReportRow[]>;
    get(reportNum: number, userId?: string): Promise<ReportRow | undefined>;
    upsert(report: ReportRow, userId?: string): Promise<void>;
    updateMetadata(reportNum: number, next: Partial<ReportRow> & { keywords_json?: string }, userId?: string): Promise<ReportRow | undefined>;
    delete(reportNum: number, userId?: string): Promise<boolean>;
  };
  jds: {
    list(userId?: string): Promise<JDRow[]>;
    get(id: number, userId?: string): Promise<JDRow | undefined>;
    insert(jd: JDRow, userId?: string): Promise<number>;
    findReusable(input: { source_url?: string; body?: string }, userId?: string): Promise<JDRow | undefined>;
    update(id: number, updates: Partial<JDRow>, userId?: string): Promise<JDRow | undefined>;
    delete(id: number, userId?: string): Promise<number>;
  };
  profiles: {
    get(userId: string): Promise<ProfileRow | undefined>;
    upsert(userId: string, dataJson: string, historyJson: string, goalsJson?: string): Promise<void>;
    deleteSignals(userId: string): Promise<number>;
  };
  signals: {
    insert(signal: Pick<SignalRow, "source" | "signal_type" | "content_json" | "session_id">, userId: string): Promise<number>;
    insertMany(signals: Pick<SignalRow, "source" | "signal_type" | "content_json" | "session_id">[], userId: string): Promise<number[]>;
    query(query: SignalQuery, userId: string): Promise<SignalRow[]>;
    get(id: number, userId: string): Promise<SignalRow | undefined>;
    update(id: number, signal: Partial<Pick<SignalRow, "source" | "signal_type" | "content_json" | "session_id">>, userId: string): Promise<boolean>;
    delete(id: number, userId: string): Promise<boolean>;
  };
  referenceResumes: {
    insert(row: {
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
    }, userId?: string): Promise<number>;
    list(userId?: string): Promise<ReferenceResumeSummary[]>;
    search(query: string, limit: number, userId?: string): Promise<ReferenceResumeRow[]>;
    get(id: number, userId?: string): Promise<ReferenceResumeRow | undefined>;
    update(id: number, updates: Partial<ReferenceResumeRow>, userId?: string): Promise<boolean>;
    delete(id: number, userId?: string): Promise<boolean>;
    nameExists(name: string, excludeId?: number, userId?: string): Promise<boolean>;
    findBySourceHash(sourceHash: string, userId?: string): Promise<ReferenceResumeRow | undefined>;
  };
  sessions: {
    list(userId: string): Promise<AnyRow[]>;
    create(input: { title?: string; messages?: unknown[]; interviewState?: unknown; agentState?: unknown; memoryDigest?: string }, userId: string): Promise<number>;
    get(id: number, userId: string): Promise<AnyRow | undefined>;
    update(id: number, userId: string, updates: AnyRow): Promise<boolean>;
  };
  stories: {
    list(userId: string): Promise<AnyRow[]>;
    create(input: { title: string; situation?: string; task?: string; action?: string; result?: string; tags?: unknown[] }, userId: string): Promise<number>;
  };
  offers: {
    list(userId: string): Promise<AnyRow[]>;
    get(id: number, userId: string): Promise<AnyRow | undefined>;
    upsert(input: AnyRow, userId: string): Promise<{ id: number; created?: boolean; updated?: boolean }>;
    update(id: number, input: AnyRow, userId: string): Promise<AnyRow | undefined>;
    delete(id: number, userId: string): Promise<{ offerId: number; deletedReports: number } | null>;
  };
  offerReports: {
    list(userId: string): Promise<AnyRow[]>;
    get(id: number, userId: string): Promise<AnyRow | undefined>;
    insert(input: AnyRow, userId: string): Promise<number>;
    delete(id: number, userId: string): Promise<{ reportId: number; offerId: number | null } | null>;
  };
  news: {
    cache(news: Omit<NewsCacheRow, "id" | "cached_at">[]): Promise<void>;
    list(source: string, limit?: number): Promise<NewsCacheRow[]>;
    cleanExpired(maxAgeHours?: number): Promise<number>;
    isFresh(source: string, maxAgeHours?: number): Promise<boolean>;
  };
  preferences: {
    record(preference: PreferenceRow, userId: string): Promise<void>;
    listRecent(userId: string, limit?: number): Promise<PreferenceRow[]>;
  };
  agentPreferences: {
    list(userId: string): Promise<AnyRow[]>;
    upsert(input: { entity_type: string; entity_key: string; weight?: number; decay_rate?: number }, userId: string): Promise<void>;
  };
}

function insertSqliteAuthSecurityEvent(
  db: ReturnType<typeof getDb>,
  event: AuthSecurityEventInput,
): void {
  db.prepare(`
    INSERT INTO auth_security_events (
      id, event_type, actor_user_id, target_user_id, actor_role, outcome,
      reason_code, request_id, source_ip, user_agent, metadata_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    event.id,
    event.eventType,
    event.actorUserId || null,
    event.targetUserId || null,
    event.actorRole || null,
    event.outcome,
    event.reasonCode || null,
    event.requestId,
    event.sourceIp || null,
    event.userAgent || null,
    JSON.stringify(sanitizeAuditMetadata(event.metadata)),
  );
}

function mapAuthSecurityEventRow(row: AnyRow): AuthSecurityEventRecord {
  let metadata: Record<string, unknown> = {};
  if (typeof row.metadata_json === 'string') {
    try {
      const parsed = JSON.parse(row.metadata_json);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) metadata = parsed;
    } catch { /* malformed legacy metadata is presented as empty */ }
  } else if (row.metadata_json && typeof row.metadata_json === 'object' && !Array.isArray(row.metadata_json)) {
    metadata = row.metadata_json as Record<string, unknown>;
  }

  return {
    id: String(row.id),
    eventType: String(row.event_type),
    actorUserId: row.actor_user_id ? String(row.actor_user_id) : undefined,
    targetUserId: row.target_user_id ? String(row.target_user_id) : undefined,
    actorRole: row.actor_role ? String(row.actor_role) : undefined,
    outcome: String(row.outcome),
    reasonCode: row.reason_code ? String(row.reason_code) : undefined,
    requestId: String(row.request_id),
    sourceIp: row.source_ip ? String(row.source_ip) : undefined,
    userAgent: row.user_agent ? String(row.user_agent) : undefined,
    metadata,
    createdAt: String(row.created_at),
  };
}

function mapPasswordRecoveryRequestRow(row: AnyRow): PasswordRecoveryRequestRecord {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    status: String(row.status) as PasswordRecoveryRequestRecord['status'],
    sourceIp: row.source_ip ? String(row.source_ip) : undefined,
    userAgent: row.user_agent ? String(row.user_agent) : undefined,
    requestedAt: String(row.requested_at),
    resolvedAt: row.resolved_at ? String(row.resolved_at) : undefined,
    resolvedBy: row.resolved_by ? String(row.resolved_by) : undefined,
    resolution: row.resolution ? String(row.resolution) : undefined,
  };
}

async function insertPostgresAuthSecurityEvent(
  client: PoolClient,
  event: AuthSecurityEventInput,
): Promise<void> {
  await client.query(`
    INSERT INTO auth_security_events (
      id, event_type, actor_user_id, target_user_id, actor_role, outcome,
      reason_code, request_id, source_ip, user_agent, metadata_json
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb)
  `, [
    event.id,
    event.eventType,
    event.actorUserId || null,
    event.targetUserId || null,
    event.actorRole || null,
    event.outcome,
    event.reasonCode || null,
    event.requestId,
    event.sourceIp || null,
    event.userAgent || null,
    JSON.stringify(sanitizeAuditMetadata(event.metadata)),
  ]);
}

export function getDataRepositories(): DataRepositories {
  const driver = getDatabaseDriver();
  return driver === "postgres" ? createPostgresRepositories() : createSqliteRepositories();
}

export async function assertSelectedDatabaseReady(): Promise<void> {
  await getDataRepositories().assertReady();
}

function createSqliteRepositories(): DataRepositories {
  return {
    driver: "sqlite",
    async assertReady() {
      getDb().prepare("SELECT 1").get();
    },
    users: {
      async findByUsername(username) {
        return getDb().prepare("SELECT * FROM users WHERE username = ?").get(username) as UserRecord | undefined;
      },
      async findByUsernameOrEmail(identifier) {
        const db = getDb();
        const username = db.prepare(`
          SELECT * FROM users WHERE lower(username) = lower(?) LIMIT 1
        `).get(identifier) as UserRecord | undefined;
        if (username) return username;
        const emailMatches = db.prepare(`
          SELECT * FROM users
          WHERE email <> '' AND lower(email) = lower(?)
          LIMIT 2
        `).all(identifier) as UserRecord[];
        return emailMatches.length === 1 ? emailMatches[0] : undefined;
      },
      async findById(id) {
        return getDb().prepare("SELECT * FROM users WHERE id = ?").get(id) as UserRecord | undefined;
      },
      async list(status) {
        const sql = status ? "SELECT * FROM users WHERE status = ? ORDER BY created_at DESC" : "SELECT * FROM users ORDER BY created_at DESC";
        const rows = status ? getDb().prepare(sql).all(status) : getDb().prepare(sql).all();
        return rows as UserRecord[];
      },
      async countActiveAdmins() {
        return Number((getDb().prepare("SELECT COUNT(*) as cnt FROM users WHERE status = 'active' AND role IN ('admin', 'superadmin')").get() as { cnt: number }).cnt);
      },
      async create(input) {
        getDb().prepare(`
          INSERT INTO users (id, username, password_hash, display_name, email, role, status, token_version)
          VALUES (?, ?, ?, ?, ?, ?, ?, 0)
        `).run(input.id, input.username, input.passwordHash, input.displayName, input.email, input.role, input.status);
      },
      async updateLastLogin(id) {
        getDb().prepare("UPDATE users SET last_login_at = datetime('now') WHERE id = ?").run(id);
      },
      async activateFirstAdmin(id) {
        getDb().prepare("UPDATE users SET role = 'superadmin', status = 'active' WHERE id = ?").run(id);
      },
      async verifyTokenVersion(userId, tokenVersion) {
        const user = getDb().prepare("SELECT token_version FROM users WHERE id = ?").get(userId) as { token_version: number } | undefined;
        return Boolean(user && user.token_version === tokenVersion);
      },
      async updateStatus(id, status, approvedBy) {
        getDb().prepare(`
          UPDATE users SET status = ?, token_version = token_version + 1,
          approved_at = datetime('now'), approved_by = ?
          WHERE id = ?
        `).run(status, approvedBy, id);
        return this.findById(id);
      },
      async updateStatusWithAudit(input) {
        const db = getDb();
        const update = db.transaction((): SecureUserMutationResult => {
          const target = db.prepare("SELECT * FROM users WHERE id = ?").get(input.userId) as UserRecord | undefined;
          if (!target) {
            insertSqliteAuthSecurityEvent(db, {
              ...input.event, outcome: 'failure', reasonCode: 'TARGET_NOT_FOUND',
            });
            return { ok: false, reason: 'TARGET_NOT_FOUND' };
          }
          if (
            target.role === 'superadmin' &&
            target.status === 'active' &&
            input.status !== 'active'
          ) {
            const count = Number((db.prepare(`
              SELECT COUNT(*) AS count FROM users
              WHERE role = 'superadmin' AND status = 'active'
            `).get() as { count: number }).count);
            if (count <= 1) {
              insertSqliteAuthSecurityEvent(db, {
                ...input.event, outcome: 'failure', reasonCode: 'LAST_ACTIVE_SUPERADMIN',
              });
              db.prepare("UPDATE users SET last_security_event_at = datetime('now') WHERE id = ?").run(input.userId);
              return { ok: false, reason: 'LAST_ACTIVE_SUPERADMIN' };
            }
          }
          db.prepare(`
            UPDATE users
            SET status = ?, token_version = token_version + 1,
                approved_at = datetime('now'), approved_by = ?,
                last_security_event_at = datetime('now')
            WHERE id = ?
          `).run(input.status, input.approvedBy, input.userId);
          insertSqliteAuthSecurityEvent(db, input.event);
          const user = db.prepare("SELECT * FROM users WHERE id = ?").get(input.userId) as UserRecord;
          return { ok: true, user };
        });
        return update();
      },
      async updateRole(id, role) {
        getDb().prepare("UPDATE users SET role = ?, token_version = token_version + 1 WHERE id = ?").run(role, id);
        return this.findById(id);
      },
      async updateRoleWithAudit(input) {
        const db = getDb();
        const update = db.transaction((): SecureUserMutationResult => {
          const target = db.prepare(
            "SELECT * FROM users WHERE id = ?",
          ).get(input.userId) as UserRecord | undefined;
          if (!target) {
            insertSqliteAuthSecurityEvent(db, {
              ...input.event,
              outcome: 'failure',
              reasonCode: 'TARGET_NOT_FOUND',
            });
            return { ok: false, reason: 'TARGET_NOT_FOUND' };
          }

          if (
            target.role === 'superadmin' &&
            target.status === 'active' &&
            input.role !== 'superadmin'
          ) {
            const count = Number((db.prepare(`
              SELECT COUNT(*) AS count
              FROM users
              WHERE role = 'superadmin' AND status = 'active'
            `).get() as { count: number }).count);
            if (count <= 1) {
              insertSqliteAuthSecurityEvent(db, {
                ...input.event,
                outcome: 'failure',
                reasonCode: 'LAST_ACTIVE_SUPERADMIN',
              });
              db.prepare(
                "UPDATE users SET last_security_event_at = datetime('now') WHERE id = ?",
              ).run(input.userId);
              return { ok: false, reason: 'LAST_ACTIVE_SUPERADMIN' };
            }
          }

          db.prepare(`
            UPDATE users
            SET role = ?, token_version = token_version + 1,
                last_security_event_at = datetime('now')
            WHERE id = ?
          `).run(input.role, input.userId);
          insertSqliteAuthSecurityEvent(db, input.event);
          const user = db.prepare("SELECT * FROM users WHERE id = ?").get(input.userId) as UserRecord;
          return { ok: true, user };
        });
        return update();
      },
      async resetPassword(id, passwordHash) {
        return getDb().prepare("UPDATE users SET password_hash = ?, token_version = token_version + 1 WHERE id = ?").run(passwordHash, id).changes > 0;
      },
      async resetPasswordWithAudit(input) {
        const db = getDb();
        const reset = db.transaction(() => {
          const result = db.prepare(`
            UPDATE users
            SET password_hash = ?,
                token_version = token_version + 1,
                password_changed_at = datetime('now'),
                password_changed_by = ?,
                must_change_password = 1,
                last_security_event_at = datetime('now')
            WHERE id = ?
          `).run(input.passwordHash, input.changedBy, input.userId);
          if (result.changes === 0) return false;
          insertSqliteAuthSecurityEvent(db, input.event);
          return true;
        });
        return reset();
      },
      async changeOwnPassword(input) {
        const db = getDb();
        const change = db.transaction(() => {
          const result = db.prepare(`
            UPDATE users
            SET password_hash = ?,
                token_version = token_version + 1,
                password_changed_at = datetime('now'),
                password_changed_by = ?,
                must_change_password = 0,
                last_security_event_at = datetime('now')
            WHERE id = ?
          `).run(input.passwordHash, input.changedBy, input.userId);
          if (result.changes === 0) return false;
          insertSqliteAuthSecurityEvent(db, input.event);
          return true;
        });
        return change();
      },
      async deleteWithAudit(input) {
        const db = getDb();
        const remove = db.transaction((): SecureUserDeleteResult => {
          const target = db.prepare("SELECT * FROM users WHERE id = ?").get(input.userId) as UserRecord | undefined;
          if (!target) {
            insertSqliteAuthSecurityEvent(db, {
              ...input.event, outcome: 'failure', reasonCode: 'TARGET_NOT_FOUND',
            });
            return { ok: false, reason: 'TARGET_NOT_FOUND' };
          }
          if (target.role === 'superadmin' && target.status === 'active') {
            const count = Number((db.prepare(`
              SELECT COUNT(*) AS count FROM users
              WHERE role = 'superadmin' AND status = 'active'
            `).get() as { count: number }).count);
            if (count <= 1) {
              insertSqliteAuthSecurityEvent(db, {
                ...input.event, outcome: 'failure', reasonCode: 'LAST_ACTIVE_SUPERADMIN',
              });
              db.prepare("UPDATE users SET last_security_event_at = datetime('now') WHERE id = ?").run(input.userId);
              return { ok: false, reason: 'LAST_ACTIVE_SUPERADMIN' };
            }
          }
          for (const table of USER_PRIVATE_TABLES) {
            try { db.prepare(`DELETE FROM ${table} WHERE user_id = ?`).run(input.userId); } catch { /* old databases may omit tables */ }
          }
          insertSqliteAuthSecurityEvent(db, input.event);
          db.prepare("DELETE FROM users WHERE id = ?").run(input.userId);
          return { ok: true, username: target.username };
        });
        return remove();
      },
      async deleteCascade(id) {
        const db = getDb();
        const tx = db.transaction(() => {
          for (const table of USER_PRIVATE_TABLES) {
            try { db.prepare(`DELETE FROM ${table} WHERE user_id = ?`).run(id); } catch { /* table may not exist in old db */ }
          }
          return db.prepare("DELETE FROM users WHERE id = ?").run(id).changes > 0;
        });
        return tx();
      },
    },
    securityEvents: {
      async append(event) {
        const db = getDb();
        const append = db.transaction(() => {
          insertSqliteAuthSecurityEvent(db, event);
          const userId = event.targetUserId || event.actorUserId;
          if (userId) {
            db.prepare(
              "UPDATE users SET last_security_event_at = datetime('now') WHERE id = ?",
            ).run(userId);
          }
        });
        append();
      },
      async list(filters) {
        const where: string[] = [];
        const params: unknown[] = [];
        const add = (column: string, value?: string) => {
          if (!value) return;
          where.push(`${column} = ?`);
          params.push(value);
        };
        add('event_type', filters.eventType);
        add('outcome', filters.outcome);
        add('actor_user_id', filters.actorUserId);
        add('target_user_id', filters.targetUserId);
        const clause = where.length ? ` WHERE ${where.join(' AND ')}` : '';
        const db = getDb();
        const total = Number((db.prepare(
          `SELECT COUNT(*) AS count FROM auth_security_events${clause}`,
        ).get(...params) as { count: number }).count);
        const rows = db.prepare(`
          SELECT * FROM auth_security_events${clause}
          ORDER BY created_at DESC, id DESC
          LIMIT ? OFFSET ?
        `).all(...params, filters.limit, filters.offset) as AnyRow[];
        return { events: rows.map(mapAuthSecurityEventRow), total };
      },
    },
    passwordRecoveryRequests: createSqlitePasswordRecoveryRepository(),
    cv: {
      async get(userId) {
        return getDb().prepare("SELECT data_json FROM cv_data WHERE user_id = ?").get(userId) as { data_json: string } | undefined;
      },
      async upsert(userId, data) {
        const dataJson = JSON.stringify(data || {});
        const existing = getDb().prepare("SELECT id FROM cv_data WHERE user_id = ?").get(userId);
        if (existing) getDb().prepare("UPDATE cv_data SET data_json = ?, updated_at = datetime('now') WHERE user_id = ?").run(dataJson, userId);
        else getDb().prepare("INSERT INTO cv_data (user_id, data_json, updated_at) VALUES (?, ?, datetime('now'))").run(userId, dataJson);
      },
    },
    resumeEditProposals: createSqliteResumeEditProposalRepository(),
    applications: {
      async list(filters, userId) {
        let sql = "SELECT * FROM applications WHERE user_id = ?";
        const params: unknown[] = [userId];
        if (filters.id) { sql += " AND id = ?"; params.push(filters.id); }
        if (filters.reportNum) { sql += " AND (num = ? OR report_path LIKE ?)"; params.push(filters.reportNum, `%${String(filters.reportNum).padStart(3, "0")}%`); }
        if (filters.jdId) { sql += " AND jd_id = ?"; params.push(filters.jdId); }
        if (filters.status) { sql += " AND lower(status) = ?"; params.push(normalizeApplicationStatus(filters.status)); }
        if (filters.company) { sql += " AND company LIKE ?"; params.push(`%${filters.company}%`); }
        if (filters.role) { sql += " AND role LIKE ?"; params.push(`%${filters.role}%`); }
        if (typeof filters.score_min === "number" && Number.isFinite(filters.score_min)) { sql += " AND score >= ?"; params.push(filters.score_min); }
        if (filters.date_from) { sql += " AND date >= ?"; params.push(filters.date_from); }
        sql += " ORDER BY num DESC";
        if (filters.limit) { sql += " LIMIT ?"; params.push(filters.limit); }
        if (filters.offset) { sql += " OFFSET ?"; params.push(filters.offset); }
        return (getDb().prepare(sql).all(...params) as AppRow[]).map(normalizeApplicationRecord);
      },
      async get(id, userId) {
        const row = getDb().prepare("SELECT * FROM applications WHERE id = ? AND user_id = ?").get(id, userId) as AppRow | undefined;
        return row ? normalizeApplicationRecord(row) : undefined;
      },
      async upsert(app, userId) {
        const payload = normalizeApplicationPayload(app);
        const existing = getDb().prepare("SELECT id FROM applications WHERE user_id = ? AND lower(company) = lower(?) AND lower(role) = lower(?)").get(userId, payload.company, payload.role) as { id: number } | undefined;
        if (existing) {
          getDb().prepare(`
            UPDATE applications SET num=@num, date=@date, score=@score, status=@status, pdf_generated=@pdf_generated,
              report_path=@report_path, notes=@notes, jd_id=COALESCE(@jd_id, jd_id),
              source_url=COALESCE(NULLIF(@source_url, ''), source_url),
              metadata_json=@metadata_json, updated_at=datetime('now')
            WHERE id=@id AND user_id=@user_id
          `).run({ ...payload, id: existing.id, user_id: userId });
          const updated = await this.get(existing.id, userId);
          if (!updated) throw new Error("Application upsert read-back failed");
          return updated;
        }
        const result = getDb().prepare(`
          INSERT INTO applications (user_id, num, date, company, role, score, status, pdf_generated, report_path, notes, jd_id, source_url, metadata_json, updated_at)
          VALUES (@user_id, @num, @date, @company, @role, @score, @status, @pdf_generated, @report_path, @notes, @jd_id, @source_url, @metadata_json, datetime('now'))
          ON CONFLICT(user_id, company, role) DO UPDATE SET
            score=excluded.score, status=excluded.status, report_path=excluded.report_path,
            notes=excluded.notes, jd_id=COALESCE(excluded.jd_id, applications.jd_id),
            source_url=COALESCE(NULLIF(excluded.source_url, ''), applications.source_url),
            metadata_json=excluded.metadata_json, updated_at=datetime('now')
        `).run({ ...payload, user_id: userId });
        const id = Number(result.lastInsertRowid) || (getDb().prepare("SELECT id FROM applications WHERE user_id = ? AND lower(company) = lower(?) AND lower(role) = lower(?)").get(userId, payload.company, payload.role) as { id: number } | undefined)?.id;
        const saved = id ? await this.get(id, userId) : undefined;
        if (!saved) throw new Error("Application upsert read-back failed");
        return saved;
      },
      async updateStatus(id, status, userId, note) {
        const normalized = normalizeApplicationStatus(status);
        getDb().prepare("UPDATE applications SET status = ?, notes = COALESCE(NULLIF(?, ''), notes), updated_at = datetime('now') WHERE id = ? AND user_id = ?")
          .run(normalized, note || "", id, userId);
        return this.get(id, userId);
      },
      async insertEvent(event, userId) {
        const payload = normalizeApplicationEventPayload(event);
        const result = getDb().prepare(`
          INSERT INTO application_events (user_id, application_id, event_type, from_status, to_status, note, source, metadata_json)
          VALUES (@user_id, @application_id, @event_type, @from_status, @to_status, @note, @source, @metadata_json)
        `).run({ ...payload, user_id: userId });
        const row = getDb().prepare("SELECT * FROM application_events WHERE id = ? AND user_id = ?").get(Number(result.lastInsertRowid), userId) as ApplicationEventRow | undefined;
        if (!row) throw new Error("Application event read-back failed");
        return normalizeApplicationEventRecord(row);
      },
      async listEvents(applicationId, userId) {
        return (getDb().prepare("SELECT * FROM application_events WHERE application_id = ? AND user_id = ? ORDER BY created_at DESC, id DESC").all(applicationId, userId) as ApplicationEventRow[])
          .map(normalizeApplicationEventRecord);
      },
    },
    reports: {
      async list(userId) {
        return userId
          ? getDb().prepare("SELECT * FROM reports WHERE user_id = ? ORDER BY report_num DESC").all(userId) as ReportRow[]
          : getDb().prepare("SELECT * FROM reports ORDER BY report_num DESC").all() as ReportRow[];
      },
      async get(reportNum, userId) {
        const sql = userId ? "SELECT * FROM reports WHERE report_num = ? AND user_id = ?" : "SELECT * FROM reports WHERE report_num = ?";
        const params = userId ? [reportNum, userId] : [reportNum];
        return getDb().prepare(sql).get(...params) as ReportRow | undefined;
      },
      async upsert(report, userId) {
        getDb().prepare(`
          INSERT INTO reports (user_id, report_num, date, company, role, archetype, overall_score, legitimacy, blocks_json, keywords_json, source_hash)
          VALUES (@userId, @report_num, @date, @company, @role, @archetype, @overall_score, @legitimacy, @blocks_json, @keywords_json, @source_hash)
          ON CONFLICT(report_num) DO UPDATE SET
            date=excluded.date, company=excluded.company, role=excluded.role, archetype=excluded.archetype,
            overall_score=excluded.overall_score, legitimacy=excluded.legitimacy,
            blocks_json=excluded.blocks_json, keywords_json=excluded.keywords_json,
            source_hash=excluded.source_hash
        `).run({ ...report, source_hash: report.source_hash || "", userId: userId || null });
      },
      async updateMetadata(reportNum, next, userId) {
        const report = await this.get(reportNum, userId);
        if (!report) return undefined;
        const db = getDb();
        const tx = db.transaction(() => {
          db.prepare(`
            UPDATE reports SET company = @company, role = @role, archetype = @archetype,
              legitimacy = @legitimacy, keywords_json = @keywords_json
            WHERE report_num = @report_num ${userId ? "AND user_id = @user_id" : ""}
          `).run({ ...next, report_num: reportNum, user_id: userId });
          db.prepare("UPDATE applications SET company = @company, role = @role, updated_at = datetime('now') WHERE company = @oldCompany AND role = @oldRole")
            .run({ company: next.company, role: next.role, oldCompany: report.company, oldRole: report.role });
          db.prepare("UPDATE jds SET company = @company, role = @role WHERE report_id = @report_num")
            .run({ company: next.company, role: next.role, report_num: reportNum });
        });
        tx();
        return this.get(reportNum, userId);
      },
      async delete(reportNum, userId) {
        const report = await this.get(reportNum, userId);
        if (!report) return false;
        const db = getDb();
        const tx = db.transaction(() => {
          db.prepare("UPDATE jds SET report_id = NULL WHERE report_id = ? OR report_id = ?").run(reportNum, report.id || reportNum);
          const result = userId
            ? db.prepare("DELETE FROM reports WHERE report_num = ? AND user_id = ?").run(reportNum, userId)
            : db.prepare("DELETE FROM reports WHERE report_num = ?").run(reportNum);
          return result.changes > 0;
        });
        return tx();
      },
    },
    jds: createSqliteJdRepository(),
    profiles: createSqliteProfileRepository(),
    signals: createSqliteSignalRepository(),
    referenceResumes: createSqliteReferenceResumeRepository(),
    sessions: createSqliteSessionRepository(),
    stories: createSqliteStoryRepository(),
    offers: createSqliteOfferRepository(),
    offerReports: createSqliteOfferReportRepository(),
    news: createSqliteNewsRepository(),
    preferences: {
      async record(preference, userId) {
        getDb().prepare(`
          INSERT INTO optimization_preferences (user_id, section_id, variant_type, action, original_text, optimized_text, operation)
          VALUES (@user_id, @section_id, @variant_type, @action, @original_text, @optimized_text, @operation)
        `).run({
          user_id: userId,
          section_id: preference.section_id,
          variant_type: preference.variant_type,
          action: preference.action,
          original_text: preference.original_text || null,
          optimized_text: preference.optimized_text || null,
          operation: preference.operation || "",
        });
      },
      async listRecent(userId, limit = 10) {
        return getDb().prepare(`
          SELECT * FROM optimization_preferences
          WHERE user_id = ? OR user_id IS NULL
          ORDER BY created_at DESC
          LIMIT ?
        `).all(userId, limit) as PreferenceRow[];
      },
    },
    agentPreferences: createSqliteAgentPreferenceRepository(),
  };
}

function createPostgresRepositories(): DataRepositories {
  const pg = {
    driver: "postgres" as const,
    async assertReady() {
      if (!isPostgresConfigured()) throw new Error("DB_DRIVER=postgres requires DATABASE_URL");
      await bootstrapPostgresSchema();
    },
    users: createPostgresUserRepository(),
    securityEvents: createPostgresSecurityEventRepository(),
    passwordRecoveryRequests: createPostgresPasswordRecoveryRepository(),
    cv: createPostgresCvRepository(),
    resumeEditProposals: createPostgresResumeEditProposalRepository(),
    applications: createPostgresApplicationRepository(),
    reports: createPostgresReportRepository(),
    jds: createPostgresJdRepository(),
    profiles: createPostgresProfileRepository(),
    signals: createPostgresSignalRepository(),
    referenceResumes: createPostgresReferenceResumeRepository(),
    sessions: createPostgresSessionRepository(),
    stories: createPostgresStoryRepository(),
    offers: createPostgresOfferRepository(),
    offerReports: createPostgresOfferReportRepository(),
    news: createPostgresNewsRepository(),
    preferences: {
      async record(preference: PreferenceRow, userId: string) {
        await withPostgresClient((client) => client.query(`
          INSERT INTO optimization_preferences (user_id, section_id, variant_type, action, original_text, optimized_text, operation)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
        `, [userId, preference.section_id, preference.variant_type, preference.action, preference.original_text || null, preference.optimized_text || null, preference.operation || ""]));
      },
      async listRecent(userId: string, limit = 10) {
        return withPostgresClient(async (client) => rows<PreferenceRow>((await client.query(`
          SELECT * FROM optimization_preferences
          WHERE user_id = $1
          ORDER BY created_at DESC
          LIMIT $2
        `, [userId, limit])).rows));
      },
    },
    agentPreferences: createPostgresAgentPreferenceRepository(),
  };
  return pg;
}

function createPostgresUserRepository(): DataRepositories["users"] {
  return {
    async findByUsername(username) {
      return withPostgresClient(async (client) => one<UserRecord>(await client.query("SELECT * FROM users WHERE username = $1", [username])));
    },
    async findByUsernameOrEmail(identifier) {
      return withPostgresClient(async (client) => {
        const username = one<UserRecord>(await client.query(`
          SELECT * FROM users WHERE lower(username) = lower($1) LIMIT 1
        `, [identifier]));
        if (username) return username;
        const emailMatches = await client.query(`
          SELECT * FROM users
          WHERE email <> '' AND lower(email) = lower($1)
          LIMIT 2
        `, [identifier]);
        return emailMatches.rows.length === 1
          ? emailMatches.rows[0] as UserRecord
          : undefined;
      });
    },
    async findById(id) {
      return withPostgresClient(async (client) => one<UserRecord>(await client.query("SELECT * FROM users WHERE id = $1", [id])));
    },
    async list(status) {
      return withPostgresClient(async (client) => {
        const result = status
          ? await client.query("SELECT * FROM users WHERE status = $1 ORDER BY created_at DESC", [status])
          : await client.query("SELECT * FROM users ORDER BY created_at DESC");
        return rows<UserRecord>(result.rows);
      });
    },
    async countActiveAdmins() {
      return withPostgresClient(async (client) => Number((await client.query("SELECT COUNT(*) AS cnt FROM users WHERE status = 'active' AND role IN ('admin', 'superadmin')")).rows[0].cnt));
    },
    async create(input) {
      await withPostgresClient((client) => client.query(`
        INSERT INTO users (id, username, password_hash, display_name, email, role, status, token_version)
        VALUES ($1, $2, $3, $4, $5, $6, $7, 0)
      `, [input.id, input.username, input.passwordHash, input.displayName, input.email, input.role, input.status]));
    },
    async updateLastLogin(id) {
      await withPostgresClient((client) => client.query("UPDATE users SET last_login_at = now() WHERE id = $1", [id]));
    },
    async activateFirstAdmin(id) {
      await withPostgresClient((client) => client.query("UPDATE users SET role = 'superadmin', status = 'active' WHERE id = $1", [id]));
    },
    async verifyTokenVersion(userId, tokenVersion) {
      const row = await withPostgresClient(async (client) => one<{ token_version: number }>(await client.query("SELECT token_version FROM users WHERE id = $1", [userId])));
      return Boolean(row && Number(row.token_version) === tokenVersion);
    },
    async updateStatus(id, status, approvedBy) {
      return withPostgresClient(async (client) => one<UserRecord>(await client.query(`
        UPDATE users SET status = $1, token_version = token_version + 1,
          approved_at = now(), approved_by = $2
        WHERE id = $3
        RETURNING *
      `, [status, approvedBy, id])));
    },
    async updateStatusWithAudit(input) {
      return withPostgresClient(async (client) => {
        await client.query("BEGIN");
        try {
          const target = one<UserRecord>(await client.query(
            "SELECT * FROM users WHERE id = $1 FOR UPDATE",
            [input.userId],
          ));
          if (!target) {
            await insertPostgresAuthSecurityEvent(client, {
              ...input.event, outcome: 'failure', reasonCode: 'TARGET_NOT_FOUND',
            });
            await client.query("COMMIT");
            return { ok: false, reason: 'TARGET_NOT_FOUND' } as const;
          }
          if (
            target.role === 'superadmin' &&
            target.status === 'active' &&
            input.status !== 'active'
          ) {
            const superadmins = await client.query(`
              SELECT id FROM users
              WHERE role = 'superadmin' AND status = 'active'
              FOR UPDATE
            `);
            if (superadmins.rowCount !== null && superadmins.rowCount <= 1) {
              await insertPostgresAuthSecurityEvent(client, {
                ...input.event, outcome: 'failure', reasonCode: 'LAST_ACTIVE_SUPERADMIN',
              });
              await client.query("UPDATE users SET last_security_event_at = now() WHERE id = $1", [input.userId]);
              await client.query("COMMIT");
              return { ok: false, reason: 'LAST_ACTIVE_SUPERADMIN' } as const;
            }
          }
          const updated = one<UserRecord>(await client.query(`
            UPDATE users
            SET status = $1, token_version = token_version + 1,
                approved_at = now(), approved_by = $2,
                last_security_event_at = now()
            WHERE id = $3
            RETURNING *
          `, [input.status, input.approvedBy, input.userId])) as UserRecord;
          await insertPostgresAuthSecurityEvent(client, input.event);
          await client.query("COMMIT");
          return { ok: true, user: updated } as const;
        } catch (error) {
          await client.query("ROLLBACK");
          throw error;
        }
      });
    },
    async updateRole(id, role) {
      return withPostgresClient(async (client) => one<UserRecord>(await client.query("UPDATE users SET role = $1, token_version = token_version + 1 WHERE id = $2 RETURNING *", [role, id])));
    },
    async updateRoleWithAudit(input) {
      return withPostgresClient(async (client) => {
        await client.query("BEGIN");
        try {
          const target = one<UserRecord>(await client.query(
            "SELECT * FROM users WHERE id = $1 FOR UPDATE",
            [input.userId],
          ));
          if (!target) {
            await insertPostgresAuthSecurityEvent(client, {
              ...input.event,
              outcome: 'failure',
              reasonCode: 'TARGET_NOT_FOUND',
            });
            await client.query("COMMIT");
            return { ok: false, reason: 'TARGET_NOT_FOUND' } as const;
          }

          if (
            target.role === 'superadmin' &&
            target.status === 'active' &&
            input.role !== 'superadmin'
          ) {
            const superadmins = await client.query(`
              SELECT id FROM users
              WHERE role = 'superadmin' AND status = 'active'
              FOR UPDATE
            `);
            if (superadmins.rowCount !== null && superadmins.rowCount <= 1) {
              await insertPostgresAuthSecurityEvent(client, {
                ...input.event,
                outcome: 'failure',
                reasonCode: 'LAST_ACTIVE_SUPERADMIN',
              });
              await client.query(
                "UPDATE users SET last_security_event_at = now() WHERE id = $1",
                [input.userId],
              );
              await client.query("COMMIT");
              return { ok: false, reason: 'LAST_ACTIVE_SUPERADMIN' } as const;
            }
          }

          const updated = one<UserRecord>(await client.query(`
            UPDATE users
            SET role = $1, token_version = token_version + 1,
                last_security_event_at = now()
            WHERE id = $2
            RETURNING *
          `, [input.role, input.userId])) as UserRecord;
          await insertPostgresAuthSecurityEvent(client, input.event);
          await client.query("COMMIT");
          return { ok: true, user: updated } as const;
        } catch (error) {
          await client.query("ROLLBACK");
          throw error;
        }
      });
    },
    async resetPassword(id, passwordHash) {
      return withPostgresClient(async (client) => Boolean((await client.query("UPDATE users SET password_hash = $1, token_version = token_version + 1 WHERE id = $2", [passwordHash, id])).rowCount));
    },
    async resetPasswordWithAudit(input) {
      return withPostgresClient(async (client) => {
        await client.query("BEGIN");
        try {
          const result = await client.query(`
            UPDATE users
            SET password_hash = $1,
                token_version = token_version + 1,
                password_changed_at = now(),
                password_changed_by = $2,
                must_change_password = TRUE,
                last_security_event_at = now()
            WHERE id = $3
          `, [input.passwordHash, input.changedBy, input.userId]);
          if (!result.rowCount) {
            await client.query("ROLLBACK");
            return false;
          }
          await insertPostgresAuthSecurityEvent(client, input.event);
          await client.query("COMMIT");
          return true;
        } catch (error) {
          await client.query("ROLLBACK");
          throw error;
        }
      });
    },
    async changeOwnPassword(input) {
      return withPostgresClient(async (client) => {
        await client.query("BEGIN");
        try {
          const result = await client.query(`
            UPDATE users
            SET password_hash = $1,
                token_version = token_version + 1,
                password_changed_at = now(),
                password_changed_by = $2,
                must_change_password = FALSE,
                last_security_event_at = now()
            WHERE id = $3
          `, [input.passwordHash, input.changedBy, input.userId]);
          if (!result.rowCount) {
            await client.query("ROLLBACK");
            return false;
          }
          await insertPostgresAuthSecurityEvent(client, input.event);
          await client.query("COMMIT");
          return true;
        } catch (error) {
          await client.query("ROLLBACK");
          throw error;
        }
      });
    },
    async deleteWithAudit(input) {
      return withPostgresClient(async (client) => {
        await client.query("BEGIN");
        try {
          const target = one<UserRecord>(await client.query(
            "SELECT * FROM users WHERE id = $1 FOR UPDATE",
            [input.userId],
          ));
          if (!target) {
            await insertPostgresAuthSecurityEvent(client, {
              ...input.event, outcome: 'failure', reasonCode: 'TARGET_NOT_FOUND',
            });
            await client.query("COMMIT");
            return { ok: false, reason: 'TARGET_NOT_FOUND' } as const;
          }
          if (target.role === 'superadmin' && target.status === 'active') {
            const superadmins = await client.query(`
              SELECT id FROM users
              WHERE role = 'superadmin' AND status = 'active'
              FOR UPDATE
            `);
            if (superadmins.rowCount !== null && superadmins.rowCount <= 1) {
              await insertPostgresAuthSecurityEvent(client, {
                ...input.event, outcome: 'failure', reasonCode: 'LAST_ACTIVE_SUPERADMIN',
              });
              await client.query("UPDATE users SET last_security_event_at = now() WHERE id = $1", [input.userId]);
              await client.query("COMMIT");
              return { ok: false, reason: 'LAST_ACTIVE_SUPERADMIN' } as const;
            }
          }
          for (const table of USER_PRIVATE_TABLES) {
            await client.query(`DELETE FROM ${pgIdent(table)} WHERE user_id = $1`, [input.userId]);
          }
          await insertPostgresAuthSecurityEvent(client, input.event);
          await client.query("DELETE FROM users WHERE id = $1", [input.userId]);
          await client.query("COMMIT");
          return { ok: true, username: target.username } as const;
        } catch (error) {
          await client.query("ROLLBACK");
          throw error;
        }
      });
    },
    async deleteCascade(id) {
      return withPostgresClient(async (client) => {
        await client.query("BEGIN");
        try {
          for (const table of USER_PRIVATE_TABLES) await client.query(`DELETE FROM ${pgIdent(table)} WHERE user_id = $1`, [id]);
          const result = await client.query("DELETE FROM users WHERE id = $1", [id]);
          await client.query("COMMIT");
          return Boolean(result.rowCount);
        } catch (error) {
          await client.query("ROLLBACK");
          throw error;
        }
      });
    },
  };
}

function createPostgresSecurityEventRepository(): DataRepositories["securityEvents"] {
  return {
    async append(event) {
      await withPostgresClient(async (client) => {
        await client.query("BEGIN");
        try {
          await insertPostgresAuthSecurityEvent(client, event);
          const userId = event.targetUserId || event.actorUserId;
          if (userId) {
            await client.query(
              "UPDATE users SET last_security_event_at = now() WHERE id = $1",
              [userId],
            );
          }
          await client.query("COMMIT");
        } catch (error) {
          await client.query("ROLLBACK");
          throw error;
        }
      });
    },
    async list(filters) {
      return withPostgresClient(async (client) => {
        const where: string[] = [];
        const params: unknown[] = [];
        const add = (column: string, value?: string) => {
          if (!value) return;
          params.push(value);
          where.push(`${column} = $${params.length}`);
        };
        add('event_type', filters.eventType);
        add('outcome', filters.outcome);
        add('actor_user_id', filters.actorUserId);
        add('target_user_id', filters.targetUserId);
        const clause = where.length ? ` WHERE ${where.join(' AND ')}` : '';
        const countResult = await client.query(
          `SELECT COUNT(*)::int AS count FROM auth_security_events${clause}`,
          params,
        );
        params.push(filters.limit, filters.offset);
        const rows = await client.query(`
          SELECT * FROM auth_security_events${clause}
          ORDER BY created_at DESC, id DESC
          LIMIT $${params.length - 1} OFFSET $${params.length}
        `, params);
        return {
          events: rows.rows.map(mapAuthSecurityEventRow),
          total: Number(countResult.rows[0]?.count || 0),
        };
      });
    },
  };
}

function createSqlitePasswordRecoveryRepository(): DataRepositories['passwordRecoveryRequests'] {
  return {
    async submitForUser(input) {
      const db = getDb();
      const submit = db.transaction(() => {
        const existing = db.prepare(`
          SELECT * FROM password_recovery_requests
          WHERE user_id = ? AND status = 'pending'
        `).get(input.userId) as AnyRow | undefined;
        if (existing) {
          db.prepare(`
            UPDATE password_recovery_requests
            SET source_ip = ?, user_agent = ?, requested_at = datetime('now')
            WHERE id = ?
          `).run(input.sourceIp || null, input.userAgent || null, existing.id);
        } else {
          db.prepare(`
            INSERT INTO password_recovery_requests (
              id, user_id, status, source_ip, user_agent
            ) VALUES (?, ?, 'pending', ?, ?)
          `).run(input.id, input.userId, input.sourceIp || null, input.userAgent || null);
        }
        insertSqliteAuthSecurityEvent(db, input.event);
        db.prepare(
          "UPDATE users SET last_security_event_at = datetime('now') WHERE id = ?",
        ).run(input.userId);
        const row = db.prepare(`
          SELECT * FROM password_recovery_requests
          WHERE user_id = ? AND status = 'pending'
        `).get(input.userId) as AnyRow;
        return mapPasswordRecoveryRequestRow(row);
      });
      return submit();
    },
    async listPending() {
      const rows = getDb().prepare(`
        SELECT * FROM password_recovery_requests
        WHERE status = 'pending'
        ORDER BY requested_at DESC
      `).all() as AnyRow[];
      return rows.map(mapPasswordRecoveryRequestRow);
    },
    async completeWithPasswordReset(input) {
      const db = getDb();
      const complete = db.transaction(() => {
        const request = db.prepare(`
          SELECT id FROM password_recovery_requests
          WHERE id = ? AND user_id = ? AND status = 'pending'
        `).get(input.requestId, input.userId);
        if (!request) return false;
        const user = db.prepare(`
          UPDATE users
          SET password_hash = ?, token_version = token_version + 1,
              password_changed_at = datetime('now'), password_changed_by = ?,
              must_change_password = 1, last_security_event_at = datetime('now')
          WHERE id = ?
        `).run(input.passwordHash, input.changedBy, input.userId);
        if (user.changes === 0) return false;
        db.prepare(`
          UPDATE password_recovery_requests
          SET status = 'completed', resolved_at = datetime('now'),
              resolved_by = ?, resolution = 'temporary_password_issued'
          WHERE id = ?
        `).run(input.changedBy, input.requestId);
        insertSqliteAuthSecurityEvent(db, input.event);
        return true;
      });
      return complete();
    },
  };
}

function createPostgresPasswordRecoveryRepository(): DataRepositories['passwordRecoveryRequests'] {
  return {
    async submitForUser(input) {
      return withPostgresClient(async (client) => {
        await client.query('BEGIN');
        try {
          const result = await client.query(`
            INSERT INTO password_recovery_requests (
              id, user_id, status, source_ip, user_agent
            ) VALUES ($1, $2, 'pending', $3, $4)
            ON CONFLICT (user_id) WHERE status = 'pending'
            DO UPDATE SET source_ip = EXCLUDED.source_ip,
                          user_agent = EXCLUDED.user_agent,
                          requested_at = now()
            RETURNING *
          `, [input.id, input.userId, input.sourceIp || null, input.userAgent || null]);
          await insertPostgresAuthSecurityEvent(client, input.event);
          await client.query(
            'UPDATE users SET last_security_event_at = now() WHERE id = $1',
            [input.userId],
          );
          await client.query('COMMIT');
          return mapPasswordRecoveryRequestRow(result.rows[0]);
        } catch (error) {
          await client.query('ROLLBACK');
          throw error;
        }
      });
    },
    async listPending() {
      return withPostgresClient(async (client) => {
        const result = await client.query(`
          SELECT * FROM password_recovery_requests
          WHERE status = 'pending'
          ORDER BY requested_at DESC
        `);
        return result.rows.map(mapPasswordRecoveryRequestRow);
      });
    },
    async completeWithPasswordReset(input) {
      return withPostgresClient(async (client) => {
        await client.query('BEGIN');
        try {
          const recovery = await client.query(`
            SELECT id FROM password_recovery_requests
            WHERE id = $1 AND user_id = $2 AND status = 'pending'
            FOR UPDATE
          `, [input.requestId, input.userId]);
          if (!recovery.rowCount) {
            await client.query('ROLLBACK');
            return false;
          }
          const user = await client.query(`
            UPDATE users
            SET password_hash = $1, token_version = token_version + 1,
                password_changed_at = now(), password_changed_by = $2,
                must_change_password = TRUE, last_security_event_at = now()
            WHERE id = $3
          `, [input.passwordHash, input.changedBy, input.userId]);
          if (!user.rowCount) {
            await client.query('ROLLBACK');
            return false;
          }
          await client.query(`
            UPDATE password_recovery_requests
            SET status = 'completed', resolved_at = now(), resolved_by = $1,
                resolution = 'temporary_password_issued'
            WHERE id = $2
          `, [input.changedBy, input.requestId]);
          await insertPostgresAuthSecurityEvent(client, input.event);
          await client.query('COMMIT');
          return true;
        } catch (error) {
          await client.query('ROLLBACK');
          throw error;
        }
      });
    },
  };
}

function createPostgresCvRepository(): DataRepositories["cv"] {
  return {
    async get(userId) {
      return withPostgresClient(async (client) => one<{ data_json: string }>(await client.query("SELECT data_json FROM cv_data WHERE user_id = $1", [userId])));
    },
    async upsert(userId, data) {
      await withPostgresClient((client) => client.query(`
        INSERT INTO cv_data (user_id, data_json, updated_at)
        VALUES ($1, $2::jsonb, now())
        ON CONFLICT (user_id) DO UPDATE SET data_json = EXCLUDED.data_json, updated_at = now()
      `, [userId, JSON.stringify(data || {})]));
    },
  };
}

export interface ApplicationListFilters {
  id?: number;
  reportNum?: number;
  jdId?: number;
  status?: string;
  company?: string;
  role?: string;
  score_min?: number;
  date_from?: string;
  limit?: number;
  offset?: number;
}

export interface ApplicationEventInput {
  application_id: number;
  event_type: string;
  from_status?: string | null;
  to_status?: string | null;
  note?: string;
  source?: string;
  metadata_json?: string;
}

function createSqliteResumeEditProposalRepository(): DataRepositories["resumeEditProposals"] {
  return {
    async create(input, userId) {
      const row = buildResumeEditProposalRecord(input);
      getDb().prepare(`
        INSERT INTO resume_edit_proposals (
          id, user_id, section_id, base_version, base_hash, original_content,
          proposed_content, proposed_hash, reason, risk_flags_json, status, updated_at
        ) VALUES (
          @id, @user_id, @section_id, @base_version, @base_hash, @original_content,
          @proposed_content, @proposed_hash, @reason, @risk_flags_json, @status, datetime('now')
        )
      `).run({ ...row, user_id: userId });
      return (await this.get(row.id, userId)) || { ...row, user_id: userId };
    },
    async get(id, userId) {
      return getDb().prepare("SELECT * FROM resume_edit_proposals WHERE id = ? AND user_id = ?").get(id, userId) as ResumeEditProposalRecord | undefined;
    },
    async listPending(userId) {
      return getDb().prepare(`
        SELECT * FROM resume_edit_proposals
        WHERE user_id = ? AND status = 'pending'
        ORDER BY updated_at DESC
      `).all(userId) as ResumeEditProposalRecord[];
    },
    async listByStatus(userId, status, limit = 20) {
      const safeLimit = Math.max(1, Math.min(50, Math.floor(limit)));
      return getDb().prepare(`
        SELECT * FROM resume_edit_proposals
        WHERE user_id = ? AND status = ?
        ORDER BY updated_at DESC
        LIMIT ?
      `).all(userId, status, safeLimit) as ResumeEditProposalRecord[];
    },
    async apply(id, userId) {
      const db = getDb();
      const tx = db.transaction(() => {
        const proposal = db.prepare("SELECT * FROM resume_edit_proposals WHERE id = ? AND user_id = ?").get(id, userId) as ResumeEditProposalRecord | undefined;
        if (!proposal) throw new ResumeEditProposalApplyError("proposal_not_found", "Resume edit proposal was not found.");

        const cvRow = db.prepare("SELECT data_json FROM cv_data WHERE user_id = ?").get(userId) as { data_json?: string } | undefined;
        const applied = applyResumeEditProposalToCvData(proposal, parseCvDataJson(cvRow?.data_json));

        const result = db.prepare("UPDATE cv_data SET data_json = ?, updated_at = datetime('now') WHERE user_id = ?").run(JSON.stringify(applied.cvData), userId);
        if (result.changes === 0) throw new ResumeEditProposalApplyError("cv_missing", "CV data row was not found.");

        db.prepare("UPDATE resume_edit_proposals SET status = 'applied', updated_at = datetime('now') WHERE id = ? AND user_id = ?").run(id, userId);
        const updatedProposal = db.prepare("SELECT * FROM resume_edit_proposals WHERE id = ? AND user_id = ?").get(id, userId) as ResumeEditProposalRecord | undefined;
        return { ...applied, proposal: updatedProposal || { ...proposal, status: "applied" as const } };
      });
      return tx();
    },
    async discard(id, userId) {
      const db = getDb();
      const tx = db.transaction(() => {
        const proposal = db.prepare("SELECT * FROM resume_edit_proposals WHERE id = ? AND user_id = ?").get(id, userId) as ResumeEditProposalRecord | undefined;
        if (!proposal) throw new ResumeEditProposalApplyError("proposal_not_found", "Resume edit proposal was not found.");
        if (proposal.status !== "pending") throw new ResumeEditProposalApplyError("proposal_not_pending", "Only pending resume edit proposals can be discarded.");
        db.prepare("UPDATE resume_edit_proposals SET status = 'discarded', updated_at = datetime('now') WHERE id = ? AND user_id = ?").run(id, userId);
        const updated = db.prepare("SELECT * FROM resume_edit_proposals WHERE id = ? AND user_id = ?").get(id, userId) as ResumeEditProposalRecord | undefined;
        return updated || { ...proposal, status: "discarded" as const };
      });
      return tx();
    },
    async rollback(id, userId) {
      const db = getDb();
      const tx = db.transaction(() => {
        const proposal = db.prepare("SELECT * FROM resume_edit_proposals WHERE id = ? AND user_id = ?").get(id, userId) as ResumeEditProposalRecord | undefined;
        if (!proposal) throw new ResumeEditProposalApplyError("proposal_not_found", "Resume edit proposal was not found.");

        const cvRow = db.prepare("SELECT data_json FROM cv_data WHERE user_id = ?").get(userId) as { data_json?: string } | undefined;
        const rollback = rollbackResumeEditProposalInCvData(proposal, parseCvDataJson(cvRow?.data_json));

        const result = db.prepare("UPDATE cv_data SET data_json = ?, updated_at = datetime('now') WHERE user_id = ?").run(JSON.stringify(rollback.cvData), userId);
        if (result.changes === 0) throw new ResumeEditProposalApplyError("cv_missing", "CV data row was not found.");

        db.prepare("UPDATE resume_edit_proposals SET status = 'rolled_back', updated_at = datetime('now') WHERE id = ? AND user_id = ?").run(id, userId);
        const updated = db.prepare("SELECT * FROM resume_edit_proposals WHERE id = ? AND user_id = ?").get(id, userId) as ResumeEditProposalRecord | undefined;
        return { ...rollback, proposal: updated || { ...proposal, status: "rolled_back" as const } };
      });
      return tx();
    },
  };
}

function createPostgresResumeEditProposalRepository(): DataRepositories["resumeEditProposals"] {
  return {
    async create(input, userId) {
      const row = buildResumeEditProposalRecord(input);
      const result = await withPostgresClient((client) => client.query(`
        INSERT INTO resume_edit_proposals (
          id, user_id, section_id, base_version, base_hash, original_content,
          proposed_content, proposed_hash, reason, risk_flags_json, status, updated_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,now())
        RETURNING *
      `, [
        row.id,
        userId,
        row.section_id,
        row.base_version,
        row.base_hash,
        row.original_content,
        row.proposed_content,
        row.proposed_hash,
        row.reason,
        row.risk_flags_json,
        row.status,
      ]));
      return normalizeRow(result.rows[0]) as unknown as ResumeEditProposalRecord;
    },
    async get(id, userId) {
      return withPostgresClient(async (client) => one<ResumeEditProposalRecord>(await client.query(
        "SELECT * FROM resume_edit_proposals WHERE id = $1 AND user_id = $2",
        [id, userId],
      )));
    },
    async listPending(userId) {
      return withPostgresClient(async (client) => rows<ResumeEditProposalRecord>((await client.query(`
        SELECT * FROM resume_edit_proposals
        WHERE user_id = $1 AND status = 'pending'
        ORDER BY updated_at DESC
      `, [userId])).rows));
    },
    async listByStatus(userId, status, limit = 20) {
      const safeLimit = Math.max(1, Math.min(50, Math.floor(limit)));
      return withPostgresClient(async (client) => rows<ResumeEditProposalRecord>((await client.query(`
        SELECT * FROM resume_edit_proposals
        WHERE user_id = $1 AND status = $2
        ORDER BY updated_at DESC
        LIMIT $3
      `, [userId, status, safeLimit])).rows));
    },
    async apply(id, userId) {
      return withPostgresClient(async (client) => {
        await client.query("BEGIN");
        try {
          const proposal = one<ResumeEditProposalRecord>(await client.query(
            "SELECT * FROM resume_edit_proposals WHERE id = $1 AND user_id = $2 FOR UPDATE",
            [id, userId],
          ));
          if (!proposal) throw new ResumeEditProposalApplyError("proposal_not_found", "Resume edit proposal was not found.");

          const cvRow = one<{ data_json: string }>(await client.query(
            "SELECT data_json FROM cv_data WHERE user_id = $1 FOR UPDATE",
            [userId],
          ));
          const applied = applyResumeEditProposalToCvData(proposal, parseCvDataJson(cvRow?.data_json));

          const writeResult = await client.query(
            "UPDATE cv_data SET data_json = $1::jsonb, updated_at = now() WHERE user_id = $2",
            [JSON.stringify(applied.cvData), userId],
          );
          if (!writeResult.rowCount) throw new ResumeEditProposalApplyError("cv_missing", "CV data row was not found.");

          const updateResult = await client.query(
            "UPDATE resume_edit_proposals SET status = 'applied', updated_at = now() WHERE id = $1 AND user_id = $2 RETURNING *",
            [id, userId],
          );
          await client.query("COMMIT");
          return { ...applied, proposal: normalizeRow(updateResult.rows[0]) as unknown as ResumeEditProposalRecord };
        } catch (error) {
          await client.query("ROLLBACK");
          throw error;
        }
      });
    },
    async discard(id, userId) {
      return withPostgresClient(async (client) => {
        await client.query("BEGIN");
        try {
          const proposal = one<ResumeEditProposalRecord>(await client.query(
            "SELECT * FROM resume_edit_proposals WHERE id = $1 AND user_id = $2 FOR UPDATE",
            [id, userId],
          ));
          if (!proposal) throw new ResumeEditProposalApplyError("proposal_not_found", "Resume edit proposal was not found.");
          if (proposal.status !== "pending") throw new ResumeEditProposalApplyError("proposal_not_pending", "Only pending resume edit proposals can be discarded.");
          const result = await client.query(
            "UPDATE resume_edit_proposals SET status = 'discarded', updated_at = now() WHERE id = $1 AND user_id = $2 RETURNING *",
            [id, userId],
          );
          await client.query("COMMIT");
          return normalizeRow(result.rows[0]) as unknown as ResumeEditProposalRecord;
        } catch (error) {
          await client.query("ROLLBACK");
          throw error;
        }
      });
    },
    async rollback(id, userId) {
      return withPostgresClient(async (client) => {
        await client.query("BEGIN");
        try {
          const proposal = one<ResumeEditProposalRecord>(await client.query(
            "SELECT * FROM resume_edit_proposals WHERE id = $1 AND user_id = $2 FOR UPDATE",
            [id, userId],
          ));
          if (!proposal) throw new ResumeEditProposalApplyError("proposal_not_found", "Resume edit proposal was not found.");

          const cvRow = one<{ data_json: string }>(await client.query(
            "SELECT data_json FROM cv_data WHERE user_id = $1 FOR UPDATE",
            [userId],
          ));
          const rollback = rollbackResumeEditProposalInCvData(proposal, parseCvDataJson(cvRow?.data_json));

          const writeResult = await client.query(
            "UPDATE cv_data SET data_json = $1::jsonb, updated_at = now() WHERE user_id = $2",
            [JSON.stringify(rollback.cvData), userId],
          );
          if (!writeResult.rowCount) throw new ResumeEditProposalApplyError("cv_missing", "CV data row was not found.");

          const updateResult = await client.query(
            "UPDATE resume_edit_proposals SET status = 'rolled_back', updated_at = now() WHERE id = $1 AND user_id = $2 RETURNING *",
            [id, userId],
          );
          await client.query("COMMIT");
          return { ...rollback, proposal: normalizeRow(updateResult.rows[0]) as unknown as ResumeEditProposalRecord };
        } catch (error) {
          await client.query("ROLLBACK");
          throw error;
        }
      });
    },
  };
}

function createPostgresApplicationRepository(): DataRepositories["applications"] {
  return {
    async list(filters, userId) {
      return withPostgresClient(async (client) => {
        const clauses = ["user_id = $1"];
        const params: unknown[] = [userId];
        if (filters.id) { params.push(filters.id); clauses.push(`id = $${params.length}`); }
        if (filters.reportNum) {
          params.push(filters.reportNum);
          clauses.push(`(num = $${params.length} OR report_path ILIKE $${params.length + 1})`);
          params.push(`%${String(filters.reportNum).padStart(3, "0")}%`);
        }
        if (filters.jdId) { params.push(filters.jdId); clauses.push(`jd_id = $${params.length}`); }
        if (filters.status) { params.push(normalizeApplicationStatus(filters.status)); clauses.push(`lower(status) = $${params.length}`); }
        if (filters.company) { params.push(`%${filters.company}%`); clauses.push(`company ILIKE $${params.length}`); }
        if (filters.role) { params.push(`%${filters.role}%`); clauses.push(`role ILIKE $${params.length}`); }
        if (typeof filters.score_min === "number" && Number.isFinite(filters.score_min)) { params.push(filters.score_min); clauses.push(`score >= $${params.length}`); }
        if (filters.date_from) { params.push(filters.date_from); clauses.push(`date >= $${params.length}`); }
        let sql = `SELECT * FROM applications WHERE ${clauses.join(" AND ")} ORDER BY num DESC`;
        if (filters.limit) { params.push(filters.limit); sql += ` LIMIT $${params.length}`; }
        if (filters.offset) { params.push(filters.offset); sql += ` OFFSET $${params.length}`; }
        return rows<AppRow>((await client.query(sql, params)).rows).map(normalizeApplicationRecord);
      });
    },
    async get(id, userId) {
      return withPostgresClient(async (client) => {
        const row = one<AppRow>(await client.query("SELECT * FROM applications WHERE id=$1 AND user_id=$2", [id, userId]));
        return row ? normalizeApplicationRecord(row) : undefined;
      });
    },
    async upsert(app, userId) {
      return withPostgresClient(async (client) => {
        const payload = normalizeApplicationPayload(app);
        const result = await client.query(`
        INSERT INTO applications (user_id, num, date, company, role, score, status, pdf_generated, report_path, notes, jd_id, source_url, metadata_json, updated_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,now())
        ON CONFLICT (user_id, company, role) DO UPDATE SET
          num=EXCLUDED.num, date=EXCLUDED.date, score=EXCLUDED.score, status=EXCLUDED.status,
          pdf_generated=EXCLUDED.pdf_generated, report_path=EXCLUDED.report_path, notes=EXCLUDED.notes,
          jd_id=COALESCE(EXCLUDED.jd_id, applications.jd_id),
          source_url=COALESCE(NULLIF(EXCLUDED.source_url, ''), applications.source_url),
          metadata_json=EXCLUDED.metadata_json, updated_at=now()
        RETURNING *
      `, [userId, payload.num, payload.date, payload.company, payload.role, payload.score, payload.status, payload.pdf_generated, payload.report_path, payload.notes, payload.jd_id, payload.source_url, payload.metadata_json]);
        const saved = one<AppRow>(result);
        if (!saved) throw new Error("Application upsert read-back failed");
        return normalizeApplicationRecord(saved);
      });
    },
    async updateStatus(id, status, userId, note) {
      return withPostgresClient(async (client) => {
        const result = await client.query(`
          UPDATE applications
          SET status=$1, notes=COALESCE(NULLIF($2, ''), notes), updated_at=now()
          WHERE id=$3 AND user_id=$4
          RETURNING *
        `, [normalizeApplicationStatus(status), note || "", id, userId]);
        const row = one<AppRow>(result);
        return row ? normalizeApplicationRecord(row) : undefined;
      });
    },
    async insertEvent(event, userId) {
      return withPostgresClient(async (client) => {
        const payload = normalizeApplicationEventPayload(event);
        const result = await client.query(`
          INSERT INTO application_events (user_id, application_id, event_type, from_status, to_status, note, source, metadata_json)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)
          RETURNING *
        `, [userId, payload.application_id, payload.event_type, payload.from_status, payload.to_status, payload.note, payload.source, payload.metadata_json]);
        const row = one<ApplicationEventRow>(result);
        if (!row) throw new Error("Application event read-back failed");
        return normalizeApplicationEventRecord(row);
      });
    },
    async listEvents(applicationId, userId) {
      return withPostgresClient(async (client) => {
        const result = await client.query(
          "SELECT * FROM application_events WHERE application_id=$1 AND user_id=$2 ORDER BY created_at DESC, id DESC",
          [applicationId, userId],
        );
        return rows<ApplicationEventRow>(result.rows).map(normalizeApplicationEventRecord);
      });
    },
  };
}

function createPostgresReportRepository(): DataRepositories["reports"] {
  return {
    async list(userId) {
      return withPostgresClient(async (client) => {
        const result = userId
          ? await client.query("SELECT * FROM reports WHERE user_id = $1 ORDER BY report_num DESC", [userId])
          : await client.query("SELECT * FROM reports ORDER BY report_num DESC");
        return rows<ReportRow>(result.rows);
      });
    },
    async get(reportNum, userId) {
      return withPostgresClient(async (client) => {
        const result = userId
          ? await client.query("SELECT * FROM reports WHERE report_num = $1 AND user_id = $2", [reportNum, userId])
          : await client.query("SELECT * FROM reports WHERE report_num = $1", [reportNum]);
        return one<ReportRow>(result);
      });
    },
    async upsert(report, userId) {
      await withPostgresClient((client) => client.query(`
        INSERT INTO reports (user_id, report_num, date, company, role, archetype, overall_score, legitimacy, blocks_json, keywords_json, source_hash)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11)
        ON CONFLICT (user_id, report_num) DO UPDATE SET
          date=EXCLUDED.date, company=EXCLUDED.company, role=EXCLUDED.role, archetype=EXCLUDED.archetype,
          overall_score=EXCLUDED.overall_score, legitimacy=EXCLUDED.legitimacy,
          blocks_json=EXCLUDED.blocks_json, keywords_json=EXCLUDED.keywords_json,
          source_hash=EXCLUDED.source_hash
      `, [userId || null, report.report_num, report.date, report.company, report.role, report.archetype, report.overall_score, report.legitimacy, report.blocks_json, report.keywords_json, report.source_hash || ""]));
    },
    async updateMetadata(reportNum, next, userId) {
      return withPostgresClient(async (client) => {
        await client.query("BEGIN");
        try {
          const report = one<ReportRow>(userId
            ? await client.query("SELECT * FROM reports WHERE report_num = $1 AND user_id = $2", [reportNum, userId])
            : await client.query("SELECT * FROM reports WHERE report_num = $1", [reportNum]));
          if (!report) { await client.query("ROLLBACK"); return undefined; }
          await client.query(`
            UPDATE reports SET company=$1, role=$2, archetype=$3, legitimacy=$4, keywords_json=$5::jsonb
            WHERE report_num=$6 ${userId ? "AND user_id=$7" : ""}
          `, userId
            ? [next.company, next.role, next.archetype, next.legitimacy, next.keywords_json, reportNum, userId]
            : [next.company, next.role, next.archetype, next.legitimacy, next.keywords_json, reportNum]);
          await client.query(`UPDATE applications SET company=$1, role=$2, updated_at=now() WHERE company=$3 AND role=$4 ${userId ? "AND user_id=$5" : ""}`, userId
            ? [next.company, next.role, report.company, report.role, userId]
            : [next.company, next.role, report.company, report.role]);
          await client.query(`UPDATE jds SET company=$1, role=$2 WHERE report_id=$3 ${userId ? "AND user_id=$4" : ""}`, userId
            ? [next.company, next.role, reportNum, userId]
            : [next.company, next.role, reportNum]);
          const updated = one<ReportRow>(userId
            ? await client.query("SELECT * FROM reports WHERE report_num=$1 AND user_id=$2", [reportNum, userId])
            : await client.query("SELECT * FROM reports WHERE report_num=$1", [reportNum]));
          await client.query("COMMIT");
          return updated;
        } catch (error) {
          await client.query("ROLLBACK");
          throw error;
        }
      });
    },
    async delete(reportNum, userId) {
      return withPostgresClient(async (client) => {
        await client.query("BEGIN");
        try {
          const report = one<ReportRow>(userId
            ? await client.query("SELECT * FROM reports WHERE report_num=$1 AND user_id=$2", [reportNum, userId])
            : await client.query("SELECT * FROM reports WHERE report_num=$1", [reportNum]));
          if (!report) { await client.query("ROLLBACK"); return false; }
          await client.query(`UPDATE jds SET report_id = NULL WHERE (report_id = $1 OR report_id = $2) ${userId ? "AND user_id = $3" : ""}`, userId
            ? [reportNum, report.id || reportNum, userId]
            : [reportNum, report.id || reportNum]);
          const result = userId
            ? await client.query("DELETE FROM reports WHERE report_num=$1 AND user_id=$2", [reportNum, userId])
            : await client.query("DELETE FROM reports WHERE report_num=$1", [reportNum]);
          await client.query("COMMIT");
          return Boolean(result.rowCount);
        } catch (error) {
          await client.query("ROLLBACK");
          throw error;
        }
      });
    },
  };
}

function createSqliteJdRepository(): DataRepositories["jds"] {
  return {
    async list(userId) {
      const sql = userId ? "SELECT * FROM jds WHERE user_id = ? OR user_id IS NULL ORDER BY id DESC" : "SELECT * FROM jds ORDER BY id DESC";
      return (userId ? getDb().prepare(sql).all(userId) : getDb().prepare(sql).all()) as JDRow[];
    },
    async get(id, userId) {
      const sql = userId ? "SELECT * FROM jds WHERE id = ? AND (user_id = ? OR user_id IS NULL)" : "SELECT * FROM jds WHERE id = ?";
      return (userId ? getDb().prepare(sql).get(id, userId) : getDb().prepare(sql).get(id)) as JDRow | undefined;
    },
    async insert(jd, userId) {
      const result = getDb().prepare(`
        INSERT INTO jds (user_id, company, role, source_type, source_url, body, keywords_json, report_id)
        VALUES (?, @company, @role, @source_type, @source_url, @body, @keywords_json, @report_id)
      `).run(userId || null, { ...jd, source_url: jd.source_url || "", report_id: jd.report_id ?? null });
      return Number(result.lastInsertRowid);
    },
    async findReusable(input, userId) {
      if (input.source_url) {
        const sql = userId
          ? "SELECT * FROM jds WHERE source_url = ? AND (user_id = ? OR user_id IS NULL) ORDER BY id DESC LIMIT 1"
          : "SELECT * FROM jds WHERE source_url = ? ORDER BY id DESC LIMIT 1";
        const byUrl = (userId ? getDb().prepare(sql).get(input.source_url, userId) : getDb().prepare(sql).get(input.source_url)) as JDRow | undefined;
        if (byUrl) return byUrl;
      }
      const normalized = normalizeBodyForMatch(input.body || "");
      if (!normalized) return undefined;
      const rows = await this.list(userId);
      return rows.find((row) => normalizeBodyForMatch(row.body) === normalized);
    },
    async update(id, updates, userId) {
      const keys = ["company", "role", "body", "source_type", "source_url", "keywords_json", "report_id"].filter((key) => updates[key as keyof JDRow] !== undefined);
      if (!keys.length) return this.get(id, userId);
      const sets = keys.map((key) => `${key} = @${key}`);
      const params: Record<string, unknown> = { id, user_id: userId };
      for (const key of keys) params[key] = updates[key as keyof JDRow];
      const sql = `UPDATE jds SET ${sets.join(", ")} WHERE id = @id ${userId ? "AND (user_id = @user_id OR user_id IS NULL)" : ""}`;
      getDb().prepare(sql).run(params);
      return this.get(id, userId);
    },
    async delete(id, userId) {
      const db = getDb();
      db.prepare("UPDATE scan_jobs SET jd_id = NULL, status = CASE WHEN status IN ('saved','evaluating') THEN 'viewed' ELSE status END WHERE jd_id = ?").run(id);
      const result = userId
        ? db.prepare("DELETE FROM jds WHERE id = ? AND (user_id = ? OR user_id IS NULL)").run(id, userId)
        : db.prepare("DELETE FROM jds WHERE id = ?").run(id);
      return result.changes;
    },
  };
}

function createPostgresJdRepository(): DataRepositories["jds"] {
  return {
    async list(userId) {
      return withPostgresClient(async (client) => rows<JDRow>((userId
        ? await client.query("SELECT * FROM jds WHERE user_id = $1 OR user_id IS NULL ORDER BY id DESC", [userId])
        : await client.query("SELECT * FROM jds ORDER BY id DESC")).rows));
    },
    async get(id, userId) {
      return withPostgresClient(async (client) => one<JDRow>(userId
        ? await client.query("SELECT * FROM jds WHERE id=$1 AND (user_id=$2 OR user_id IS NULL)", [id, userId])
        : await client.query("SELECT * FROM jds WHERE id=$1", [id])));
    },
    async insert(jd, userId) {
      return withPostgresClient(async (client) => Number((await client.query(`
        INSERT INTO jds (user_id, company, role, source_type, source_url, body, keywords_json, report_id)
        VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8)
        RETURNING id
      `, [userId || null, jd.company, jd.role, jd.source_type, jd.source_url || "", jd.body, jd.keywords_json || "[]", jd.report_id ?? null])).rows[0].id));
    },
    async findReusable(input, userId) {
      if (input.source_url) {
        const byUrl = await withPostgresClient(async (client) => one<JDRow>(userId
          ? await client.query("SELECT * FROM jds WHERE source_url=$1 AND (user_id=$2 OR user_id IS NULL) ORDER BY id DESC LIMIT 1", [input.source_url, userId])
          : await client.query("SELECT * FROM jds WHERE source_url=$1 ORDER BY id DESC LIMIT 1", [input.source_url])));
        if (byUrl) return byUrl;
      }
      const normalized = normalizeBodyForMatch(input.body || "");
      if (!normalized) return undefined;
      const list = await this.list(userId);
      return list.find((row) => normalizeBodyForMatch(row.body) === normalized);
    },
    async update(id, updates, userId) {
      const keys = ["company", "role", "body", "source_type", "source_url", "keywords_json", "report_id"].filter((key) => updates[key as keyof JDRow] !== undefined);
      if (!keys.length) return this.get(id, userId);
      return withPostgresClient(async (client) => {
        const sets = keys.map((key, index) => {
          const cast = key === "keywords_json" ? "::jsonb" : "";
          return `${pgIdent(key)} = $${index + 1}${cast}`;
        });
        const params = keys.map((key) => updates[key as keyof JDRow]);
        params.push(id);
        if (userId) params.push(userId);
        const result = await client.query(`
          UPDATE jds SET ${sets.join(", ")}
          WHERE id = $${keys.length + 1}${userId ? ` AND (user_id = $${keys.length + 2} OR user_id IS NULL)` : ""}
          RETURNING *
        `, params);
        return one<JDRow>(result);
      });
    },
    async delete(id, userId) {
      return withPostgresClient(async (client) => {
        await client.query("UPDATE scan_jobs SET jd_id = NULL, status = CASE WHEN status IN ('saved','evaluating') THEN 'viewed' ELSE status END WHERE jd_id = $1", [id]);
        const result = userId ? await client.query("DELETE FROM jds WHERE id=$1 AND (user_id=$2 OR user_id IS NULL)", [id, userId]) : await client.query("DELETE FROM jds WHERE id=$1", [id]);
        return Number(result.rowCount || 0);
      });
    },
  };
}

function createSqliteProfileRepository(): DataRepositories["profiles"] {
  return {
    async get(userId) {
      return getDb().prepare("SELECT * FROM profiles WHERE user_id = ? LIMIT 1").get(userId) as ProfileRow | undefined;
    },
    async upsert(userId, dataJson, historyJson, goalsJson = "{}") {
      const existing = await this.get(userId);
      if (existing) getDb().prepare("UPDATE profiles SET data_json=?, goals_json=?, history_json=?, last_updated=datetime('now') WHERE user_id=?").run(dataJson, goalsJson, historyJson, userId);
      else getDb().prepare("INSERT INTO profiles (data_json, goals_json, history_json, user_id, last_updated) VALUES (?, ?, ?, ?, datetime('now'))").run(dataJson, goalsJson, historyJson, userId);
    },
    async deleteSignals(userId) {
      return getDb().prepare("DELETE FROM profile_signals WHERE user_id = ?").run(userId).changes;
    },
  };
}

function createPostgresProfileRepository(): DataRepositories["profiles"] {
  return {
    async get(userId) {
      return withPostgresClient(async (client) => one<ProfileRow>(await client.query("SELECT * FROM profiles WHERE user_id=$1 LIMIT 1", [userId])));
    },
    async upsert(userId, dataJson, historyJson, goalsJson = "{}") {
      await withPostgresClient((client) => client.query(`
        INSERT INTO profiles (user_id, data_json, goals_json, history_json, last_updated)
        VALUES ($1,$2::jsonb,$3::jsonb,$4::jsonb,now())
        ON CONFLICT (user_id) DO UPDATE SET data_json=EXCLUDED.data_json, goals_json=EXCLUDED.goals_json,
          history_json=EXCLUDED.history_json, last_updated=now()
      `, [userId, dataJson, goalsJson, historyJson]));
    },
    async deleteSignals(userId) {
      return withPostgresClient(async (client) => Number((await client.query("DELETE FROM profile_signals WHERE user_id=$1", [userId])).rowCount || 0));
    },
  };
}

function createSqliteSignalRepository(): DataRepositories["signals"] {
  return {
    async insert(signal, userId) {
      const result = getDb().prepare(`
        INSERT INTO profile_signals (user_id, source, signal_type, content_json, session_id)
        VALUES (@user_id, @source, @signal_type, @content_json, @session_id)
      `).run({ user_id: userId, source: signal.source, signal_type: signal.signal_type, content_json: signal.content_json, session_id: signal.session_id || null });
      return Number(result.lastInsertRowid);
    },
    async insertMany(signals, userId) {
      const stmt = getDb().prepare("INSERT INTO profile_signals (user_id, source, signal_type, content_json, session_id) VALUES (@user_id, @source, @signal_type, @content_json, @session_id)");
      const ids: number[] = [];
      const tx = getDb().transaction(() => {
        for (const signal of signals) {
          const result = stmt.run({ user_id: userId, ...signal, session_id: signal.session_id || null });
          ids.push(Number(result.lastInsertRowid));
        }
      });
      tx();
      return ids;
    },
    async query(query, userId) {
      const conditions = ["user_id = @user_id"];
      const params: Record<string, unknown> = { user_id: userId };
      if (query.signal_type) { conditions.push("signal_type = @signal_type"); params.signal_type = query.signal_type; }
      if (query.source) { conditions.push("source = @source"); params.source = query.source; }
      if (query.since) { conditions.push("created_at >= @since"); params.since = query.since; }
      let sql = `SELECT * FROM profile_signals WHERE ${conditions.join(" AND ")} ORDER BY created_at DESC`;
      if (query.limit) { sql += " LIMIT @limit"; params.limit = query.limit; }
      return getDb().prepare(sql).all(params) as SignalRow[];
    },
    async get(id, userId) {
      return getDb().prepare("SELECT * FROM profile_signals WHERE id = ? AND user_id = ?").get(id, userId) as SignalRow | undefined;
    },
    async update(id, signal, userId) {
      const sets: string[] = [];
      const params: Record<string, unknown> = { id, user_id: userId };
      if (signal.source !== undefined) { sets.push("source = @source"); params.source = signal.source; }
      if (signal.signal_type !== undefined) { sets.push("signal_type = @signal_type"); params.signal_type = signal.signal_type; }
      if (signal.content_json !== undefined) { sets.push("content_json = @content_json"); params.content_json = signal.content_json; }
      if (signal.session_id !== undefined) { sets.push("session_id = @session_id"); params.session_id = signal.session_id || null; }
      if (!sets.length) return false;
      return getDb().prepare(`UPDATE profile_signals SET ${sets.join(", ")} WHERE id = @id AND user_id = @user_id`).run(params).changes > 0;
    },
    async delete(id, userId) {
      return getDb().prepare("DELETE FROM profile_signals WHERE id = ? AND user_id = ?").run(id, userId).changes > 0;
    },
  };
}

function createPostgresSignalRepository(): DataRepositories["signals"] {
  return {
    async insert(signal, userId) {
      return withPostgresClient(async (client) => {
        const result = await client.query("INSERT INTO profile_signals (user_id, source, signal_type, content_json, session_id) VALUES ($1,$2,$3,$4::jsonb,$5) RETURNING id", [userId, signal.source, signal.signal_type, signal.content_json, signal.session_id || null]);
        return Number(result.rows[0].id);
      });
    },
    async insertMany(signals, userId) {
      return withPostgresClient(async (client) => {
        await client.query("BEGIN");
        const ids: number[] = [];
        try {
          for (const signal of signals) {
            const result = await client.query("INSERT INTO profile_signals (user_id, source, signal_type, content_json, session_id) VALUES ($1,$2,$3,$4::jsonb,$5) RETURNING id", [userId, signal.source, signal.signal_type, signal.content_json, signal.session_id || null]);
            ids.push(Number(result.rows[0].id));
          }
          await client.query("COMMIT");
          return ids;
        } catch (error) { await client.query("ROLLBACK"); throw error; }
      });
    },
    async query(query, userId) {
      return withPostgresClient(async (client) => {
        const clauses = ["user_id = $1"];
        const params: unknown[] = [userId];
        if (query.signal_type) { params.push(query.signal_type); clauses.push(`signal_type = $${params.length}`); }
        if (query.source) { params.push(query.source); clauses.push(`source = $${params.length}`); }
        if (query.since) { params.push(query.since); clauses.push(`created_at >= $${params.length}`); }
        let sql = `SELECT * FROM profile_signals WHERE ${clauses.join(" AND ")} ORDER BY created_at DESC`;
        if (query.limit) { params.push(query.limit); sql += ` LIMIT $${params.length}`; }
        return rows<SignalRow>((await client.query(sql, params)).rows);
      });
    },
    async get(id, userId) {
      return withPostgresClient(async (client) => one<SignalRow>(await client.query("SELECT * FROM profile_signals WHERE id=$1 AND user_id=$2", [id, userId])));
    },
    async update(id, signal, userId) {
      const sets: string[] = [];
      const params: unknown[] = [];
      const add = (column: string, value: unknown, json = false) => {
        params.push(value);
        sets.push(`${column} = $${params.length}${json ? "::jsonb" : ""}`);
      };
      if (signal.source !== undefined) add("source", signal.source);
      if (signal.signal_type !== undefined) add("signal_type", signal.signal_type);
      if (signal.content_json !== undefined) add("content_json", signal.content_json, true);
      if (signal.session_id !== undefined) add("session_id", signal.session_id || null);
      if (!sets.length) return false;
      params.push(id, userId);
      return withPostgresClient(async (client) => Boolean((await client.query(
        `UPDATE profile_signals SET ${sets.join(", ")} WHERE id=$${params.length - 1} AND user_id=$${params.length}`,
        params,
      )).rowCount));
    },
    async delete(id, userId) {
      return withPostgresClient(async (client) => Boolean((await client.query("DELETE FROM profile_signals WHERE id=$1 AND user_id=$2", [id, userId])).rowCount));
    },
  };
}

function createSqliteReferenceResumeRepository(): DataRepositories["referenceResumes"] {
  return {
    async insert(row, userId) {
      const result = getDb().prepare(`
        INSERT INTO reference_resumes (
          user_id, name, source, sections_json, raw_text, tags, notes, role_category,
          industry_tags, seniority, visibility, status, quality_score, anonymized,
          shared_text_redacted, source_hash, metadata_json, approved_by, approved_at
        )
        VALUES (
          @user_id, @name, @source, @sections_json, @raw_text, @tags, @notes, @role_category,
          @industry_tags, @seniority, @visibility, @status, @quality_score, @anonymized,
          @shared_text_redacted, @source_hash, @metadata_json, @approved_by, @approved_at
        )
      `).run({
        ...row,
        user_id: userId || null,
        tags: row.tags || "[]",
        notes: row.notes || "",
        role_category: row.role_category || "",
        industry_tags: row.industry_tags || "[]",
        seniority: row.seniority || "",
        visibility: row.visibility || "private",
        status: row.status || "active",
        quality_score: row.quality_score || 0,
        anonymized: row.anonymized ? 1 : 0,
        shared_text_redacted: row.shared_text_redacted || "",
        source_hash: row.source_hash || "",
        metadata_json: row.metadata_json || "{}",
        approved_by: row.approved_by || null,
        approved_at: row.approved_at || null,
      });
      return Number(result.lastInsertRowid);
    },
    async list(userId) {
      const columns = "id, user_id, name, source, tags, notes, role_category, visibility, status, quality_score, anonymized, created_at, updated_at";
      const sql = userId ? `SELECT ${columns} FROM reference_resumes WHERE user_id = ? OR visibility = 'team' ORDER BY created_at DESC` : `SELECT ${columns} FROM reference_resumes ORDER BY created_at DESC`;
      return (userId ? getDb().prepare(sql).all(userId) : getDb().prepare(sql).all()) as ReferenceResumeSummary[];
    },
    async search(query, limit, userId) {
      try {
        const terms = query.replace(/['"]/g, "").split(/\s+/).filter(Boolean).map((term) => `"${term}"`).join(" OR ");
        if (!terms) return [];
        const userClause = userId ? "AND (rr.user_id = @user_id OR rr.visibility = 'team')" : "";
        return getDb().prepare(`
          SELECT rr.* FROM reference_resumes rr
          INNER JOIN reference_resumes_fts fts ON rr.id = fts.rowid
          WHERE reference_resumes_fts MATCH @query ${userClause}
          ORDER BY rank LIMIT @limit
        `).all({ query: terms, limit, user_id: userId }) as ReferenceResumeRow[];
      } catch {
        const userClause = userId ? "AND (user_id = @user_id OR visibility = 'team')" : "";
        return getDb().prepare(`SELECT * FROM reference_resumes WHERE raw_text LIKE @like ${userClause} ORDER BY id DESC LIMIT @limit`).all({ like: `%${query.slice(0, 50)}%`, limit, user_id: userId }) as ReferenceResumeRow[];
      }
    },
    async get(id, userId) {
      const sql = userId ? "SELECT * FROM reference_resumes WHERE id = ? AND (user_id = ? OR visibility = 'team')" : "SELECT * FROM reference_resumes WHERE id = ?";
      return (userId ? getDb().prepare(sql).get(id, userId) : getDb().prepare(sql).get(id)) as ReferenceResumeRow | undefined;
    },
    async update(id, updates, userId) {
      const sets: string[] = [];
      const params: Record<string, unknown> = { id, user_id: userId };
      for (const key of [
        "name", "sections_json", "raw_text", "tags", "notes", "role_category",
        "industry_tags", "seniority", "visibility", "status", "quality_score",
        "anonymized", "shared_text_redacted", "source_hash", "metadata_json",
        "approved_by", "approved_at",
      ] as const) {
        if (updates[key] !== undefined) { sets.push(`${key} = @${key}`); params[key] = updates[key]; }
      }
      if (!sets.length) return false;
      sets.push("updated_at = datetime('now')");
      const sql = `UPDATE reference_resumes SET ${sets.join(", ")} WHERE id = @id ${userId ? "AND user_id = @user_id" : ""}`;
      return getDb().prepare(sql).run(params).changes > 0;
    },
    async delete(id, userId) {
      const sql = userId ? "DELETE FROM reference_resumes WHERE id = ? AND user_id = ?" : "DELETE FROM reference_resumes WHERE id = ?";
      return (userId ? getDb().prepare(sql).run(id, userId) : getDb().prepare(sql).run(id)).changes > 0;
    },
    async nameExists(name, excludeId, userId) {
      let sql = "SELECT id FROM reference_resumes WHERE name = ?";
      const params: unknown[] = [name];
      if (excludeId) { sql += " AND id != ?"; params.push(excludeId); }
      if (userId) { sql += " AND user_id = ?"; params.push(userId); }
      return Boolean(getDb().prepare(sql).get(...params));
    },
    async findBySourceHash(sourceHash, userId) {
      if (!sourceHash) return undefined;
      const sql = userId
        ? "SELECT * FROM reference_resumes WHERE source_hash = ? AND user_id = ? ORDER BY id DESC LIMIT 1"
        : "SELECT * FROM reference_resumes WHERE source_hash = ? ORDER BY id DESC LIMIT 1";
      return (userId ? getDb().prepare(sql).get(sourceHash, userId) : getDb().prepare(sql).get(sourceHash)) as ReferenceResumeRow | undefined;
    },
  };
}

function createPostgresReferenceResumeRepository(): DataRepositories["referenceResumes"] {
  return {
    async insert(row, userId) {
      return withPostgresClient(async (client) => Number((await client.query(`
        INSERT INTO reference_resumes (
          user_id, name, source, sections_json, raw_text, tags, notes, role_category,
          industry_tags, seniority, visibility, status, quality_score, anonymized,
          shared_text_redacted, source_hash, metadata_json, approved_by, approved_at
        )
        VALUES ($1,$2,$3,$4::jsonb,$5,$6::jsonb,$7,$8,$9::jsonb,$10,$11,$12,$13,$14,$15,$16,$17::jsonb,$18,$19)
        RETURNING id
      `, [
        userId || null,
        row.name,
        row.source,
        row.sections_json,
        row.raw_text,
        row.tags || "[]",
        row.notes || "",
        row.role_category || "",
        row.industry_tags || "[]",
        row.seniority || "",
        row.visibility || "private",
        row.status || "active",
        row.quality_score || 0,
        Boolean(row.anonymized),
        row.shared_text_redacted || "",
        row.source_hash || "",
        row.metadata_json || "{}",
        row.approved_by || null,
        row.approved_at || null,
      ])).rows[0].id));
    },
    async list(userId) {
      const columns = "id, user_id, name, source, tags, notes, role_category, visibility, status, quality_score, anonymized, created_at, updated_at";
      return withPostgresClient(async (client) => rows<ReferenceResumeSummary>((userId
        ? await client.query(`SELECT ${columns} FROM reference_resumes WHERE user_id=$1 OR visibility='team' ORDER BY created_at DESC`, [userId])
        : await client.query(`SELECT ${columns} FROM reference_resumes ORDER BY created_at DESC`)).rows));
    },
    async search(query, limit, userId) {
      return withPostgresClient(async (client) => rows<ReferenceResumeRow>((userId
        ? await client.query("SELECT * FROM reference_resumes WHERE (user_id=$1 OR visibility='team') AND raw_text ILIKE $2 ORDER BY id DESC LIMIT $3", [userId, `%${query.slice(0, 80)}%`, limit])
        : await client.query("SELECT * FROM reference_resumes WHERE raw_text ILIKE $1 ORDER BY id DESC LIMIT $2", [`%${query.slice(0, 80)}%`, limit])).rows));
    },
    async get(id, userId) {
      return withPostgresClient(async (client) => one<ReferenceResumeRow>(userId
        ? await client.query("SELECT * FROM reference_resumes WHERE id=$1 AND (user_id=$2 OR visibility='team')", [id, userId])
        : await client.query("SELECT * FROM reference_resumes WHERE id=$1", [id])));
    },
    async update(id, updates, userId) {
      const keys = [
        "name", "sections_json", "raw_text", "tags", "notes", "role_category",
        "industry_tags", "seniority", "visibility", "status", "quality_score",
        "anonymized", "shared_text_redacted", "source_hash", "metadata_json",
        "approved_by", "approved_at",
      ].filter((key) => updates[key as keyof ReferenceResumeRow] !== undefined);
      if (!keys.length) return false;
      return withPostgresClient(async (client) => {
        const sets = keys.map((key, index) => {
          const cast = JSON_COLUMNS.has(key) ? "::jsonb" : "";
          return `${pgIdent(key)} = $${index + 1}${cast}`;
        });
        const params = keys.map((key) => updates[key as keyof ReferenceResumeRow]);
        params.push(id);
        if (userId) params.push(userId);
        sets.push("updated_at = now()");
        const sql = `UPDATE reference_resumes SET ${sets.join(", ")} WHERE id = $${keys.length + 1}${userId ? ` AND user_id = $${keys.length + 2}` : ""}`;
        return Boolean((await client.query(sql, params)).rowCount);
      });
    },
    async delete(id, userId) {
      return withPostgresClient(async (client) => Boolean((userId
        ? await client.query("DELETE FROM reference_resumes WHERE id=$1 AND user_id=$2", [id, userId])
        : await client.query("DELETE FROM reference_resumes WHERE id=$1", [id])).rowCount));
    },
    async nameExists(name, excludeId, userId) {
      return withPostgresClient(async (client) => {
        const clauses = ["name = $1"];
        const params: unknown[] = [name];
        if (excludeId) { params.push(excludeId); clauses.push(`id != $${params.length}`); }
        if (userId) { params.push(userId); clauses.push(`user_id = $${params.length}`); }
        return Boolean((await client.query(`SELECT id FROM reference_resumes WHERE ${clauses.join(" AND ")} LIMIT 1`, params)).rowCount);
      });
    },
    async findBySourceHash(sourceHash, userId) {
      if (!sourceHash) return undefined;
      return withPostgresClient(async (client) => one<ReferenceResumeRow>(userId
        ? await client.query("SELECT * FROM reference_resumes WHERE source_hash=$1 AND user_id=$2 ORDER BY id DESC LIMIT 1", [sourceHash, userId])
        : await client.query("SELECT * FROM reference_resumes WHERE source_hash=$1 ORDER BY id DESC LIMIT 1", [sourceHash])));
    },
  };
}

function createSqliteSessionRepository(): DataRepositories["sessions"] {
  return {
    async list(userId) {
      return getDb().prepare(`
        SELECT id, title, messages_json, memory_digest, interview_state_json, agent_state_json, pinned, deleted_at, created_at, updated_at
        FROM sessions WHERE deleted_at IS NULL AND user_id = ? ORDER BY updated_at DESC LIMIT 50
      `).all(userId) as AnyRow[];
    },
    async create(input, userId) {
      return Number(getDb().prepare("INSERT INTO sessions (title, messages_json, memory_digest, interview_state_json, agent_state_json, user_id) VALUES (?, ?, ?, ?, ?, ?)")
        .run(input.title || "新对话", JSON.stringify(input.messages || []), input.memoryDigest || null, JSON.stringify(input.interviewState || {}), JSON.stringify(input.agentState || {}), userId).lastInsertRowid);
    },
    async get(id, userId) {
      return getDb().prepare("SELECT * FROM sessions WHERE id = ? AND user_id = ?").get(id, userId) as AnyRow | undefined;
    },
    async update(id, userId, updates) {
      const { sets, values } = buildSessionUpdate(updates, "sqlite");
      if (!sets.length) return false;
      values.push(id, userId);
      return getDb().prepare(`UPDATE sessions SET ${sets.join(", ")}, updated_at = datetime('now') WHERE id = ? AND user_id = ?`).run(...values).changes > 0;
    },
  };
}

function createPostgresSessionRepository(): DataRepositories["sessions"] {
  return {
    async list(userId) {
      return withPostgresClient(async (client) => rows<AnyRow>((await client.query(`
        SELECT id, title, messages_json, memory_digest, interview_state_json, agent_state_json, pinned, deleted_at, created_at, updated_at
        FROM sessions WHERE deleted_at IS NULL AND user_id = $1 ORDER BY updated_at DESC LIMIT 50
      `, [userId])).rows));
    },
    async create(input, userId) {
      return withPostgresClient(async (client) => Number((await client.query(`
        INSERT INTO sessions (title, messages_json, memory_digest, interview_state_json, agent_state_json, user_id)
        VALUES ($1,$2::jsonb,$3,$4::jsonb,$5::jsonb,$6) RETURNING id
      `, [input.title || "新对话", JSON.stringify(input.messages || []), input.memoryDigest || null, JSON.stringify(input.interviewState || {}), JSON.stringify(input.agentState || {}), userId])).rows[0].id));
    },
    async get(id, userId) {
      return withPostgresClient(async (client) => one<AnyRow>(await client.query("SELECT * FROM sessions WHERE id=$1 AND user_id=$2", [id, userId])));
    },
    async update(id, userId, updates) {
      const { sets, values } = buildSessionUpdate(updates, "postgres");
      if (!sets.length) return false;
      values.push(id, userId);
      return withPostgresClient(async (client) => Boolean((await client.query(`UPDATE sessions SET ${sets.join(", ")}, updated_at = now() WHERE id = $${values.length - 1} AND user_id = $${values.length}`, values)).rowCount));
    },
  };
}

function createSqliteStoryRepository(): DataRepositories["stories"] {
  return {
    async list(userId) {
      return getDb().prepare("SELECT * FROM stories WHERE user_id = ? ORDER BY created_at DESC").all(userId) as AnyRow[];
    },
    async create(input, userId) {
      return Number(getDb().prepare(`
        INSERT INTO stories (user_id, title, situation, task, action, result, tags_json)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        userId,
        input.title,
        input.situation || "",
        input.task || "",
        input.action || "",
        input.result || "",
        JSON.stringify(input.tags || []),
      ).lastInsertRowid);
    },
  };
}

function createPostgresStoryRepository(): DataRepositories["stories"] {
  return {
    async list(userId) {
      return withPostgresClient(async (client) => rows<AnyRow>((await client.query(
        "SELECT * FROM stories WHERE user_id = $1 ORDER BY created_at DESC",
        [userId],
      )).rows));
    },
    async create(input, userId) {
      return withPostgresClient(async (client) => Number((await client.query(`
        INSERT INTO stories (user_id, title, situation, task, action, result, tags_json)
        VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
        RETURNING id
      `, [
        userId,
        input.title,
        input.situation || "",
        input.task || "",
        input.action || "",
        input.result || "",
        JSON.stringify(input.tags || []),
      ])).rows[0].id));
    },
  };
}

function createSqliteAgentPreferenceRepository(): DataRepositories["agentPreferences"] {
  return {
    async list(userId) {
      return getDb().prepare("SELECT * FROM agent_preferences WHERE user_id = ?").all(userId) as AnyRow[];
    },
    async upsert(input, userId) {
      getDb().prepare(`
        INSERT INTO agent_preferences (user_id, entity_type, entity_key, weight, decay_rate, last_updated)
        VALUES (?, ?, ?, ?, ?, datetime('now'))
        ON CONFLICT(entity_type, entity_key) DO UPDATE SET
          weight = excluded.weight, last_updated = datetime('now')
      `).run(userId, input.entity_type, input.entity_key, input.weight ?? 1.0, input.decay_rate ?? 0.05);
    },
  };
}

function createPostgresAgentPreferenceRepository(): DataRepositories["agentPreferences"] {
  return {
    async list(userId) {
      return withPostgresClient(async (client) => rows<AnyRow>((await client.query("SELECT * FROM agent_preferences WHERE user_id = $1", [userId])).rows));
    },
    async upsert(input, userId) {
      await withPostgresClient((client) => client.query(`
        INSERT INTO agent_preferences (user_id, entity_type, entity_key, weight, decay_rate, last_updated)
        VALUES ($1,$2,$3,$4,$5,now())
        ON CONFLICT (user_id, entity_type, entity_key) DO UPDATE SET
          weight = EXCLUDED.weight, last_updated = now()
      `, [userId, input.entity_type, input.entity_key, input.weight ?? 1.0, input.decay_rate ?? 0.05]));
    },
  };
}

function createSqliteNewsRepository(): DataRepositories["news"] {
  return {
    async cache(news) {
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
    },
    async list(source, limit = 5) {
      return getDb().prepare(
        "SELECT * FROM news_cache WHERE source = ? ORDER BY cached_at DESC LIMIT ?",
      ).all(source, limit) as NewsCacheRow[];
    },
    async cleanExpired(maxAgeHours = 24) {
      return getDb().prepare(
        `DELETE FROM news_cache WHERE cached_at < datetime('now', '-' || ? || ' hours')`,
      ).run(maxAgeHours).changes;
    },
    async isFresh(source, maxAgeHours = 6) {
      const row = getDb().prepare(
        `SELECT cached_at FROM news_cache WHERE source = ? AND cached_at > datetime('now', '-' || ? || ' hours') LIMIT 1`,
      ).get(source, maxAgeHours) as { cached_at: string } | undefined;
      return Boolean(row);
    },
  };
}

function createPostgresNewsRepository(): DataRepositories["news"] {
  return {
    async cache(news) {
      if (!news.length) return;
      await withPostgresClient(async (client) => {
        await client.query("BEGIN");
        try {
          for (const item of news) {
            const sourceName = item.source_name || null;
            await client.query(
              "DELETE FROM news_cache WHERE source = $1 AND source_name IS NOT DISTINCT FROM $2",
              [item.source, sourceName],
            );
            await client.query(`
              INSERT INTO news_cache (source, source_name, title, summary, url, published_at)
              VALUES ($1, $2, $3, $4, $5, $6)
            `, [
              item.source,
              sourceName,
              item.title,
              item.summary || null,
              item.url || null,
              normalizeTimestampInput(item.published_at),
            ]);
          }
          await client.query("COMMIT");
        } catch (error) {
          await client.query("ROLLBACK");
          throw error;
        }
      });
    },
    async list(source, limit = 5) {
      return withPostgresClient(async (client) => rows<NewsCacheRow>((await client.query(
        "SELECT * FROM news_cache WHERE source = $1 ORDER BY cached_at DESC LIMIT $2",
        [source, limit],
      )).rows));
    },
    async cleanExpired(maxAgeHours = 24) {
      return withPostgresClient(async (client) => Number((await client.query(
        "DELETE FROM news_cache WHERE cached_at < now() - make_interval(hours => $1::int)",
        [maxAgeHours],
      )).rowCount || 0));
    },
    async isFresh(source, maxAgeHours = 6) {
      return withPostgresClient(async (client) => Boolean((await client.query(
        "SELECT cached_at FROM news_cache WHERE source = $1 AND cached_at > now() - make_interval(hours => $2::int) LIMIT 1",
        [source, maxAgeHours],
      )).rowCount));
    },
  };
}

function createSqliteOfferRepository(): DataRepositories["offers"] {
  return {
    async list(userId) {
      return getDb().prepare("SELECT * FROM offers WHERE user_id = ? ORDER BY created_at DESC").all(userId) as AnyRow[];
    },
    async get(id, userId) {
      return getDb().prepare("SELECT * FROM offers WHERE id = ? AND user_id = ?").get(id, userId) as AnyRow | undefined;
    },
    async upsert(input, userId) {
      const db = getDb();
      const monthlySalaryK = normalizeMonthlySalaryK(input.monthly_salary);
      const existing = db.prepare("SELECT id FROM offers WHERE user_id = ? AND company = ? AND role = ?").get(userId, input.company, input.role) as { id: number } | undefined;
      const values = offerValues(input, monthlySalaryK);
      if (existing) {
        db.prepare(`
          UPDATE offers SET monthly_salary=?, months_per_year=?, annual_bonus=?, has_social_insurance=?, housing_fund_rate=?,
            options=?, probation_months=?, start_date=?, other_benefits=?, location=?, level=?, employment_form=?, employer_name=?,
            contract_months=?, overtime_policy=?, bonus_guarantee=?, equity_type=?, equity_vesting=?, commute_minutes=?,
            city_cost_level=?, job_nature=?, benefits_json=?, application_id=?, updated_at=datetime('now') WHERE id=?
        `).run(...values, existing.id);
        return { id: existing.id, updated: true };
      }
      const result = db.prepare(`
        INSERT INTO offers (user_id, company, role, monthly_salary, months_per_year, annual_bonus, has_social_insurance,
          housing_fund_rate, options, probation_months, start_date, other_benefits, location, level, employment_form,
          employer_name, contract_months, overtime_policy, bonus_guarantee, equity_type, equity_vesting, commute_minutes,
          city_cost_level, job_nature, benefits_json, application_id)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      `).run(userId, input.company, input.role, ...values);
      return { id: Number(result.lastInsertRowid), created: true };
    },
    async update(id, input, userId) {
      const existing = await this.get(id, userId);
      if (!existing) return undefined;
      const next = { ...existing, ...input };
      const monthlySalaryK = normalizeMonthlySalaryK(next.monthly_salary);
      const values = offerValues(next, monthlySalaryK);
      getDb().prepare(`
        UPDATE offers SET company=?, role=?, monthly_salary=?, months_per_year=?, annual_bonus=?, has_social_insurance=?, housing_fund_rate=?,
          options=?, probation_months=?, start_date=?, other_benefits=?, location=?, level=?, employment_form=?, employer_name=?,
          contract_months=?, overtime_policy=?, bonus_guarantee=?, equity_type=?, equity_vesting=?, commute_minutes=?,
          city_cost_level=?, job_nature=?, benefits_json=?, application_id=?, updated_at=datetime('now') WHERE id=? AND user_id=?
      `).run(next.company, next.role, ...values, id, userId);
      return this.get(id, userId);
    },
    async delete(id, userId) {
      const db = getDb();
      const offer = db.prepare("SELECT id FROM offers WHERE id = ? AND user_id = ?").get(id, userId);
      if (!offer) return null;
      const reportIds = (db.prepare("SELECT id FROM offer_reports WHERE user_id = ? AND offer_id = ?").all(userId, id) as { id: number }[]).map((row) => row.id);
      const tx = db.transaction(() => {
        if (reportIds.length) db.prepare(`DELETE FROM offer_reports WHERE id IN (${reportIds.map(() => "?").join(",")})`).run(...reportIds);
        db.prepare("DELETE FROM offers WHERE id = ? AND user_id = ?").run(id, userId);
      });
      tx();
      return { offerId: id, deletedReports: reportIds.length };
    },
  };
}

function createPostgresOfferRepository(): DataRepositories["offers"] {
  return {
    async list(userId) {
      return withPostgresClient(async (client) => rows<AnyRow>((await client.query("SELECT * FROM offers WHERE user_id=$1 ORDER BY created_at DESC", [userId])).rows));
    },
    async get(id, userId) {
      return withPostgresClient(async (client) => one<AnyRow>(await client.query("SELECT * FROM offers WHERE id=$1 AND user_id=$2", [id, userId])));
    },
    async upsert(input, userId) {
      return withPostgresClient(async (client) => {
        const monthlySalaryK = normalizeMonthlySalaryK(input.monthly_salary);
        const existing = one<{ id: number }>(await client.query("SELECT id FROM offers WHERE user_id=$1 AND company=$2 AND role=$3", [userId, input.company, input.role]));
        const values = offerValues(input, monthlySalaryK);
        if (existing) {
          await client.query(`
            UPDATE offers SET monthly_salary=$1, months_per_year=$2, annual_bonus=$3, has_social_insurance=$4, housing_fund_rate=$5,
              options=$6, probation_months=$7, start_date=$8, other_benefits=$9, location=$10, level=$11, employment_form=$12,
              employer_name=$13, contract_months=$14, overtime_policy=$15, bonus_guarantee=$16, equity_type=$17, equity_vesting=$18,
              commute_minutes=$19, city_cost_level=$20, job_nature=$21, benefits_json=$22::jsonb, application_id=$23, updated_at=now()
            WHERE id=$24 AND user_id=$25
          `, [...values, existing.id, userId]);
          return { id: Number(existing.id), updated: true };
        }
        const result = await client.query(`
          INSERT INTO offers (user_id, company, role, monthly_salary, months_per_year, annual_bonus, has_social_insurance,
            housing_fund_rate, options, probation_months, start_date, other_benefits, location, level, employment_form,
            employer_name, contract_months, overtime_policy, bonus_guarantee, equity_type, equity_vesting, commute_minutes,
            city_cost_level, job_nature, benefits_json, application_id)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25::jsonb,$26)
          RETURNING id
        `, [userId, input.company, input.role, ...values]);
        return { id: Number(result.rows[0].id), created: true };
      });
    },
    async update(id, input, userId) {
      return withPostgresClient(async (client) => {
        const existing = one<AnyRow>(await client.query("SELECT * FROM offers WHERE id=$1 AND user_id=$2", [id, userId]));
        if (!existing) return undefined;
        const next = { ...existing, ...input };
        const monthlySalaryK = normalizeMonthlySalaryK(next.monthly_salary);
        const values = offerValues(next, monthlySalaryK);
        const result = await client.query(`
          UPDATE offers SET company=$1, role=$2, monthly_salary=$3, months_per_year=$4, annual_bonus=$5, has_social_insurance=$6, housing_fund_rate=$7,
            options=$8, probation_months=$9, start_date=$10, other_benefits=$11, location=$12, level=$13, employment_form=$14,
            employer_name=$15, contract_months=$16, overtime_policy=$17, bonus_guarantee=$18, equity_type=$19, equity_vesting=$20,
            commute_minutes=$21, city_cost_level=$22, job_nature=$23, benefits_json=$24::jsonb, application_id=$25, updated_at=now()
          WHERE id=$26 AND user_id=$27
          RETURNING *
        `, [next.company, next.role, ...values, id, userId]);
        return one<AnyRow>(result);
      });
    },
    async delete(id, userId) {
      return withPostgresClient(async (client) => {
        await client.query("BEGIN");
        try {
          const offer = one<{ id: number }>(await client.query("SELECT id FROM offers WHERE id=$1 AND user_id=$2", [id, userId]));
          if (!offer) { await client.query("ROLLBACK"); return null; }
          const reportRows = await client.query("DELETE FROM offer_reports WHERE user_id=$1 AND offer_id=$2 RETURNING id", [userId, id]);
          await client.query("DELETE FROM offers WHERE id=$1 AND user_id=$2", [id, userId]);
          await client.query("COMMIT");
          return { offerId: id, deletedReports: reportRows.rowCount || 0 };
        } catch (error) { await client.query("ROLLBACK"); throw error; }
      });
    },
  };
}

function createSqliteOfferReportRepository(): DataRepositories["offerReports"] {
  return {
    async list(userId) {
      return getDb().prepare("SELECT * FROM offer_reports WHERE user_id = ? ORDER BY created_at DESC LIMIT 20").all(userId) as AnyRow[];
    },
    async get(id, userId) {
      return getDb().prepare("SELECT * FROM offer_reports WHERE id = ? AND user_id = ?").get(id, userId) as AnyRow | undefined;
    },
    async insert(input, userId) {
      const result = getDb().prepare(`
        INSERT INTO offer_reports (user_id, title, report_type, model_version, offer_id, overall_score, verdict, summary,
          offer_snapshot_json, modules_json, red_flags_json, missing_info_json, negotiation_levers_json,
          hr_questions_json, assumptions_json, take_home_json, offers_json, report_markdown, num_offers)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      `).run(userId, ...offerReportValues(input));
      const id = Number(result.lastInsertRowid);
      if (input.offer_id) getDb().prepare("UPDATE offers SET latest_report_id = ?, updated_at = datetime('now') WHERE id = ? AND user_id = ?").run(id, input.offer_id, userId);
      return id;
    },
    async delete(id, userId) {
      const report = getDb().prepare("SELECT id, offer_id FROM offer_reports WHERE id = ? AND user_id = ?").get(id, userId) as { id: number; offer_id?: number | null } | undefined;
      if (!report) return null;
      const tx = getDb().transaction(() => {
        getDb().prepare("UPDATE offers SET latest_report_id = NULL, updated_at = datetime('now') WHERE latest_report_id = ? AND user_id = ?").run(id, userId);
        getDb().prepare("DELETE FROM offer_reports WHERE id = ? AND user_id = ?").run(id, userId);
      });
      tx();
      return { reportId: id, offerId: report.offer_id || null };
    },
  };
}

function createPostgresOfferReportRepository(): DataRepositories["offerReports"] {
  return {
    async list(userId) {
      return withPostgresClient(async (client) => rows<AnyRow>((await client.query("SELECT * FROM offer_reports WHERE user_id=$1 ORDER BY created_at DESC LIMIT 20", [userId])).rows));
    },
    async get(id, userId) {
      return withPostgresClient(async (client) => one<AnyRow>(await client.query("SELECT * FROM offer_reports WHERE id=$1 AND user_id=$2", [id, userId])));
    },
    async insert(input, userId) {
      return withPostgresClient(async (client) => {
        const result = await client.query(`
          INSERT INTO offer_reports (user_id, title, report_type, model_version, offer_id, overall_score, verdict, summary,
            offer_snapshot_json, modules_json, red_flags_json, missing_info_json, negotiation_levers_json,
            hr_questions_json, assumptions_json, take_home_json, offers_json, report_markdown, num_offers)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11::jsonb,$12::jsonb,$13::jsonb,$14::jsonb,$15::jsonb,$16::jsonb,$17::jsonb,$18,$19)
          RETURNING id
        `, [userId, ...offerReportValues(input)]);
        const id = Number(result.rows[0].id);
        if (input.offer_id) await client.query("UPDATE offers SET latest_report_id=$1, updated_at=now() WHERE id=$2 AND user_id=$3", [id, input.offer_id, userId]);
        return id;
      });
    },
    async delete(id, userId) {
      return withPostgresClient(async (client) => {
        await client.query("BEGIN");
        try {
          const report = one<{ id: number; offer_id?: number | null }>(await client.query("SELECT id, offer_id FROM offer_reports WHERE id=$1 AND user_id=$2", [id, userId]));
          if (!report) { await client.query("ROLLBACK"); return null; }
          await client.query("UPDATE offers SET latest_report_id=NULL, updated_at=now() WHERE latest_report_id=$1 AND user_id=$2", [id, userId]);
          await client.query("DELETE FROM offer_reports WHERE id=$1 AND user_id=$2", [id, userId]);
          await client.query("COMMIT");
          return { reportId: id, offerId: report.offer_id || null };
        } catch (error) { await client.query("ROLLBACK"); throw error; }
      });
    },
  };
}

function offerValues(input: AnyRow, monthlySalaryK: number) {
  return [
    monthlySalaryK,
    input.months_per_year ?? 12,
    input.annual_bonus ?? 0,
    input.has_social_insurance !== false ? 1 : 0,
    input.housing_fund_rate ?? 7,
    input.options ?? null,
    input.probation_months ?? 3,
    input.start_date ?? null,
    input.other_benefits ?? null,
    input.location ?? null,
    input.level ?? null,
    input.employment_form ?? "unknown",
    input.employer_name ?? null,
    input.contract_months ?? null,
    input.overtime_policy ?? "unknown",
    input.bonus_guarantee ?? "unknown",
    input.equity_type ?? null,
    input.equity_vesting ?? null,
    input.commute_minutes ?? null,
    input.city_cost_level ?? "unknown",
    input.job_nature ?? null,
    JSON.stringify(input.benefits || {}),
    input.application_id ?? null,
  ];
}

function offerReportValues(input: AnyRow) {
  return [
    input.title || "Offer report",
    input.report_type || "comparison",
    input.model_version || "",
    input.offer_id ?? null,
    input.overall_score ?? 0,
    input.verdict || "",
    input.summary || "",
    jsonString(input.offer_snapshot_json ?? input.offer_snapshot, {}),
    jsonString(input.modules_json, []),
    jsonString(input.red_flags_json, []),
    jsonString(input.missing_info_json, []),
    jsonString(input.negotiation_levers_json, []),
    jsonString(input.hr_questions_json, []),
    jsonString(input.assumptions_json, []),
    jsonString(input.take_home_json, {}),
    jsonString(input.offers_json, []),
    input.report_markdown || "",
    input.num_offers ?? 0,
  ];
}

function normalizeApplicationPayload(app: AppRow): Required<Pick<AppRow, "num" | "date" | "company" | "role" | "score" | "status" | "pdf_generated" | "report_path" | "notes" | "metadata_json">> & Pick<AppRow, "jd_id" | "source_url"> {
  return {
    num: Number(app.num || 0),
    date: app.date || new Date().toISOString().slice(0, 10),
    company: String(app.company || "").trim(),
    role: String(app.role || "").trim(),
    score: Number(app.score || 0),
    status: normalizeApplicationStatus(app.status),
    pdf_generated: Number(app.pdf_generated || 0),
    report_path: app.report_path || "",
    notes: app.notes || "",
    jd_id: app.jd_id ?? null,
    source_url: app.source_url || "",
    metadata_json: jsonString(app.metadata_json, {}),
  };
}

function normalizeApplicationRecord(row: AppRow): AppRow {
  return {
    ...row,
    status: normalizeApplicationStatus(row.status),
    metadata_json: jsonString(row.metadata_json, {}),
    source_url: row.source_url || "",
  };
}

function normalizeApplicationEventPayload(event: ApplicationEventInput): Required<ApplicationEventInput> {
  return {
    application_id: Number(event.application_id),
    event_type: event.event_type || "note",
    from_status: event.from_status ? normalizeApplicationStatus(event.from_status) : null,
    to_status: event.to_status ? normalizeApplicationStatus(event.to_status) : null,
    note: event.note || "",
    source: event.source || "system",
    metadata_json: jsonString(event.metadata_json, {}),
  };
}

function normalizeApplicationEventRecord(row: ApplicationEventRow): ApplicationEventRow {
  return {
    ...row,
    from_status: row.from_status ? normalizeApplicationStatus(row.from_status) : null,
    to_status: row.to_status ? normalizeApplicationStatus(row.to_status) : null,
    metadata_json: jsonString(row.metadata_json, {}),
  };
}

function buildSessionUpdate(updates: AnyRow, driver: DatabaseDriver) {
  const sets: string[] = [];
  const values: unknown[] = [];
  const add = (column: string, value: unknown, json = false) => {
    values.push(json ? JSON.stringify(value || {}) : value);
    const placeholder = driver === "postgres" ? `$${values.length}${json ? "::jsonb" : ""}` : "?";
    sets.push(`${column} = ${placeholder}`);
  };
  if (updates.title !== undefined) add("title", updates.title);
  if (updates.messages !== undefined) add("messages_json", updates.messages || [], true);
  if (updates.pinned !== undefined) add("pinned", driver === "postgres" ? Boolean(updates.pinned) : updates.pinned ? 1 : 0);
  if (updates.memoryDigest !== undefined) add("memory_digest", updates.memoryDigest);
  if (updates.interviewState !== undefined) add("interview_state_json", updates.interviewState || {}, true);
  if (updates.agentState !== undefined) add("agent_state_json", updates.agentState || {}, true);
  if (updates.deleted !== undefined) add("deleted_at", updates.deleted ? new Date().toISOString() : null);
  return { sets, values };
}

function normalizeMonthlySalaryK(value: unknown): number {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return 0;
  return n >= 1000 ? Math.round((n / 1000) * 10) / 10 : n;
}

function normalizeBodyForMatch(body: string): string {
  return body.replace(/\s+/g, " ").trim().slice(0, 500).toLowerCase();
}

function normalizeTimestampInput(value?: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function rows<T>(input: AnyRow[]): T[] {
  return input.map(normalizeRow) as T[];
}

function one<T>(result: { rows: AnyRow[] } | undefined): T | undefined {
  const row = result?.rows?.[0];
  return row ? normalizeRow(row) as T : undefined;
}

function normalizeRow(row: AnyRow): AnyRow {
  const out: AnyRow = {};
  for (const [key, value] of Object.entries(row)) {
    if (value instanceof Date) out[key] = value.toISOString();
    else if (JSON_COLUMNS.has(key) && typeof value !== "string") out[key] = JSON.stringify(value ?? defaultJson(key));
    else if (key === "pinned" && typeof value === "boolean") out[key] = value ? 1 : 0;
    else out[key] = value;
  }
  return out;
}

function defaultJson(key: string) {
  return /(keywords|history|messages|tags|modules|flags|info|levers|questions|assumptions|offers|positive|negative|error_log)/.test(key) ? [] : {};
}

function jsonString(value: unknown, fallback: unknown): string {
  if (value === undefined || value === null) return JSON.stringify(fallback);
  return typeof value === "string" ? value : JSON.stringify(value);
}

function pgIdent(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}
