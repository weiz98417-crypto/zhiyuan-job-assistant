import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { retrieveMemorySnippets } from "@/lib/memory/postgres-memory";
import type { MemorySourceFilter } from "@/lib/memory/vector-memory";

const ALLOWED_FILTERS = new Set([
  "resume",
  "jd",
  "offer",
  "interview",
  "report",
  "profile",
  "cv",
  "reference_resume",
  "jd_report",
  "offer_report",
  "session",
  "story",
  "profile_signal",
]);

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    const body = await request.json().catch(() => ({})) as {
      query?: string;
      sourceTypes?: string[];
      limit?: number;
    };

    const query = (body.query || "").trim();
    if (!query) {
      return NextResponse.json({ success: false, error: "query is required" }, { status: 400 });
    }

    const sourceTypes = normalizeSourceTypes(body.sourceTypes);
    const snippets = await retrieveMemorySnippets({
      userId: user.userId,
      query,
      sourceTypes,
      limit: body.limit,
    });

    return NextResponse.json({ success: true, data: { snippets } });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    if (message === "Not authenticated") {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }
    console.error("[memory/retrieve] failed:", message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

function normalizeSourceTypes(sourceTypes: string[] | undefined): MemorySourceFilter[] {
  if (!Array.isArray(sourceTypes)) return [];
  return sourceTypes
    .map((item) => item.trim())
    .filter((item): item is MemorySourceFilter => ALLOWED_FILTERS.has(item));
}
