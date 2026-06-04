import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getDataRepositories } from "@/lib/data-repositories";

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    const body = await request.json() as {
      signals: {
        source?: string;
        signal_type: string;
        content_json: Record<string, unknown>;
        session_id?: string;
      }[];
    };

    if (!body.signals || !Array.isArray(body.signals) || body.signals.length === 0) {
      return NextResponse.json({ success: false, error: "缺少 signals 数组" }, { status: 400 });
    }

    const signals = body.signals.map((s) => ({
      source: s.source || "auto_scan",
      signal_type: s.signal_type,
      content_json: JSON.stringify(s.content_json || {}),
      session_id: s.session_id,
    }));

    await getDataRepositories().signals.insertMany(signals, user.userId);

    return NextResponse.json({ success: true, count: signals.length });
  } catch (err: unknown) {
    if (err instanceof Error && err.message === "Not authenticated") {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json(
      { success: false, error: `批量写入失败: ${err instanceof Error ? err.message : "unknown"}` },
      { status: 500 },
    );
  }
}
