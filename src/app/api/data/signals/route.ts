import { NextResponse } from "next/server";
import { insertSignal, querySignals } from "@/lib/server-db";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const signalType = searchParams.get("signal_type") || undefined;
    const source = searchParams.get("source") || undefined;
    const since = searchParams.get("since") || undefined;
    const limit = searchParams.get("limit") ? parseInt(searchParams.get("limit")!) : 50;

    const signals = querySignals({ signal_type: signalType, source, since, limit });
    const parsed = signals.map((s) => ({
      ...s,
      content_json: JSON.parse(s.content_json || "{}"),
    }));

    return NextResponse.json({ success: true, data: parsed });
  } catch (err: unknown) {
    return NextResponse.json(
      { success: false, error: `查询失败: ${err instanceof Error ? err.message : "unknown"}` },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as {
      source?: string;
      signal_type: string;
      content_json: Record<string, unknown>;
      session_id?: string;
    };

    if (!body.signal_type) {
      return NextResponse.json({ success: false, error: "缺少 signal_type 字段" }, { status: 400 });
    }

    insertSignal({
      source: body.source || "dingwei",
      signal_type: body.signal_type,
      content_json: JSON.stringify(body.content_json || {}),
      session_id: body.session_id,
    });

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    return NextResponse.json(
      { success: false, error: `写入失败: ${err instanceof Error ? err.message : "unknown"}` },
      { status: 500 },
    );
  }
}
