import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getDataRepositories } from "@/lib/data-repositories";
import { normalizeProfileSignalForStorage } from "@/lib/profile-skill-quality";

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

    const rejected: { signal_type: string; reason: string }[] = [];
    const signals = body.signals.flatMap((s) => {
      const decision = normalizeProfileSignalForStorage({
        source: s.source || "auto_scan",
        signal_type: s.signal_type,
        content_json: s.content_json || {},
        session_id: s.session_id,
      });
      if (!decision.accepted || !decision.signal) {
        rejected.push({
          signal_type: s.signal_type,
          reason: decision.rejectedReason || "signal_quality_rejected",
        });
        return [];
      }
      return [{
        source: decision.signal.source,
        signal_type: decision.signal.signal_type,
        content_json: JSON.stringify(decision.signal.content_json || {}),
        session_id: decision.signal.session_id,
      }];
    });

    if (signals.length > 0) {
      await getDataRepositories().signals.insertMany(signals, user.userId);
    }

    return NextResponse.json({ success: true, count: signals.length, rejectedCount: rejected.length, rejected });
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
