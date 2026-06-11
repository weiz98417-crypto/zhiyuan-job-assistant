import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getDataRepositories } from "@/lib/data-repositories";
import { sanitizeDealBreakers } from "@/lib/profile-skill-quality";
import fs from "fs";
import path from "path";

function sanitizeGoals(goals: Record<string, unknown>): Record<string, unknown> {
  const next = { ...goals };
  if (Array.isArray(next.dealBreakers)) {
    const cleaned = sanitizeDealBreakers(next.dealBreakers);
    if (cleaned.length > 0) next.dealBreakers = cleaned;
    else delete next.dealBreakers;
  }
  return next;
}

function extractGoalsFromProfileYml(): Record<string, unknown> | null {
  try {
    const ymlPath = path.join(process.cwd(), "config", "profile.yml");
    if (!fs.existsSync(ymlPath)) return null;
    const content = fs.readFileSync(ymlPath, "utf-8");
    const goals: Record<string, unknown> = {};
    const targetMatch = content.match(/target_roles:[\s\S]*?primary:\s*\n(\s*- .+\n)*/);
    if (targetMatch) {
      const roles: { role: string; level: string }[] = [];
      const roleMatches = targetMatch[0].matchAll(/-\s*"(.+?)"/g);
      for (const m of roleMatches) {
        roles.push({ role: m[1], level: "" });
      }
      if (roles.length > 0) goals.targetRoles = roles;
    }
    return Object.keys(goals).length > 0 ? goals : null;
  } catch {
    return null;
  }
}

export async function GET() {
  try {
    const user = await getCurrentUser();
    const repos = getDataRepositories();

    const existing = await repos.profiles.get(user.userId);
    if (!existing) {
      const goals = extractGoalsFromProfileYml();
      await repos.profiles.upsert(user.userId, "{}", "[]", JSON.stringify(goals || {}));
    }

    const profile = await repos.profiles.get(user.userId);
    return NextResponse.json({
      success: true,
      data: profile ? {
        data: JSON.parse(profile.data_json || "{}"),
        goals: sanitizeGoals(JSON.parse(profile.goals_json || "{}")),
        history: JSON.parse(profile.history_json || "[]"),
        lastUpdated: profile.last_updated,
      } : null,
    });
  } catch (err: unknown) {
    if ((err as Error).message === 'Not authenticated') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ success: false, error: `读取失败: ${err instanceof Error ? err.message : "unknown"}` }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const user = await getCurrentUser();
    const repos = getDataRepositories();
    const body = await request.json() as { data?: Record<string, unknown>; goals?: Record<string, unknown>; history?: unknown[] };
    const existing = await repos.profiles.get(user.userId);
    const currentData = existing ? JSON.parse(existing.data_json || "{}") : {};
    const currentGoals = existing ? JSON.parse(existing.goals_json || "{}") : {};
    const currentHistory = existing ? JSON.parse(existing.history_json || "[]") : [];

    const mergedData = body.data ? { ...currentData, ...body.data } : currentData;
    const mergedGoals = sanitizeGoals(body.goals ? { ...currentGoals, ...body.goals } : currentGoals);
    const mergedHistory = body.history ? body.history : currentHistory;

    await repos.profiles.upsert(user.userId, JSON.stringify(mergedData), JSON.stringify(mergedHistory), JSON.stringify(mergedGoals));
    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    if ((err as Error).message === 'Not authenticated') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ success: false, error: `写入失败: ${err instanceof Error ? err.message : "unknown"}` }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await getCurrentUser();
    const repos = getDataRepositories();
    const body = await request.json() as {
      goals?: Record<string, unknown>;
      data?: Record<string, unknown>;
      source?: string;
      lockedFields?: Record<string, string>;
    };
    const existing = await repos.profiles.get(user.userId);

    if (body.goals) {
      const currentGoals = existing ? JSON.parse(existing.goals_json || "{}") : {};
      const goalsWithSource = { ...body.goals, ...(body.source ? { source: body.source } : {}), ...(body.lockedFields ? { _lockedFields: body.lockedFields } : {}) };
      const mergedGoals = sanitizeGoals({ ...currentGoals, ...goalsWithSource });
      await repos.profiles.upsert(user.userId, existing ? existing.data_json : "{}", existing ? existing.history_json : "[]", JSON.stringify(mergedGoals));
    }

    if (body.data) {
      const currentData = existing ? JSON.parse(existing.data_json || "{}") : {};
      const dataWithSource = { ...body.data, ...(body.source ? { source: body.source } : {}) };
      const mergedData = { ...currentData, ...dataWithSource };
      const currentGoals = sanitizeGoals(existing ? JSON.parse(existing.goals_json || "{}") : {});
      const currentHistory = existing ? JSON.parse(existing.history_json || "[]") : [];
      await repos.profiles.upsert(user.userId, JSON.stringify(mergedData), JSON.stringify(currentHistory), JSON.stringify(currentGoals));
    }

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    if ((err as Error).message === 'Not authenticated') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ success: false, error: `更新失败: ${err instanceof Error ? err.message : "unknown"}` }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    const user = await getCurrentUser();
    const repos = getDataRepositories();
    const existing = await repos.profiles.get(user.userId);
    if (existing) {
      const history = JSON.parse(existing.history_json || "[]");
      history.push({ timestamp: new Date().toISOString(), event: "画像已重置", changes: ["所有目标、技能、偏好数据已被清空"] });
      await repos.profiles.upsert(user.userId, "{}", JSON.stringify(history), "{}");
    }
    const deletedSignals = await repos.profiles.deleteSignals(user.userId);
    return NextResponse.json({ success: true, data: { data_json: "{}", goals_json: "{}", history_json: "[]", deletedSignals } });
  } catch (err: unknown) {
    if ((err as Error).message === 'Not authenticated') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ success: false, error: `重置失败: ${err instanceof Error ? err.message : "unknown"}` }, { status: 500 });
  }
}
