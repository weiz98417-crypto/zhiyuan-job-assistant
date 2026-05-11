import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
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

          // Phase 4: Persist
          sse({ type: "phase", phase: "persisting" });
          try {
            await fetch(`${baseUrl}/api/data/application`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ company, role, score: overallScore, archetype, blocks }),
            });
          } catch { /* best-effort */ }

          sse({
            type: "done",
            data: { company, role, overallScore, archetype, blocks, risks, jdText },
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
