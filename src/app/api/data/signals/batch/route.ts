import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getDataRepositories } from "@/lib/data-repositories";
import { normalizeProfileSignalForStorage } from "@/lib/profile-skill-quality";
import { profileSignalReadBackMatches } from "@/lib/profile-signal-persistence-verifier";

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

    let ids: number[] = [];
    let readBackVerified = true;
    if (signals.length > 0) {
      const repos = getDataRepositories();
      ids = await repos.signals.insertMany(signals, user.userId);
      const rows = await Promise.all(ids.map((id) => repos.signals.get(id, user.userId)));
      readBackVerified = ids.length === signals.length && rows.every((row, index) => profileSignalReadBackMatches(row, signals[index], ids[index]));
      if (!readBackVerified) {
        return NextResponse.json({
          success: false,
          error: "批量画像信号写入后回读校验失败，已阻止成功提示",
          count: signals.length,
          ids,
          readBackVerified: false,
          rejectedCount: rejected.length,
          rejected,
        }, { status: 500 });
      }
    }

    return NextResponse.json({ success: true, count: signals.length, ids, readBackVerified, rejectedCount: rejected.length, rejected });
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
