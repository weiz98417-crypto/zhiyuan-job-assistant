import { randomUUID } from "crypto";
import { getDatabaseDriver, withPostgresClient } from "./postgres";
import { getDb } from "./server-db";
import {
  cancelActiveScan,
  cancelScan,
  createScanEntry,
  getActiveScan,
  getScanHistory,
  getScanJobs,
  getScanStatus,
  updateJobStatus,
} from "../../lib/scan/orchestrator.mjs";

type AnyRow = Record<string, unknown>;
type ScanIssue = { company?: string; error?: string; level?: string };
type ScanCompany = { name: string; careers_url?: string; ats_type?: string; [key: string]: unknown };

export async function createScanEntryForUser(
  userId: string,
  companies: ScanCompany[],
  companyFilter?: string[],
  titleFilter?: { positive?: string[]; negative?: string[] },
  scanOptions?: { location?: string; maxResults?: number },
) {
  if (getDatabaseDriver() !== "postgres") {
    return createScanEntry(getDb(), userId, companies as never, companyFilter, titleFilter, scanOptions);
  }

  return withPostgresClient(async (client) => {
    const existing = await client.query(
      "SELECT id FROM scan_queue WHERE user_id = $1 AND status IN ('pending','running') LIMIT 1",
      [userId],
    );
    if (existing.rowCount) return { scanId: existing.rows[0].id, conflict: true };

    const filtered = companyFilter ? companies.filter((company) => companyFilter.includes(company.name)) : companies;
    const scanId = randomUUID();
    const positive = titleFilter?.positive || [];
    const negative = titleFilter?.negative || [];
    const location = (scanOptions?.location || "").trim();
    const maxResults = Math.min(Math.max(Number(scanOptions?.maxResults || 50), 1), 200);
    await client.query(`
      INSERT INTO scan_queue
        (id, user_id, status, title_positive_json, title_negative_json, location_filter, max_results, companies_total, companies_done, jobs_found, jobs_new, error_log)
      VALUES ($1, $2, 'pending', $3::jsonb, $4::jsonb, $5, $6, $7, 0, 0, 0, '[]'::jsonb)
    `, [scanId, userId, JSON.stringify(positive), JSON.stringify(negative), location, maxResults, filtered.length]);

    return { scanId, conflict: false, companiesTotal: filtered.length };
  });
}

export async function getScanJobsForUser(userId: string, filters: { status?: string; page?: number; limit?: number }) {
  if (getDatabaseDriver() !== "postgres") return getScanJobs(getDb(), userId, filters);

  const status = filters.status || "new";
  const limit = filters.limit || 20;
  const page = filters.page || 1;
  const offset = (page - 1) * limit;
  return withPostgresClient(async (client) => {
    const [total, jobs] = await Promise.all([
      client.query("SELECT COUNT(*) AS count FROM scan_jobs WHERE user_id = $1 AND status = $2", [userId, status]),
      client.query("SELECT * FROM scan_jobs WHERE user_id = $1 AND status = $2 ORDER BY discovered_at DESC LIMIT $3 OFFSET $4", [userId, status, limit, offset]),
    ]);
    return { jobs: normalizeRows(jobs.rows), total: Number(total.rows[0]?.count || 0), page };
  });
}

export async function getScanJobForUser(jobId: number, userId: string) {
  if (getDatabaseDriver() !== "postgres") {
    return getDb().prepare("SELECT * FROM scan_jobs WHERE id = ? AND user_id = ?").get(jobId, userId) as AnyRow | undefined;
  }

  return withPostgresClient(async (client) => {
    const result = await client.query("SELECT * FROM scan_jobs WHERE id = $1 AND user_id = $2 LIMIT 1", [jobId, userId]);
    return normalizeRows(result.rows)[0] as AnyRow | undefined;
  });
}

export async function markScanJobViewedForUser(jobId: number, userId: string, updates: { snippet?: string; error?: string }) {
  if (getDatabaseDriver() !== "postgres") {
    getDb().prepare("UPDATE scan_jobs SET status = 'viewed', jd_snippet = COALESCE(?, jd_snippet), last_error = ?, last_interaction_at = datetime('now') WHERE id = ? AND user_id = ?")
      .run(updates.snippet ?? null, updates.error || "", jobId, userId);
    return;
  }

  await withPostgresClient((client) => client.query(
    "UPDATE scan_jobs SET status = 'viewed', jd_snippet = COALESCE($1, jd_snippet), last_error = $2, last_interaction_at = now() WHERE id = $3 AND user_id = $4",
    [updates.snippet ?? null, updates.error || "", jobId, userId],
  ));
}

export async function updateScanJobErrorForUser(jobId: number, userId: string, error: string) {
  if (getDatabaseDriver() !== "postgres") {
    getDb().prepare("UPDATE scan_jobs SET last_error = ?, last_interaction_at = datetime('now') WHERE id = ? AND user_id = ?").run(error, jobId, userId);
    return;
  }

  await withPostgresClient((client) => client.query(
    "UPDATE scan_jobs SET last_error = $1, last_interaction_at = now() WHERE id = $2 AND user_id = $3",
    [error, jobId, userId],
  ));
}

export async function attachJdToScanJobForUser(jobId: number, userId: string, jdId: number, status: string) {
  if (getDatabaseDriver() !== "postgres") {
    getDb().prepare("UPDATE scan_jobs SET jd_id = ?, status = ?, last_error = '', last_interaction_at = datetime('now') WHERE id = ? AND user_id = ?")
      .run(jdId, status, jobId, userId);
    return;
  }

  await withPostgresClient((client) => client.query(
    "UPDATE scan_jobs SET jd_id = $1, status = $2, last_error = '', last_interaction_at = now() WHERE id = $3 AND user_id = $4",
    [jdId, status, jobId, userId],
  ));
}

export async function getScanStatusForUser(scanId: string, userId: string) {
  if (getDatabaseDriver() !== "postgres") return getScanStatus(getDb(), scanId, userId);

  return withPostgresClient(async (client) => {
    const scanResult = await client.query("SELECT * FROM scan_queue WHERE id = $1 AND user_id = $2 LIMIT 1", [scanId, userId]);
    const scan = scanResult.rows[0];
    if (!scan) return null;

    const companies = await client.query(`
      SELECT company, COUNT(*)::int AS jobs_found
      FROM scan_jobs WHERE scan_id = $1
      GROUP BY company
    `, [scanId]);
    return formatScanStatus(scan, companies.rows);
  });
}

export async function getActiveScanForUser(userId: string) {
  if (getDatabaseDriver() !== "postgres") return getActiveScan(getDb(), userId);

  return withPostgresClient(async (client) => {
    const result = await client.query(
      "SELECT id FROM scan_queue WHERE user_id = $1 AND status IN ('pending','running') ORDER BY updated_at DESC LIMIT 1",
      [userId],
    );
    const scanId = result.rows[0]?.id;
    if (!scanId) return null;
    const scanResult = await client.query("SELECT * FROM scan_queue WHERE id = $1 AND user_id = $2 LIMIT 1", [scanId, userId]);
    const companies = await client.query(`
      SELECT company, COUNT(*)::int AS jobs_found
      FROM scan_jobs WHERE scan_id = $1
      GROUP BY company
    `, [scanId]);
    return formatScanStatus(scanResult.rows[0], companies.rows);
  });
}

export async function updateScanJobStatusForUser(jobId: number, userId: string, newStatus: string) {
  if (getDatabaseDriver() !== "postgres") return updateJobStatus(getDb(), jobId, userId, newStatus);

  const validStatuses = ["new", "viewed", "saved", "evaluating", "evaluated", "dismissed"];
  if (!validStatuses.includes(newStatus)) return { success: false, error: `Invalid status: ${newStatus}` };
  return withPostgresClient(async (client) => {
    const result = await client.query(
      "UPDATE scan_jobs SET status = $1, last_interaction_at = now() WHERE id = $2 AND user_id = $3",
      [newStatus, jobId, userId],
    );
    return { success: Boolean(result.rowCount) };
  });
}

export async function cancelScanForUser(scanId: string | null, userId: string) {
  if (getDatabaseDriver() !== "postgres") {
    return scanId ? cancelScan(getDb(), scanId, userId) : cancelActiveScan(getDb(), userId);
  }

  const errorLog = JSON.stringify([{ company: "scan", error: "user canceled scan", level: "INFO" }]);
  return withPostgresClient(async (client) => {
    const result = scanId
      ? await client.query(
        `UPDATE scan_queue SET status = 'canceled', error_log = $1::jsonb, updated_at = now()
         WHERE id = $2 AND user_id = $3 AND status IN ('pending','running')`,
        [errorLog, scanId, userId],
      )
      : await client.query(
        `UPDATE scan_queue SET status = 'canceled', error_log = $1::jsonb, updated_at = now()
         WHERE user_id = $2 AND status IN ('pending','running')`,
        [errorLog, userId],
      );
    return { success: Boolean(result.rowCount) };
  });
}

export async function getScanHistoryForUser(userId: string, opts: { page?: number; limit?: number }) {
  if (getDatabaseDriver() !== "postgres") return getScanHistory(getDb(), userId, opts);

  const limit = opts.limit || 10;
  const page = opts.page || 1;
  const offset = (page - 1) * limit;
  return withPostgresClient(async (client) => {
    const [total, scans] = await Promise.all([
      client.query("SELECT COUNT(*) AS count FROM scan_queue WHERE user_id = $1", [userId]),
      client.query(`
        SELECT sq.id, sq.created_at, sq.companies_done, sq.jobs_found, sq.jobs_new, sq.error_log,
               sq.title_positive_json, sq.title_negative_json, sq.location_filter, sq.max_results,
               (SELECT COUNT(*) FROM scan_jobs WHERE scan_id = sq.id)::int AS total_jobs
        FROM scan_queue sq WHERE sq.user_id = $1
        ORDER BY sq.created_at DESC LIMIT $2 OFFSET $3
      `, [userId, limit, offset]),
    ]);

    return {
      history: scans.rows.map(formatHistoryScan),
      total: Number(total.rows[0]?.count || 0),
      page,
    };
  });
}

function formatScanStatus(scan: AnyRow, companies: AnyRow[]) {
  const errorLog = parseArray<ScanIssue>(scan.error_log);
  const issueMap = new Map(errorLog.map((entry) => [entry.company, entry]));
  const companyStatus = companies.map((company) => {
    const name = String(company.company || "");
    const issue = issueMap.get(name);
    return {
      name,
      status: issue && issue.level !== "INFO" ? "error" : "success",
      jobsFound: Number(company.jobs_found || 0),
      error: issue?.error || null,
      level: issue?.level || null,
    };
  });
  for (const issue of errorLog) {
    if (!companyStatus.some((company) => company.name === issue.company)) {
      companyStatus.push({
        name: issue.company || "scan",
        status: issue.level === "INFO" ? "empty" : "error",
        jobsFound: 0,
        error: issue.error || null,
        level: issue.level || null,
      });
    }
  }

  return {
    scanId: scan.id,
    status: scan.status,
    companiesDone: Number(scan.companies_done || 0),
    companiesTotal: Number(scan.companies_total || 0),
    jobsFound: Number(scan.jobs_found || 0),
    jobsNew: Number(scan.jobs_new || 0),
    companies: companyStatus,
    titleFilter: {
      positive: parseArray(scan.title_positive_json),
      negative: parseArray(scan.title_negative_json),
    },
    locationFilter: scan.location_filter || "",
    maxResults: Number(scan.max_results || 50),
    createdAt: normalizeDate(scan.created_at),
  };
}

function formatHistoryScan(scan: AnyRow) {
  const issues = parseArray<ScanIssue>(scan.error_log);
  return {
    scanId: scan.id,
    createdAt: normalizeDate(scan.created_at),
    companiesDone: Number(scan.companies_done || 0),
    jobsFound: Number(scan.jobs_found || 0),
    jobsNew: Number(scan.jobs_new || 0),
    totalJobs: Number(scan.total_jobs || 0),
    failedCompanies: issues.filter((issue) => issue.level !== "INFO"),
    emptyCompanies: issues.filter((issue) => issue.level === "INFO"),
    titleFilter: {
      positive: parseArray(scan.title_positive_json),
      negative: parseArray(scan.title_negative_json),
    },
    locationFilter: scan.location_filter || "",
    maxResults: Number(scan.max_results || 50),
  };
}

function parseArray<T = unknown>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  if (!value) return [];
  try {
    const parsed = JSON.parse(String(value));
    return Array.isArray(parsed) ? parsed as T[] : [];
  } catch {
    return [];
  }
}

function normalizeRows(rows: AnyRow[]) {
  return rows.map((row) => {
    const out: AnyRow = {};
    for (const [key, value] of Object.entries(row)) out[key] = normalizeDate(value);
    return out;
  });
}

function normalizeDate(value: unknown) {
  return value instanceof Date ? value.toISOString() : value;
}
