import { NextResponse } from "next/server";
import crypto from "crypto";
import { getCurrentUser } from "@/lib/auth";
import { getDataRepositories } from "@/lib/data-repositories";
import { getDatabaseDriver, isPostgresConfigured } from "@/lib/postgres";
import { createMemoryItem, addMemoryEvidence, indexMemorySourceBestEffort } from "@/lib/memory/postgres-memory";
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
    let jdId: number | null = null;
    if (jdText && jdText.trim().length >= 50) {
      try {
        jdId = await repos.jds.insert({
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
          blocks ? JSON.stringify(blocks) : "",
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
