import { NextResponse } from "next/server";
import crypto from "crypto";
import type { PoolClient } from "pg";
import { getCurrentUser } from "@/lib/auth";
import { getDataRepositories } from "@/lib/data-repositories";
import { getDatabaseDriver, isPostgresConfigured, withPostgresClient } from "@/lib/postgres";
import { createMemoryItem, addMemoryEvidence, indexMemorySourceBestEffort } from "@/lib/memory/postgres-memory";
import type { AppRow, JDRow, ReportRow } from "@/lib/server-db";

type JsonLike = string | number | boolean | null | undefined | JsonLike[] | { [key: string]: JsonLike };

interface PersistEvalInput {
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

interface PersistEvalResult {
  reportNum: number;
  jdId: number | null;
  reportReadBackVerified: boolean;
  jdReadBackVerified: boolean;
}

class PersistEvalVerificationError extends Error {
  constructor(
    message: string,
    public readonly details: Partial<PersistEvalResult> = {},
  ) {
    super(message);
    this.name = "PersistEvalVerificationError";
  }
}

function hashSource(text?: string): string {
  const normalized = (text || "").replace(/\s+/g, " ").trim();
  if (normalized.length < 50) return "";
  return crypto.createHash("sha256").update(normalized).digest("hex");
}

function isRecentDuplicate(createdAt?: unknown): boolean {
  const createdAtText = createdAt instanceof Date ? createdAt.toISOString() : String(createdAt || "");
  if (!createdAtText) return false;
  const normalized = createdAtText.includes("T") ? createdAtText : `${createdAtText.replace(" ", "T")}Z`;
  const created = new Date(normalized).getTime();
  if (!Number.isFinite(created)) return false;
  return Date.now() - created < 15 * 60 * 1000;
}

function parseJsonLike(value: unknown, fallback: JsonLike): JsonLike {
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
    return Object.keys(value)
      .sort()
      .reduce<Record<string, JsonLike>>((acc, key) => {
        acc[key] = sortJson((value as Record<string, JsonLike>)[key]);
        return acc;
      }, {});
  }
  return value;
}

function canonicalJson(value: unknown, fallback: JsonLike = {}): string {
  return JSON.stringify(sortJson(parseJsonLike(value, fallback)));
}

function jdReadBackMatches(row: JDRow | undefined, expected: Pick<JDRow, "company" | "role" | "body" | "keywords_json" | "report_id">): boolean {
  if (!row) return false;
  return (
    row.company === expected.company &&
    row.role === expected.role &&
    row.body === expected.body &&
    canonicalJson(row.keywords_json, []) === canonicalJson(expected.keywords_json, []) &&
    Number(row.report_id || 0) === Number(expected.report_id || 0)
  );
}

function reportReadBackMatches(row: ReportRow | undefined, expected: ReportRow): boolean {
  if (!row) return false;
  return (
    Number(row.report_num) === Number(expected.report_num) &&
    row.date === expected.date &&
    row.company === expected.company &&
    row.role === expected.role &&
    (row.archetype || "") === (expected.archetype || "") &&
    Number(row.overall_score || 0) === Number(expected.overall_score || 0) &&
    (row.legitimacy || "") === (expected.legitimacy || "") &&
    canonicalJson(row.blocks_json, {}) === canonicalJson(expected.blocks_json, {}) &&
    canonicalJson(row.keywords_json, []) === canonicalJson(expected.keywords_json, []) &&
    (row.source_hash || "") === (expected.source_hash || "")
  );
}

function buildRows(input: PersistEvalInput, appNum: number, reportNum: number): { appRow: AppRow; reportRow: ReportRow; jdRow: JDRow | null } {
  return {
    appRow: {
      num: appNum,
      company: input.company,
      role: input.role,
      score: input.score,
      status: "Evaluated",
      date: input.today,
      pdf_generated: 0,
      report_path: "",
      notes: "",
    },
    reportRow: {
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
    jdRow: input.jdText && input.jdText.trim().length >= 50
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

async function persistEvaluationAtomic(input: PersistEvalInput): Promise<PersistEvalResult> {
  return getDatabaseDriver() === "postgres"
    ? persistEvaluationPostgres(input)
    : persistEvaluationSqlite(input);
}

async function persistEvaluationSqlite(input: PersistEvalInput): Promise<PersistEvalResult> {
  const repos = getDataRepositories();
  const [appRows, reportRows] = await Promise.all([
    repos.applications.list({}, input.userId),
    repos.reports.list(input.userId),
  ]);
  const appNum = appRows.reduce((max, row) => Math.max(max, Number(row.num || 0)), 0) + 1;
  const duplicateReport = input.sourceHash
    ? reportRows
        .filter((row) => (row.source_hash || "") === input.sourceHash)
        .sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")))[0]
    : undefined;
  const maxReportNum = reportRows.reduce((max, row) => Math.max(max, Number(row.report_num || 0)), 0);
  const reportNum = duplicateReport && isRecentDuplicate(duplicateReport.created_at)
    ? Number(duplicateReport.report_num)
    : (typeof input.forceReportNum === "number" && input.forceReportNum > 0 ? input.forceReportNum : maxReportNum + 1);
  const { appRow, reportRow, jdRow } = buildRows(input, appNum, reportNum);

  await repos.applications.upsert(appRow, input.userId);
  await repos.reports.upsert(reportRow, input.userId);

  const reportReadBack = await repos.reports.get(reportNum, input.userId);
  if (!reportReadBackMatches(reportReadBack, reportRow)) {
    throw new PersistEvalVerificationError("评估报告持久化后读回校验失败", {
      reportNum,
      jdId: null,
      reportReadBackVerified: false,
      jdReadBackVerified: false,
    });
  }

  let jdId: number | null = null;
  let jdReadBackVerified = true;
  if (jdRow) {
    jdId = await repos.jds.insert(jdRow, input.userId);
    const readBack = await repos.jds.get(jdId, input.userId);
    jdReadBackVerified = jdReadBackMatches(readBack, jdRow);
    if (!jdReadBackVerified) {
      throw new PersistEvalVerificationError("JD 持久化后读回校验失败", {
        reportNum,
        jdId,
        reportReadBackVerified: true,
        jdReadBackVerified: false,
      });
    }
  }

  return { reportNum, jdId, reportReadBackVerified: true, jdReadBackVerified };
}

async function persistEvaluationPostgres(input: PersistEvalInput): Promise<PersistEvalResult> {
  return withPostgresClient(async (client) => {
    await client.query("BEGIN");
    try {
      const result = await persistEvaluationPostgresInTransaction(client, input);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  });
}

async function persistEvaluationPostgresInTransaction(client: PoolClient, input: PersistEvalInput): Promise<PersistEvalResult> {
  const appMax = await client.query("SELECT COALESCE(MAX(num), 0) AS max FROM applications WHERE user_id = $1", [input.userId]);
  const appNum = Number(appMax.rows[0]?.max || 0) + 1;
  const duplicateReport = input.sourceHash
    ? (await client.query(
        "SELECT * FROM reports WHERE source_hash = $1 AND user_id = $2 ORDER BY created_at DESC LIMIT 1",
        [input.sourceHash, input.userId],
      )).rows[0] as ReportRow | undefined
    : undefined;
  const reportMax = await client.query("SELECT COALESCE(MAX(report_num), 0) AS max FROM reports WHERE user_id = $1", [input.userId]);
  const reportNum = duplicateReport && isRecentDuplicate(duplicateReport.created_at)
    ? Number(duplicateReport.report_num)
    : (typeof input.forceReportNum === "number" && input.forceReportNum > 0 ? input.forceReportNum : Number(reportMax.rows[0]?.max || 0) + 1);
  const { appRow, reportRow, jdRow } = buildRows(input, appNum, reportNum);

  await client.query(`
    INSERT INTO applications (user_id, num, date, company, role, score, status, pdf_generated, report_path, notes, updated_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,now())
    ON CONFLICT (user_id, company, role) DO UPDATE SET
      score=EXCLUDED.score, status=EXCLUDED.status, report_path=EXCLUDED.report_path,
      notes=EXCLUDED.notes, updated_at=now()
  `, [input.userId, appRow.num, appRow.date, appRow.company, appRow.role, appRow.score, appRow.status, appRow.pdf_generated, appRow.report_path, appRow.notes]);

  await client.query(`
    INSERT INTO reports (user_id, report_num, date, company, role, archetype, overall_score, legitimacy, blocks_json, keywords_json, source_hash)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11)
    ON CONFLICT (user_id, report_num) DO UPDATE SET
      date=EXCLUDED.date, company=EXCLUDED.company, role=EXCLUDED.role, archetype=EXCLUDED.archetype,
      overall_score=EXCLUDED.overall_score, legitimacy=EXCLUDED.legitimacy,
      blocks_json=EXCLUDED.blocks_json, keywords_json=EXCLUDED.keywords_json,
      source_hash=EXCLUDED.source_hash
  `, [input.userId, reportRow.report_num, reportRow.date, reportRow.company, reportRow.role, reportRow.archetype, reportRow.overall_score, reportRow.legitimacy, reportRow.blocks_json, reportRow.keywords_json, reportRow.source_hash || ""]);

  const reportReadBack = (await client.query("SELECT * FROM reports WHERE report_num = $1 AND user_id = $2", [reportNum, input.userId])).rows[0] as ReportRow | undefined;
  if (!reportReadBackMatches(reportReadBack, reportRow)) {
    throw new PersistEvalVerificationError("评估报告持久化后读回校验失败，已回滚本次写入", {
      reportNum,
      jdId: null,
      reportReadBackVerified: false,
      jdReadBackVerified: false,
    });
  }

  let jdId: number | null = null;
  let jdReadBackVerified = true;
  if (jdRow) {
    const inserted = await client.query(`
      INSERT INTO jds (user_id, company, role, source_type, source_url, body, keywords_json, report_id)
      VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8)
      RETURNING id
    `, [input.userId, jdRow.company, jdRow.role, jdRow.source_type, jdRow.source_url || "", jdRow.body, jdRow.keywords_json, jdRow.report_id ?? null]);
    jdId = Number(inserted.rows[0].id);
    const readBack = (await client.query("SELECT * FROM jds WHERE id = $1 AND user_id = $2", [jdId, input.userId])).rows[0] as JDRow | undefined;
    jdReadBackVerified = jdReadBackMatches(readBack, jdRow);
    if (!jdReadBackVerified) {
      throw new PersistEvalVerificationError("JD 持久化后读回校验失败，已回滚本次写入", {
        reportNum,
        jdId,
        reportReadBackVerified: true,
        jdReadBackVerified: false,
      });
    }
  }

  return { reportNum, jdId, reportReadBackVerified: true, jdReadBackVerified };
}

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    const body = await request.json() as {
      company?: string;
      role?: string;
      overallScore?: number;
      archetype?: string;
      blocks?: Record<string, { content: string; score: number }>;
      keywords?: string[];
      legitimacy?: string;
      date?: string;
      jdText?: string;
      reportNum?: number;
    };

    const { company, role, overallScore, archetype, blocks, keywords, legitimacy, date, jdText, reportNum: forceReportNum } = body;

    if (!company || !role) {
      return NextResponse.json({ success: false, error: "缺少公司或岗位信息" }, { status: 400 });
    }

    const today = date || new Date().toISOString().slice(0, 10);
    const score = overallScore || 0;
    const sourceHash = hashSource(jdText);
    const blocksJson = blocks ? JSON.stringify(blocks) : "{}";
    const keywordsJson = keywords ? JSON.stringify(keywords) : "[]";

    const { reportNum, jdId, reportReadBackVerified, jdReadBackVerified } = await persistEvaluationAtomic({
      userId: user.userId,
      company,
      role,
      score,
      today,
      archetype: archetype || "",
      legitimacy: legitimacy || "",
      blocksJson,
      keywordsJson,
      jdText,
      sourceHash,
      forceReportNum,
    });

    if (getDatabaseDriver() === "postgres" && isPostgresConfigured()) {
      try {
        if (jdText && jdText.trim().length >= 50) {
          await indexMemorySourceBestEffort({
            userId: user.userId,
            sourceType: "jd",
            sourceId: jdId || reportNum,
            title: `${company} ${role}`,
            text: jdText,
            metadata: { reportNum, company, role, source: "persist-eval" },
          });
        }
        const reportText = [
          `${company} ${role}`,
          `overallScore=${score}`,
          blocksJson,
        ].filter(Boolean).join("\n");
        await indexMemorySourceBestEffort({
          userId: user.userId,
          sourceType: "jd_report",
          sourceId: reportNum,
          title: `${company} ${role} report ${reportNum}`,
          text: reportText,
          metadata: { reportNum, company, role, source: "persist-eval" },
        });
        const itemId = await createMemoryItem({
          userId: user.userId,
          memoryType: "jd_evaluation_observation",
          canonicalText: `${company} ${role} JD evaluation completed with score ${score}/5; report #${reportNum}.`,
          status: "candidate",
          confidence: 0.65,
          importance: score < 2.5 ? 0.75 : 0.55,
          sourceCount: 1,
          metadata: { reportNum, company, role, score },
        });
        await addMemoryEvidence({
          userId: user.userId,
          memoryItemId: itemId,
          sourceType: "jd_report",
          sourceId: reportNum,
          quote: reportText.slice(0, 800),
          extractionMethod: "jd_evaluation_writeback",
          confidence: 0.65,
          metadata: { reportNum, company, role, score },
        });
      } catch (error) {
        console.warn("[persist-eval] memory index/writeback failed:", error);
      }
    }

    return NextResponse.json({ success: true, reportNum, jdId, reportReadBackVerified, jdReadBackVerified });
  } catch (err) {
    if (err instanceof Error && (err.message === "Not authenticated" || err.message === "Invalid or expired token")) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }
    if (err instanceof PersistEvalVerificationError) {
      return NextResponse.json({
        success: false,
        error: err.message,
        ...err.details,
      }, { status: 500 });
    }
    console.error("[persist-eval] error:", err);
    return NextResponse.json(
      { success: false, error: `持久化失败: ${err instanceof Error ? err.message : "未知错误"}` },
      { status: 500 },
    );
  }
}
