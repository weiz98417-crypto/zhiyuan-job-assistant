import { NextResponse } from "next/server";
import crypto from "crypto";
import { listApps, upsertApp, listReports, upsertReport, insertJD, type AppRow, type ReportRow } from "@/lib/server-db";

function hashSource(text?: string): string {
  const normalized = (text || "").replace(/\s+/g, " ").trim();
  if (normalized.length < 50) return "";
  return crypto.createHash("sha256").update(normalized).digest("hex");
}

function isRecentDuplicate(createdAt?: unknown): boolean {
  if (typeof createdAt !== "string") return false;
  const created = new Date(createdAt.replace(" ", "T") + "Z").getTime();
  if (!Number.isFinite(created)) return false;
  return Date.now() - created < 15 * 60 * 1000;
}

export async function POST(request: Request) {
  try {
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
      return NextResponse.json(
        { success: false, error: "缺少公司或岗位信息" },
        { status: 400 },
      );
    }

    const today = date || new Date().toISOString().slice(0, 10);
    const score = overallScore || 0;
    const sourceHash = hashSource(jdText);

    // 1. Compute application number (num = max existing + 1)
    const allApps = listApps();
    const maxAppNum = allApps.reduce((max, a) => Math.max(max, a.num), 0);
    const appNum = maxAppNum + 1;

    // 2. Upsert application record
    const appRow: AppRow = {
      num: appNum, company, role, score, status: "Evaluated",
      date: today, pdf_generated: 0, report_path: "", notes: "",
    };
    upsertApp(appRow);

    // 3. Generate report number — use pre-allocated value from stream if available
    const allReports = listReports();
    const duplicateReport = sourceHash
      ? allReports.find((r) => r.source_hash === sourceHash && isRecentDuplicate(r.created_at))
      : undefined;
    const reportNum = duplicateReport?.report_num
      || (typeof forceReportNum === "number" && forceReportNum > 0
        ? forceReportNum
        : (() => {
            const maxReportNum = allReports.reduce((max, r) => Math.max(max, r.report_num), 0);
            return maxReportNum + 1;
          })());

    const reportRow: ReportRow = {
      report_num: reportNum,
      date: today,
      company,
      role,
      archetype: archetype || "",
      overall_score: score,
      legitimacy: legitimacy || "",
      blocks_json: blocks ? JSON.stringify(blocks) : "{}",
      keywords_json: keywords ? JSON.stringify(keywords) : "[]",
      source_hash: sourceHash,
    };
    upsertReport(reportRow);

    // 4. Save JD to JD library
    if (jdText && jdText.trim().length >= 50) {
      try {
        insertJD({
          company,
          role,
          source_type: "agent",
          source_url: "",
          body: jdText,
          keywords_json: keywords ? JSON.stringify(keywords) : "[]",
          report_id: reportNum,
        });
      } catch (e) {
        console.warn("[persist-eval] JD save failed:", e);
      }
    }

    return NextResponse.json({ success: true, reportNum });
  } catch (err) {
    console.error("[persist-eval] error:", err);
    return NextResponse.json(
      { success: false, error: `持久化失败: ${err instanceof Error ? err.message : "未知错误"}` },
      { status: 500 },
    );
  }
}
