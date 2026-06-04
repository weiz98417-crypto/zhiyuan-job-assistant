import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getDataRepositories } from "@/lib/data-repositories";
import type { AppRow, ReportRow } from "@/lib/server-db";

export async function POST(request: Request) {
  try {
    let user;
    try { user = await getCurrentUser(); } catch { return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 }); }

    const { jd_text, jd_url } = await request.json() as { jd_text?: string; jd_url?: string };
    let jdText = jd_text || "";

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const sse = (data: Record<string, unknown>) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        };

        try {
          // Phase 1: Fetch JD if URL
          if (jd_url && !jdText) {
            sse({ type: "phase", phase: "fetching" });
            const fetchRes = await fetch(`${request.headers.get("origin") || "http://localhost:3000"}/api/agent/fetch-jd`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ url: jd_url }),
            });
            if (fetchRes.ok) {
              const json = await fetchRes.json();
              jdText = json.data?.text || "";
            }
          }

          if (!jdText || jdText.trim().length < 50) {
            sse({ type: "error", error: "JD 文本不足 50 字符" });
            sse({ type: "done" });
            return;
          }

          const baseUrl = request.headers.get("origin") || "http://localhost:3000";

          // Phase 2: Risk scan
          sse({ type: "phase", phase: "scanning_risks" });
          let risks: Array<{ signal: string; excerpt: string; severity: string }> = [];
          try {
            const risksRes = await fetch(`${baseUrl}/api/agent/scan-risks`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ jd_text: jdText }),
            });
            if (risksRes.ok) {
              const json = await risksRes.json();
              risks = json.data || [];
            }
          } catch { /* non-blocking */ }

          sse({ type: "risks_done", risks });

          // Phase 3: A-G Evaluation
          sse({ type: "phase", phase: "evaluating" });
          const evalRes = await fetch(`${baseUrl}/api/evaluate`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ jdText, language: "zh" }),
          });

          if (!evalRes.ok) {
            sse({ type: "error", error: `评估失败: ${evalRes.status}` });
            sse({ type: "done" });
            return;
          }

          const evalJson = await evalRes.json();
          if (!evalJson.success) {
            sse({ type: "error", error: evalJson.error || "评估失败" });
            sse({ type: "done" });
            return;
          }

          const { company, role, overallScore, archetype, blocks } = evalJson.data;

          // Emit per-block progress (blocks are generated in one shot, but we show completion sequentially)
          const blockLabels: Record<string, string> = { a: "A·概览", b: "B·匹配", c: "C·职级", d: "D·薪资", e: "E·定制", f: "F·面试", g: "G·合法" };
          for (const bk of ["a","b","c","d","e","f","g"]) {
            if (blocks[bk]) {
              sse({ type: "block_start", block: bk, label: blockLabels[bk] || bk });
              // Small delay so the status bar visibly updates
              await new Promise(r => setTimeout(r, 200));
            }
          }

          // Phase 4: Persist to both applications and reports tables
          sse({ type: "phase", phase: "persisting" });
          let reportNum = 0;
          try {
            const keywords = evalJson.data.keywords || [];
            const legitimacy = evalJson.data.legitimacy || "";
            const date = evalJson.data.date || new Date().toISOString().slice(0, 10);
            const repos = getDataRepositories();
            const allReports = await repos.reports.list(user.userId);
            const maxNum = allReports.reduce((max, r) => Math.max(max, r.report_num), 0);
            reportNum = maxNum + 1;

            // Save application record
            const appRow: AppRow = {
              num: reportNum,
              company,
              role,
              score: overallScore,
              status: "Evaluated",
              date,
              pdf_generated: 0,
              report_path: "",
              notes: "",
            };
            await repos.applications.upsert(appRow, user.userId);

            // Save report record with full blocks
            const reportRow: ReportRow = {
              report_num: reportNum, date, company, role,
              archetype, overall_score: overallScore, legitimacy,
              blocks_json: JSON.stringify(blocks),
              keywords_json: JSON.stringify(keywords),
            };
            await repos.reports.upsert(reportRow, user.userId);
          } catch (e) { console.warn("[pipeline] persist failed:", e); }

          sse({
            type: "done",
            data: { company, role, overallScore, archetype, blocks, risks, jdText, reportNum, keywords: evalJson.data.keywords, date: evalJson.data.date, legitimacy: evalJson.data.legitimacy },
          });
        } catch (err) {
          sse({ type: "error", error: err instanceof Error ? err.message : "未知错误" });
          sse({ type: "done" });
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
    });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}
