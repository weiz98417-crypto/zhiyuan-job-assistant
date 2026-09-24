import { NextResponse } from "next/server";
import { requireAuthenticated } from "@/lib/security/auth-guards";
import { getProfileBlocks, upsertProfileBlock } from "@/lib/memory/fact-ledger";

export async function GET(request: Request) {
  try {
    const user = await requireAuthenticated();
    const topic = new URL(request.url).searchParams.get("topic") || undefined;
    return NextResponse.json({ success: true, data: await getProfileBlocks({ userId: user.userId }, topic, "user", { includeReviewDue: true }) });
  } catch (error) {
    return handleError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await requireAuthenticated();
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const topic = typeof body.topic === "string" ? body.topic.trim() : "";
    const subTopic = typeof body.subTopic === "string" ? body.subTopic.trim() : "";
    if (!topic || !subTopic) return NextResponse.json({ success: false, error: "topic and subTopic are required" }, { status: 400 });
    const blocks = await getProfileBlocks({ userId: user.userId }, topic, "user", { includeReviewDue: true });
    const current = blocks.find((block) => block.subTopic === subTopic);
    if (!current) return NextResponse.json({ success: false, error: "Profile block not found" }, { status: 404 });
    await upsertProfileBlock(
      { userId: user.userId },
      {
      topic,
      subTopic,
      value: current.value,
      label: current.label || undefined,
      source: current.source,
      agentId: "user",
      factIds: current.factIds,
      reviewDueAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
      },
    );
    const updated = (await getProfileBlocks({ userId: user.userId }, topic, "user", { includeReviewDue: true }))
      .find((block) => block.subTopic === subTopic);
    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    return handleError(error);
  }
}

function handleError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("authenticated") || message.includes("token")) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  console.error("[memory/profile] failed:", error);
  return NextResponse.json({ success: false, error: "Memory profile operation failed" }, { status: 500 });
}
