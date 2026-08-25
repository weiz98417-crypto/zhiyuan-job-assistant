import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import type { ExecutionPrincipal } from "@/lib/agent/runtime/durable-agent-run";
import { getDataRepositories } from "@/lib/data-repositories";
import { getDatabaseDriver, isPostgresConfigured, withPostgresClient } from "@/lib/postgres";
import type { AppRow, JDRow, ReportRow } from "@/lib/server-db";
import {
  addMemoryEvidence,
  createMemoryItem,
  indexMemorySourceBestEffort,
} from "@/lib/memory/postgres-memory";

type JsonLike = string | number | boolean | null | undefined | JsonLike[] | { [key: string]: JsonLike };

export interface PersistJDEvaluationInput {
  company: string;
  role: string;
  overallScore: number;
  date?: string;
  archetype?: string;
  legitimacy?: string;
  blocks?: unknown;
  keywords?: unknown;
  jdText?: string;
  forceReportNum?: number;
}

export interface PersistJDEvaluationResult {
  reportNum: number;
  jdId: number | null;
  reportReadBackVerified: boolean;
  jdReadBackVerified: boolean;
}

interface NormalizedPersistenceInput {
  userId: string;
  company: string;
  role: string;
  score: number;
  today: string;
  archetype: string;
  legitimacy: string;
  blocksJson: string;
  keywordsJson: string;
  jdText?: string;
  sourceHash: string;
  forceReportNum?: number;
}

export class PersistJDEvaluationVerificationError extends Error {
  constructor(
    message: string,
    public readonly details: Partial<PersistJDEvaluationResult> = {},
  ) {
    super(message);
    this.name = "PersistJDEvaluationVerificationError";
  }
}

export async function persistJDEvaluation(
  principal: ExecutionPrincipal,
  input: PersistJDEvaluationInput,
): Promise<PersistJDEvaluationResult> {
  if (!input.company.trim() || !input.role.trim()) throw new Error("缺少公司或岗位信息");
  const normalized: NormalizedPersistenceInput = {
    userId: principal.userId,
    company: input.company.trim(),
    role: input.role.trim(),
    score: Number.isFinite(input.overallScore) ? input.overallScore : 0,
    today: input.date || new Date().toISOString().slice(0, 10),
    archetype: input.archetype || "",
    legitimacy: input.legitimacy || "",
    blocksJson: canonicalJson(input.blocks, {}),
    keywordsJson: canonicalJson(input.keywords, []),
    jdText: input.jdText,
    sourceHash: hashSource(input.jdText),
    forceReportNum: input.forceReportNum,
  };
  const result = await (getDatabaseDriver() === "postgres"
    ? persistPostgres(normalized)
    : persistRepository(normalized));
  await recordEvaluationMemoryBestEffort(normalized, result);
  return result;
}

async function recordEvaluationMemoryBestEffort(
  input: NormalizedPersistenceInput,
  result: PersistJDEvaluationResult,
): Promise<void> {
  if (getDatabaseDriver() !== "postgres" || !isPostgresConfigured()) return;
  try {
    if (input.jdText && input.jdText.trim().length >= 50) {
      await indexMemorySourceBestEffort({
        userId: input.userId,
        sourceType: "jd",
        sourceId: result.jdId || result.reportNum,
        title: `${input.company} ${input.role}`,
        text: input.jdText,
        metadata: { reportNum: result.reportNum, company: input.company, role: input.role, source: "jd-evaluation-persistence" },
      });
    }
    const reportText = [
      `${input.company} ${input.role}`,
      `overallScore=${input.score}`,
      input.blocksJson,
    ].filter(Boolean).join("\n");
    await indexMemorySourceBestEffort({
      userId: input.userId,
      sourceType: "jd_report",
      sourceId: result.reportNum,
      title: `${input.company} ${input.role} report ${result.reportNum}`,
      text: reportText,
      metadata: { reportNum: result.reportNum, company: input.company, role: input.role, source: "jd-evaluation-persistence" },
    });
    const memoryItemId = await createMemoryItem({
      userId: input.userId,
      memoryType: "jd_evaluation_observation",
      canonicalText: `${input.company} ${input.role} JD evaluation completed with score ${input.score}/5; report #${result.reportNum}.`,
      status: "candidate",
      confidence: 0.65,
      importance: input.score < 2.5 ? 0.75 : 0.55,
      sourceCount: 1,
      metadata: { reportNum: result.reportNum, company: input.company, role: input.role, score: input.score },
    });
    await addMemoryEvidence({
      userId: input.userId,
      memoryItemId,
      sourceType: "jd_report",
      sourceId: result.reportNum,
      quote: reportText.slice(0, 800),
      extractionMethod: "jd_evaluation_writeback",
      confidence: 0.65,
      metadata: { reportNum: result.reportNum, company: input.company, role: input.role, score: input.score },
    });
  } catch (error) {
    console.warn("[jd-evaluation-persistence] memory index/writeback failed:", error);
  }
}

async function persistRepository(input: NormalizedPersistenceInput): Promise<PersistJDEvaluationResult> {
  const repositories = getDataRepositories();
  const [applications, reports] = await Promise.all([
    repositories.applications.list({}, input.userId),
    repositories.reports.list(input.userId),
  ]);
  const applicationNum = applications.reduce((max, row) => Math.max(max, Number(row.num || 0)), 0) + 1;
  const duplicateReport = input.sourceHash
    ? reports
        .filter((row) => (row.source_hash || "") === input.sourceHash)
        .sort((left, right) => String(right.created_at || "").localeCompare(String(left.created_at || "")))[0]
    : undefined;
  const maxReportNum = reports.reduce((max, row) => Math.max(max, Number(row.report_num || 0)), 0);
  const reportNum = duplicateReport && isRecentDuplicate(duplicateReport.created_at)
    ? Number(duplicateReport.report_num)
    : input.forceReportNum && input.forceReportNum > 0 ? input.forceReportNum : maxReportNum + 1;
  const rows = buildRows(input, applicationNum, reportNum);

  await repositories.applications.upsert(rows.application, input.userId);
  await repositories.reports.upsert(rows.report, input.userId);
  const reportReadBack = await repositories.reports.get(reportNum, input.userId);
  assertReportReadBack(reportReadBack, rows.report, reportNum);

  let jdId: number | null = null;
  if (rows.jd) {
    jdId = await repositories.jds.insert(rows.jd, input.userId);
    const jdReadBack = await repositories.jds.get(jdId, input.userId);
    assertJdReadBack(jdReadBack, rows.jd, reportNum, jdId);
  }
  return {
    reportNum,
    jdId,
    reportReadBackVerified: true,
    jdReadBackVerified: true,
  };
}

async function persistPostgres(input: NormalizedPersistenceInput): Promise<PersistJDEvaluationResult> {
  return withPostgresClient(async (client) => {
    await client.query("BEGIN");
    try {
      const result = await persistPostgresTransaction(client, input);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  });
}

async function persistPostgresTransaction(
  client: PoolClient,
  input: NormalizedPersistenceInput,
): Promise<PersistJDEvaluationResult> {
  const applicationMax = await client.query(
    "SELECT COALESCE(MAX(num), 0) AS max FROM applications WHERE user_id = $1",
    [input.userId],
  );
  const applicationNum = Number(applicationMax.rows[0]?.max || 0) + 1;
  const duplicateReport = input.sourceHash
    ? (await client.query(
        "SELECT * FROM reports WHERE source_hash = $1 AND user_id = $2 ORDER BY created_at DESC LIMIT 1",
        [input.sourceHash, input.userId],
      )).rows[0] as ReportRow | undefined
    : undefined;
  const reportMax = await client.query(
    "SELECT COALESCE(MAX(report_num), 0) AS max FROM reports WHERE user_id = $1",
    [input.userId],
  );
  const reportNum = duplicateReport && isRecentDuplicate(duplicateReport.created_at)
    ? Number(duplicateReport.report_num)
    : input.forceReportNum && input.forceReportNum > 0
      ? input.forceReportNum
      : Number(reportMax.rows[0]?.max || 0) + 1;
  const rows = buildRows(input, applicationNum, reportNum);

  await client.query(`
    INSERT INTO applications (user_id, num, date, company, role, score, status, pdf_generated, report_path, notes, updated_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,now())
    ON CONFLICT (user_id, company, role) DO UPDATE SET
      score=EXCLUDED.score, status=EXCLUDED.status, report_path=EXCLUDED.report_path,
      notes=EXCLUDED.notes, updated_at=now()
  `, [
    input.userId,
    rows.application.num,
    rows.application.date,
    rows.application.company,
    rows.application.role,
    rows.application.score,
    rows.application.status,
    rows.application.pdf_generated,
    rows.application.report_path,
    rows.application.notes,
  ]);
  await client.query(`
    INSERT INTO reports (user_id, report_num, date, company, role, archetype, overall_score, legitimacy, blocks_json, keywords_json, source_hash)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11)
    ON CONFLICT (user_id, report_num) DO UPDATE SET
      date=EXCLUDED.date, company=EXCLUDED.company, role=EXCLUDED.role, archetype=EXCLUDED.archetype,
      overall_score=EXCLUDED.overall_score, legitimacy=EXCLUDED.legitimacy,
      blocks_json=EXCLUDED.blocks_json, keywords_json=EXCLUDED.keywords_json,
      source_hash=EXCLUDED.source_hash
  `, [
    input.userId,
    rows.report.report_num,
    rows.report.date,
    rows.report.company,
    rows.report.role,
    rows.report.archetype,
    rows.report.overall_score,
    rows.report.legitimacy,
    rows.report.blocks_json,
    rows.report.keywords_json,
    rows.report.source_hash || "",
  ]);
  const reportReadBack = (await client.query(
    "SELECT * FROM reports WHERE report_num = $1 AND user_id = $2",
    [reportNum, input.userId],
  )).rows[0] as ReportRow | undefined;
  assertReportReadBack(reportReadBack, rows.report, reportNum, true);

  let jdId: number | null = null;
  if (rows.jd) {
    const inserted = await client.query(`
      INSERT INTO jds (user_id, company, role, source_type, source_url, body, keywords_json, report_id)
      VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8)
      RETURNING id
    `, [
      input.userId,
      rows.jd.company,
      rows.jd.role,
      rows.jd.source_type,
      rows.jd.source_url || "",
      rows.jd.body,
      rows.jd.keywords_json,
      rows.jd.report_id ?? null,
    ]);
    jdId = Number(inserted.rows[0]?.id);
    const jdReadBack = (await client.query(
      "SELECT * FROM jds WHERE id = $1 AND user_id = $2",
      [jdId, input.userId],
    )).rows[0] as JDRow | undefined;
    assertJdReadBack(jdReadBack, rows.jd, reportNum, jdId, true);
  }
  return {
    reportNum,
    jdId,
    reportReadBackVerified: true,
    jdReadBackVerified: true,
  };
}

function buildRows(
  input: NormalizedPersistenceInput,
  applicationNum: number,
  reportNum: number,
): { application: AppRow; report: ReportRow; jd: JDRow | null } {
  return {
    application: {
      num: applicationNum,
      company: input.company,
      role: input.role,
      score: input.score,
      status: "Evaluated",
      date: input.today,
      pdf_generated: 0,
      report_path: "",
      notes: "",
    },
    report: {
      report_num: reportNum,
      date: input.today,
      company: input.company,
      role: input.role,
      archetype: input.archetype,
      overall_score: input.score,
      legitimacy: input.legitimacy,
      blocks_json: input.blocksJson,
      keywords_json: input.keywordsJson,
      source_hash: input.sourceHash,
    },
    jd: input.jdText && input.jdText.trim().length >= 50
      ? {
          company: input.company,
          role: input.role,
          source_type: "agent",
          source_url: "",
          body: input.jdText,
          keywords_json: input.keywordsJson,
          report_id: reportNum,
        }
      : null,
  };
}

function assertReportReadBack(
  row: ReportRow | undefined,
  expected: ReportRow,
  reportNum: number,
  rolledBack = false,
): void {
  const matches = row
    && Number(row.report_num) === Number(expected.report_num)
    && row.date === expected.date
    && row.company === expected.company
    && row.role === expected.role
    && (row.archetype || "") === (expected.archetype || "")
    && Number(row.overall_score || 0) === Number(expected.overall_score || 0)
    && (row.legitimacy || "") === (expected.legitimacy || "")
    && canonicalJson(row.blocks_json, {}) === canonicalJson(expected.blocks_json, {})
    && canonicalJson(row.keywords_json, []) === canonicalJson(expected.keywords_json, [])
    && (row.source_hash || "") === (expected.source_hash || "");
  if (!matches) {
    throw new PersistJDEvaluationVerificationError(
      `评估报告持久化后读回校验失败${rolledBack ? "，已回滚本次写入" : ""}`,
      { reportNum, jdId: null, reportReadBackVerified: false, jdReadBackVerified: false },
    );
  }
}

function assertJdReadBack(
  row: JDRow | undefined,
  expected: JDRow,
  reportNum: number,
  jdId: number,
  rolledBack = false,
): void {
  const matches = row
    && row.company === expected.company
    && row.role === expected.role
    && row.body === expected.body
    && canonicalJson(row.keywords_json, []) === canonicalJson(expected.keywords_json, [])
    && Number(row.report_id || 0) === Number(expected.report_id || 0);
  if (!matches) {
    throw new PersistJDEvaluationVerificationError(
      `JD 持久化后读回校验失败${rolledBack ? "，已回滚本次写入" : ""}`,
      { reportNum, jdId, reportReadBackVerified: true, jdReadBackVerified: false },
    );
  }
}

function hashSource(text?: string): string {
  const normalized = (text || "").replace(/\s+/g, " ").trim();
  return normalized.length >= 50
    ? createHash("sha256").update(normalized).digest("hex")
    : "";
}

function isRecentDuplicate(createdAt?: unknown): boolean {
  const raw = createdAt instanceof Date ? createdAt.toISOString() : String(createdAt || "");
  if (!raw) return false;
  const timestamp = new Date(raw.includes("T") ? raw : `${raw.replace(" ", "T")}Z`).getTime();
  return Number.isFinite(timestamp) && Date.now() - timestamp < 15 * 60_000;
}

function canonicalJson(value: unknown, fallback: JsonLike): string {
  return JSON.stringify(sortJson(parseJson(value, fallback)));
}

function parseJson(value: unknown, fallback: JsonLike): JsonLike {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as JsonLike;
    } catch {
      return value;
    }
  }
  if (Array.isArray(value) || typeof value === "object" || typeof value === "number" || typeof value === "boolean") {
    return value as JsonLike;
  }
  return fallback;
}

function sortJson(value: JsonLike): JsonLike {
  if (Array.isArray(value)) return value.map(sortJson);
  if (value && typeof value === "object") {
    return Object.keys(value).sort().reduce<Record<string, JsonLike>>((result, key) => {
      result[key] = sortJson((value as Record<string, JsonLike>)[key]);
      return result;
    }, {});
  }
  return value;
}
