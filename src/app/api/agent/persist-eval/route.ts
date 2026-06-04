import { NextResponse } from "next/server";
import crypto from "crypto";
import { getCurrentUser } from "@/lib/auth";
import { getDataRepositories } from "@/lib/data-repositories";
import type { AppRow, ReportRow } from "@/lib/server-db";

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
    const user = await getCurrentUser();
    const repos = getDataRepositories();
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
    const allApps = await repos.applications.list({}, user.userId);
    const maxAppNum = allApps.reduce((max, a) => Math.max(max, a.num), 0);
    const appNum = maxAppNum + 1;

    // 2. Upsert application record
    const appRow: AppRow = {
      num: appNum, company, role, score, status: "Evaluated",
      date: today, pdf_generated: 0, report_path: "", notes: "",
    };
    await repos.applications.upsert(appRow, user.userId);

    // 3. Generate report number — use pre-allocated value from stream if available
    const allReports = await repos.reports.list(user.userId);
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
    await repos.reports.upsert(reportRow, user.userId);

    // 4. Save JD to JD library
    if (jdText && jdText.trim().length >= 50) {
      try {
        await repos.jds.insert({
          company,
          role,
          source_type: "agent",
          source_url: "",
          body: jdText,
          keywords_json: keywords ? JSON.stringify(keywords) : "[]",
          report_id: reportNum,
        }, user.userId);
      } catch (e) {
        console.warn("[persist-eval] JD save failed:", e);
      }
    }

    return NextResponse.json({ success: true, reportNum });
  } catch (err) {
    if (err instanceof Error && (err.message === "Not authenticated" || err.message === "Invalid or expired token")) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }
    console.error("[persist-eval] error:", err);
    return NextResponse.json(
      { success: false, error: `持久化失败: ${err instanceof Error ? err.message : "未知错误"}` },
      { status: 500 },
    );
  }
}
