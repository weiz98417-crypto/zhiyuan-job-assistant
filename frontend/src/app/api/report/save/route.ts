/* ── Report Save API (HITL confirmation) ── */

import { NextResponse } from "next/server";
import { upsertApp, upsertReport } from "@/lib/server-db";

interface SaveRequest {
  company: string;
  role: string;
  overallScore: number;
  archetype: string;
  legitimacy: string;
  blocks: Record<string, { content: string; score: number }>;
  jdText: string;
  keywords?: string[];
  actions: {
    saveJD: boolean;
    addToTracker: boolean;
  };
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "").slice(0, 40);
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as SaveRequest;
    const { company, role, overallScore, archetype, legitimacy, blocks, jdText, keywords = [], actions } = body;

    if (!company || !role) {
      return NextResponse.json({ success: false, error: "缺少公司名或岗位名" }, { status: 400 });
    }

    const date = new Date().toISOString().split("T")[0];
    const reportNum = Date.now() % 100000; // Simple sequential-ish number

    // Save report to SQLite
    upsertReport({
      report_num: reportNum,
      date,
      company, role,
      archetype: archetype || "",
      overall_score: overallScore,
      legitimacy: legitimacy || "",
      blocks_json: JSON.stringify(blocks),
      keywords_json: JSON.stringify(keywords),
    });

    // Add to tracker if requested
    if (actions.addToTracker) {
      upsertApp({
        num: reportNum,
        date,
        company, role,
        score: overallScore,
        status: "Evaluated",
        pdf_generated: 0,
        report_path: `reports/${String(reportNum).padStart(3, "0")}-${slugify(company)}-${date}.md`,
        notes: `Archetype: ${archetype}`,
      });
    }

    return NextResponse.json({
      success: true,
      data: { reportNum, jdSaved: actions.saveJD, trackerUpdated: actions.addToTracker },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "未知错误";
    return NextResponse.json({ success: false, error: `保存失败: ${message}` }, { status: 500 });
  }
}
