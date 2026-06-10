import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getDataRepositories } from "@/lib/data-repositories";

export async function GET() {
  try {
    let user;
    try { user = await getCurrentUser(); } catch { return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 }); }

    const apps = await getDataRepositories().applications.list({ limit: 200 }, user.userId);
    const recent = apps
      .filter((app) => !["SKIP", "Discarded"].includes(String(app.status || "")))
      .slice(0, 5) as { company: string; role: string; score: number; status: string; date: string; notes: string }[];
    const pipeline = Array.from(
      apps.reduce((map, app) => {
        const status = String(app.status || "");
        map.set(status, (map.get(status) || 0) + 1);
        return map;
      }, new Map<string, number>()),
    ).map(([status, cnt]) => ({ status, cnt }));

    const parts: string[] = [];
    parts.push("[Claude Agent 最近活动]");

    if (recent.length > 0) {
      parts.push("最近评估:");
      for (const r of recent) {
        const riskHint = r.notes?.includes("高风险") ? "🔴" : r.notes?.includes("中风险") ? "🟡" : "🟢";
        parts.push(`• ${r.company} | ${r.role} | ${r.score}/5 ${riskHint} | ${r.date}`);
      }
    } else {
      parts.push("暂无评估记录");
    }

    const pending = pipeline.filter((p) => ["Evaluated"].includes(p.status)).reduce((s, p) => s + p.cnt, 0);
    const processed = pipeline.filter((p) => ["Applied", "Responded", "Interview", "Offer", "Rejected"].includes(p.status)).reduce((s, p) => s + p.cnt, 0);

    const pipeSummary: string[] = [];
    if (pending > 0) pipeSummary.push(`${pending}条待投递`);
    if (processed > 0) pipeSummary.push(`${processed}条进行中`);
    if (pipeSummary.length > 0) {
      parts.push(`管道状态: ${pipeSummary.join(" | ")}`);
    }

    return NextResponse.json({ activity: parts.join("\n") });
  } catch {
    return NextResponse.json({ activity: "" });
  }
}
