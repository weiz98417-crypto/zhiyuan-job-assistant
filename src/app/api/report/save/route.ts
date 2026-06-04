/* ── Report Save API (HITL confirmation) ── */

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getDataRepositories } from "@/lib/data-repositories";

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
    const user = await getCurrentUser();
    const repos = getDataRepositories();
    const { company, role, overallScore, archetype, legitimacy, blocks, jdText, keywords = [], actions } = body;

    if (!company || !role) {
      return NextResponse.json({ success: false, error: "缺少公司名或岗位名" }, { status: 400 });
    }

    const date = new Date().toISOString().split("T")[0];
    const reportNum = Date.now() % 100000; // Simple sequential-ish number

    await repos.reports.upsert({
      report_num: reportNum,
      date,
      company, role,
      archetype: archetype || "",
      overall_score: overallScore,
      legitimacy: legitimacy || "",
      blocks_json: JSON.stringify(blocks),
      keywords_json: JSON.stringify(keywords),
    }, user.userId);

    // Add to tracker if requested
    if (actions.addToTracker) {
      await repos.applications.upsert({
        num: reportNum,
        date,
        company, role,
        score: overallScore,
        status: "Evaluated",
        pdf_generated: 0,
        report_path: `reports/${String(reportNum).padStart(3, "0")}-${slugify(company)}-${date}.md`,
        notes: `Archetype: ${archetype}`,
      }, user.userId);
    }

    if (actions.saveJD && jdText && jdText.trim().length >= 50) {
      await repos.jds.insert({
        company,
        role,
        source_type: "agent",
        source_url: "",
        body: jdText,
        keywords_json: JSON.stringify(keywords),
        report_id: reportNum,
      }, user.userId);
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
