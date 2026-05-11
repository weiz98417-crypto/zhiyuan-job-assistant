import { NextResponse } from "next/server";
import { getProfile, upsertProfile, upsertProfileGoals, migrateFromFiles } from "@/lib/server-db";
import fs from "fs";
import path from "path";

function extractGoalsFromProfileYml(): Record<string, unknown> | null {
  try {
    const ymlPath = path.join(process.cwd(), "config", "profile.yml");
    if (!fs.existsSync(ymlPath)) return null;
    const content = fs.readFileSync(ymlPath, "utf-8");
    // Simple YAML extraction for target_roles
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
    // Auto-migrate on first access
    const existing = getProfile();
    if (!existing) {
      const migrated = migrateFromFiles();
      if (migrated > 0 && !getProfile()) {
        upsertProfile("{}", "[]");
      }
      // Extract goals from profile.yml on first migration
      const goals = extractGoalsFromProfileYml();
      if (goals) {
        upsertProfileGoals(goals);
      }
    }
    const profile = getProfile();
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
    return NextResponse.json({ success: false, error: `读取失败: ${err instanceof Error ? err.message : "unknown"}` }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json() as { data?: Record<string, unknown>; goals?: Record<string, unknown>; history?: unknown[] };
    const existing = getProfile();
    const currentData = existing ? JSON.parse(existing.data_json || "{}") : {};
    const currentGoals = existing ? JSON.parse(existing.goals_json || "{}") : {};
    const currentHistory = existing ? JSON.parse(existing.history_json || "[]") : [];

    const mergedData = body.data ? { ...currentData, ...body.data } : currentData;
    const mergedGoals = body.goals ? { ...currentGoals, ...body.goals } : currentGoals;
    const mergedHistory = body.history ? body.history : currentHistory;

    upsertProfile(
      JSON.stringify(mergedData),
      JSON.stringify(mergedHistory),
      JSON.stringify(mergedGoals),
    );
    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    return NextResponse.json({ success: false, error: `写入失败: ${err instanceof Error ? err.message : "unknown"}` }, { status: 500 });
  }
}

// PATCH: update goals/data with source/lockedFields support
export async function PATCH(request: Request) {
  try {
    const body = await request.json() as {
      goals?: Record<string, unknown>;
      data?: Record<string, unknown>;
      source?: string;
      lockedFields?: Record<string, string>;
    };

    const existing = getProfile();

    if (body.goals) {
      const currentGoals = existing ? JSON.parse(existing.goals_json || "{}") : {};
      // Inject source marker into goals
      const goalsWithSource = {
        ...body.goals,
        ...(body.source ? { source: body.source } : {}),
        ...(body.lockedFields ? { _lockedFields: body.lockedFields } : {}),
      };
      const mergedGoals = { ...currentGoals, ...goalsWithSource };
      upsertProfileGoals(mergedGoals);
    }

    if (body.data) {
      const currentData = existing ? JSON.parse(existing.data_json || "{}") : {};
      const dataWithSource = {
        ...body.data,
        ...(body.source ? { source: body.source } : {}),
      };
      const mergedData = { ...currentData, ...dataWithSource };
      const currentGoals = existing ? JSON.parse(existing.goals_json || "{}") : {};
      const currentHistory = existing ? JSON.parse(existing.history_json || "[]") : [];
      upsertProfile(JSON.stringify(mergedData), JSON.stringify(currentHistory), JSON.stringify(currentGoals));
    }

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    return NextResponse.json({ success: false, error: `更新失败: ${err instanceof Error ? err.message : "unknown"}` }, { status: 500 });
  }
}

// DELETE: reset profile data
export async function DELETE() {
  try {
    const existing = getProfile();
    if (existing) {
      const history = JSON.parse(existing.history_json || "[]");
      history.push({
        timestamp: new Date().toISOString(),
        event: "画像已重置",
        changes: ["所有目标、技能、偏好数据已被清空"],
      });
      upsertProfile("{}", JSON.stringify(history), "{}");
    }
    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    return NextResponse.json({ success: false, error: `重置失败: ${err instanceof Error ? err.message : "unknown"}` }, { status: 500 });
  }
}
