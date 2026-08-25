import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import {
  getDurableAgentRuntime,
  isDurableAgentRuntimeAvailable,
} from "@/lib/agent/runtime/runtime-factory";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await currentUserOrNull();
    if (!user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    if (!isDurableAgentRuntimeAvailable()) {
      return NextResponse.json({ success: false, error: "Durable Agent Runtime unavailable" }, { status: 503 });
    }

    const { id } = await params;
    const run = await getDurableAgentRuntime().getRun({ userId: user.userId }, id);
    if (!run) return NextResponse.json({ success: false, error: "Run not found" }, { status: 404 });
    return NextResponse.json({ success: true, data: { run } });
  } catch (error) {
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}

export async function PATCH(
  _request?: Request,
  _context?: { params: Promise<{ id: string }> },
) {
  return methodNotAllowed();
}

export async function DELETE(
  _request?: Request,
  _context?: { params: Promise<{ id: string }> },
) {
  return methodNotAllowed();
}

async function currentUserOrNull() {
  try {
    return await getCurrentUser();
  } catch {
    return null;
  }
}

function methodNotAllowed() {
  return NextResponse.json(
    { success: false, error: "Run state is owned by the Agent Worker" },
    { status: 405, headers: { Allow: "GET" } },
  );
}
