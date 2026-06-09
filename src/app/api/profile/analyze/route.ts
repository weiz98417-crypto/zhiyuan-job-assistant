import { checkApiKey } from "@/lib/stream-utils";
import { runProfileEngine } from "@/lib/server-profile-engine";
import { getCurrentUser } from "@/lib/auth";
import { getDataRepositories } from "@/lib/data-repositories";

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h

export async function POST(request: Request) {
  const keyCheck = checkApiKey();
  if (!keyCheck.valid) return keyCheck.error;

  try {
    const user = await getCurrentUser();
    const repos = getDataRepositories();
    const body = await request.json().catch(() => ({}));
    const force = body.force === true;

    // Incremental check: skip if updated within 24h and not forced
    if (!force) {
      const existing = await repos.profiles.get(user.userId);
      if (existing) {
        const lastUpdate = new Date(existing.last_updated).getTime();
        const hoursSince = (Date.now() - lastUpdate) / (1000 * 60 * 60);
        if (hoursSince < 24) {
          return Response.json({
            success: true,
            data: {
              data: JSON.parse(existing.data_json || "{}"),
              goals: JSON.parse(existing.goals_json || "{}"),
              history: JSON.parse(existing.history_json || "[]"),
              lastUpdated: existing.last_updated,
            },
            cached: true,
            message: `画像 ${Math.round(hoursSince)} 小时前更新过，跳过分析。使用 force: true 强制重算。`,
          });
        }
      }
    }

    // Run server-side engine
    const profile = await runProfileEngine({ force, userId: user.userId });

    // Preserve existing goals (user-confirmed goals are not overwritten by engine)
    const existingRow = await repos.profiles.get(user.userId);
    const existingGoals = existingRow ? JSON.parse(existingRow.goals_json || "{}") : {};
    const existingHistory = existingRow ? JSON.parse(existingRow.history_json || "[]") : [];

    // Merge signal deal-breakers into goals.dealBreakers
    const rawBreakers = (await repos.signals.query({ signal_type: "dealbreaker", limit: 50 }, user.userId))
      .map((s) => {
        try {
          const c = typeof s.content_json === "string" ? JSON.parse(s.content_json) : s.content_json;
          if ((c as { status?: string }).status === "rejected") return "";
          const raw = (c as { value?: string }).value || "";
          return raw.replace(/[，,。.！!、\s]+$/g, "").replace(/^[，,。.！!、\s]+/g, "").trim();
        } catch { return ""; }
      })
      .filter((v): v is string => v.length >= 2 && v.length <= 30);

    // Dedup: remove entries that are wholly contained in another entry
    const sorted = [...new Set(rawBreakers)].sort((a, b) => a.length - b.length);
    const signalBreakers: string[] = [];
    for (const v of sorted) {
      if (!signalBreakers.some((existing) => existing.includes(v))) {
        signalBreakers.push(v);
      }
    }

    const goalsToStore = { ...(existingGoals && Object.keys(existingGoals).length > 0 ? existingGoals : {}) };
    if (signalBreakers.length > 0) {
      const existingBreakers: string[] = Array.isArray(goalsToStore.dealBreakers) ? goalsToStore.dealBreakers : [];
      const merged = [...new Set([...existingBreakers, ...signalBreakers])];
      // Final pass: remove substrings again
      const sorted2 = merged.sort((a, b) => a.length - b.length);
      const final: string[] = [];
      for (const v of sorted2) {
        if (!final.some((e) => e.includes(v))) {
          final.push(v);
        }
      }
      (goalsToStore as Record<string, unknown>).dealBreakers = final;
    }

    // Merge: engine history + existing history, engine data, existing goals
    const mergedHistory = [...existingHistory, ...profile.history];

    await repos.profiles.upsert(
      user.userId,
      JSON.stringify({
        skills: profile.skills,
        preferences: profile.preferences,
        marketFit: profile.marketFit,
      }),
      JSON.stringify(mergedHistory),
      JSON.stringify(goalsToStore),
    );

    return Response.json({
      success: true,
      data: {
        data: {
          skills: profile.skills,
          preferences: profile.preferences,
          marketFit: profile.marketFit,
        },
        goals: goalsToStore,
        history: mergedHistory,
        lastUpdated: new Date().toISOString(),
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "未知错误";
    if (error instanceof Error && error.message === "Not authenticated") {
      return Response.json({ success: false, error: "未登录" }, { status: 401 });
    }
    console.error("Profile analyze error:", message);
    return Response.json(
      { success: false, error: `画像分析失败: ${message}` },
      { status: 500 },
    );
  }
}
