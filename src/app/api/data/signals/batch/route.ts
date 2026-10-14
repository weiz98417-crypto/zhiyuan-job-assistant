import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getDataRepositories } from "@/lib/data-repositories";
import { normalizeProfileSignalForStorage } from "@/lib/profile-skill-quality";
import { profileSignalReadBackMatches } from "@/lib/profile-signal-persistence-verifier";
import { permitsProfileSignalCapture } from "@/lib/agent/profile-signal-capture-policy";
import { deduplicateSignals, maybeRawContext, scanMessage, signalKey, type ExtractedSignal } from "@/lib/agent/signal-extractor";
import { loadProfileSignalCaptureContext } from "@/lib/server/profile-signal-capture-context";

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    const body = await request.json() as {
      origin?: string;
      runId?: string;
      requestId?: string;
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
    let requestedSignals = body.signals;
    if (body.origin === "agent_chat" || body.signals.some((signal) => signal.source !== "manual")) {
      const sessionId = body.signals[0].session_id;
      const conversationId = Number(sessionId);
      if (!Number.isSafeInteger(conversationId) || conversationId <= 0 || !body.runId || !body.requestId
        || body.signals.some((signal) => signal.session_id !== sessionId)) {
        return NextResponse.json({ success: false, error: "自动画像信号必须绑定已接收的会话输入", count: 0 }, { status: 422 });
      }
      const context = await loadProfileSignalCaptureContext(user.userId, conversationId, body.runId, body.requestId);
      if (!context) return NextResponse.json({ success: false, error: "未找到所属会话的已接收输入", count: 0 }, { status: 422 });
      if (!permitsProfileSignalCapture(context.content, context.priorUserContent)) {
        return NextResponse.json({ success: false, error: "当前会话禁止自动保存画像信号", count: 0 }, { status: 422 });
      }
      const canonicalSignals = scanMessage(context.content, String(conversationId));
      const rawContext = maybeRawContext(context.content, canonicalSignals.length, String(conversationId));
      if (rawContext) canonicalSignals.push(rawContext);
      const canonicalByKey = new Map(deduplicateSignals(canonicalSignals, new Set()).map((signal) => [signalKey(signal), signal]));
      const acceptedKeys = new Set<string>();
      requestedSignals = body.signals.flatMap((signal) => {
        const key = signalKey(signal as ExtractedSignal);
        const canonical = canonicalByKey.get(key);
        if (!canonical || acceptedKeys.has(key)) {
          rejected.push({ signal_type: signal.signal_type, reason: "signal_not_in_admitted_user_input" });
          return [];
        }
        acceptedKeys.add(key);
        return [canonical];
      });
    }
    const signals = requestedSignals.flatMap((s) => {
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
