import { NextResponse } from "next/server";
import { getDb } from "@/lib/server-db";
import { getCurrentUser, scopedDb } from "@/lib/auth";
import fs from "fs";
import path from "path";

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

function getProfileByUser(userId: string) {
  return getDb().prepare("SELECT * FROM profiles WHERE user_id = ? LIMIT 1").get(userId) as {
    id?: number; data_json: string; goals_json: string; history_json: string;
    last_updated: string; user_id?: string;
  } | undefined;
}

function upsertProfileByUser(userId: string, dataJson: string, historyJson: string, goalsJson?: string): void {
  const existing = getProfileByUser(userId);
  if (existing) {
    getDb().prepare(`
      UPDATE profiles SET data_json = ?, goals_json = ?, history_json = ?, last_updated = datetime('now')
      WHERE user_id = ?
    `).run(dataJson, goalsJson || "{}", historyJson, userId);
  } else {
    getDb().prepare(`
      INSERT INTO profiles (data_json, goals_json, history_json, user_id, last_updated)
      VALUES (?, ?, ?, ?, datetime('now'))
    `).run(dataJson, goalsJson || "{}", historyJson, userId);
  }
}

export async function GET() {
  try {
    const user = await getCurrentUser();
    const sdb = scopedDb(user.userId);

    // Auto-migrate on first access (for admin's legacy data)
    const existing = getProfileByUser(user.userId);
    if (!existing) {
      // Try legacy row (id=1, no user_id or user_id matches)
      const legacy = getDb().prepare("SELECT * FROM profiles WHERE id = 1 AND (user_id IS NULL OR user_id = ?)").get(user.userId);
      if (legacy) {
        // Migrate legacy row to current user
        getDb().prepare("UPDATE profiles SET user_id = ? WHERE id = 1 AND user_id IS NULL").run(user.userId);
      } else {
        upsertProfileByUser(user.userId, "{}", "[]");
        const goals = extractGoalsFromProfileYml();
        if (goals) {
          getDb().prepare("UPDATE profiles SET goals_json = ? WHERE user_id = ?").run(JSON.stringify(goals), user.userId);
        }
      }
    }

    const profile = getProfileByUser(user.userId);
    return NextResponse.json({
      success: true,
      data: profile ? {
        data: JSON.parse(profile.data_json || "{}"),
        goals: JSON.parse(profile.goals_json || "{}"),
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
    const body = await request.json() as { data?: Record<string, unknown>; goals?: Record<string, unknown>; history?: unknown[] };
    const existing = getProfileByUser(user.userId);
    const currentData = existing ? JSON.parse(existing.data_json || "{}") : {};
    const currentGoals = existing ? JSON.parse(existing.goals_json || "{}") : {};
    const currentHistory = existing ? JSON.parse(existing.history_json || "[]") : [];

    const mergedData = body.data ? { ...currentData, ...body.data } : currentData;
    const mergedGoals = body.goals ? { ...currentGoals, ...body.goals } : currentGoals;
    const mergedHistory = body.history ? body.history : currentHistory;

    upsertProfileByUser(user.userId, JSON.stringify(mergedData), JSON.stringify(mergedHistory), JSON.stringify(mergedGoals));
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
    const body = await request.json() as {
      goals?: Record<string, unknown>;
      data?: Record<string, unknown>;
      source?: string;
      lockedFields?: Record<string, string>;
    };
    const existing = getProfileByUser(user.userId);

    if (body.goals) {
      const currentGoals = existing ? JSON.parse(existing.goals_json || "{}") : {};
      const goalsWithSource = { ...body.goals, ...(body.source ? { source: body.source } : {}), ...(body.lockedFields ? { _lockedFields: body.lockedFields } : {}) };
      const mergedGoals = { ...currentGoals, ...goalsWithSource };
      upsertProfileByUser(user.userId, existing ? existing.data_json : "{}", existing ? existing.history_json : "[]", JSON.stringify(mergedGoals));
    }

    if (body.data) {
      const currentData = existing ? JSON.parse(existing.data_json || "{}") : {};
      const dataWithSource = { ...body.data, ...(body.source ? { source: body.source } : {}) };
      const mergedData = { ...currentData, ...dataWithSource };
      const currentGoals = existing ? JSON.parse(existing.goals_json || "{}") : {};
      const currentHistory = existing ? JSON.parse(existing.history_json || "[]") : [];
      upsertProfileByUser(user.userId, JSON.stringify(mergedData), JSON.stringify(currentHistory), JSON.stringify(currentGoals));
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
    const existing = getProfileByUser(user.userId);
    if (existing) {
      const history = JSON.parse(existing.history_json || "[]");
      history.push({ timestamp: new Date().toISOString(), event: "画像已重置", changes: ["所有目标、技能、偏好数据已被清空"] });
      upsertProfileByUser(user.userId, "{}", JSON.stringify(history), "{}");
    }
    const deletedSignals = getDb().prepare("DELETE FROM profile_signals WHERE user_id = ?").run(user.userId).changes;
    return NextResponse.json({ success: true, data: { data_json: "{}", goals_json: "{}", history_json: "[]", deletedSignals } });
  } catch (err: unknown) {
    if ((err as Error).message === 'Not authenticated') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ success: false, error: `重置失败: ${err instanceof Error ? err.message : "unknown"}` }, { status: 500 });
  }
}
