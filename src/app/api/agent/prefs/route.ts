import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getDataRepositories } from "@/lib/data-repositories";

export async function GET() {
  try {
    const user = await getCurrentUser();
    // Apply time-based decay before returning
    const rows = await getDataRepositories().agentPreferences.list(user.userId) as Array<{
      entity_type: string; entity_key: string; weight: number;
      decay_rate: number; last_updated: string;
    }>;

    const now = new Date();
    const effective = rows.map((r) => {
      const days = Math.max(0, (now.getTime() - new Date(r.last_updated).getTime()) / (1000 * 60 * 60 * 24));
      const decayed = r.weight * Math.exp(-r.decay_rate * days);
      return { ...r, weight: Math.round(decayed * 1000) / 1000, effective: decayed > 0.05 };
    }).filter((r) => r.effective);

    return NextResponse.json({ success: true, data: effective });
  } catch (err) {
    if (err instanceof Error && err.message === "Not authenticated") {
      return NextResponse.json({ success: false, error: "未登录" }, { status: 401 });
    }
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    const { entity_type, entity_key, weight, decay_rate } = await request.json();
    await getDataRepositories().agentPreferences.upsert({ entity_type, entity_key, weight, decay_rate }, user.userId);
return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof Error && err.message === "Not authenticated") {
      return NextResponse.json({ success: false, error: "未登录" }, { status: 401 });
    }
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}
