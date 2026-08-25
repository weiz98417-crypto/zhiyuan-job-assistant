import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import {
  getDurableAgentRuntime,
  isDurableAgentRuntimeAvailable,
} from "@/lib/agent/runtime/runtime-factory";
import type { DurableAgentRunService } from "@/lib/agent/runtime/durable-agent-run";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await currentUserOrNull();
    if (!user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    if (!isDurableAgentRuntimeAvailable()) {
      return NextResponse.json({ success: false, error: "Durable Agent Runtime unavailable" }, { status: 503 });
    }

    const rawAfter = new URL(request.url).searchParams.get("after") || "0";
    const afterCursor = Number(rawAfter);
    if (!Number.isFinite(afterCursor) || afterCursor < 0) {
      return NextResponse.json({ success: false, error: "Invalid event cursor" }, { status: 400 });
    }

    const { id } = await params;
    const runtime = getDurableAgentRuntime();
    const principal = { userId: user.userId };
    if (request.headers.get("Accept")?.includes("text/event-stream")) {
      return streamRunEvents(request, runtime, principal, id, Math.floor(afterCursor));
    }
    const events = await runtime.listEvents(
      principal,
      id,
      Math.floor(afterCursor),
    );
    const cursor = events.at(-1)?.sequence ?? Math.floor(afterCursor);
    return NextResponse.json({ success: true, data: { events, cursor } });
  } catch (error) {
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}

function streamRunEvents(
  request: Request,
  runtime: DurableAgentRunService,
  principal: { userId: string },
  runId: string,
  afterCursor: number,
): Response {
  const encoder = new TextEncoder();
  let cursor = afterCursor;
  let closed = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const close = () => {
        if (closed) return;
        closed = true;
        if (timer) clearTimeout(timer);
        try { controller.close(); } catch {}
      };
      request.signal.addEventListener("abort", close, { once: true });

      const poll = async () => {
        if (closed) return;
        try {
          const events = await runtime.listEvents(principal, runId, cursor);
          const frames = events.map((event) => {
            cursor = Math.max(cursor, event.sequence);
            return `id: ${event.sequence}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
          }).join("");
          controller.enqueue(encoder.encode(frames || `: cursor ${cursor}\n\n`));
          timer = setTimeout(() => void poll(), 1_000);
        } catch (error) {
          if (!closed) controller.error(error);
          closed = true;
        }
      };

      void poll();
    },
    cancel() {
      closed = true;
      if (timer) clearTimeout(timer);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

async function currentUserOrNull() {
  try {
    return await getCurrentUser();
  } catch {
    return null;
  }
}
