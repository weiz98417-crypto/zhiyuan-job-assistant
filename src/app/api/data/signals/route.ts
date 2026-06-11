import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getDataRepositories } from "@/lib/data-repositories";
import {
  normalizeProfileSignalForStorage,
  normalizeSkillClaim,
  skillFromClaim,
} from "@/lib/profile-skill-quality";
import { profileContainsSkill, profileSignalReadBackMatches } from "@/lib/profile-signal-persistence-verifier";
import type { ProfileSkill } from "@/types";

function parseContent(value: unknown): Record<string, unknown> {
  if (!value) return {};
  if (typeof value === "string") {
    try { return JSON.parse(value) as Record<string, unknown>; } catch { return {}; }
  }
  return typeof value === "object" ? value as Record<string, unknown> : {};
}

function contentStatus(content: Record<string, unknown>): string {
  return typeof content.status === "string" ? content.status : "legacy";
}

async function upsertConfirmedSkill(userId: string, content: Record<string, unknown>): Promise<{ skillName: string; readBackVerified: boolean } | null> {
  const normalized = normalizeSkillClaim({
    skill: typeof content.skill === "string" ? content.skill : "",
    evidence: typeof content.evidence === "string" ? content.evidence : "",
    confidence: typeof content.confidence === "number" ? content.confidence : 0.9,
    source: "manual",
  }, "manual");
  if (!normalized) return null;

  const repos = getDataRepositories();
  const existing = await repos.profiles.get(userId);
  const data = existing ? JSON.parse(existing.data_json || "{}") : {};
  const history = existing ? JSON.parse(existing.history_json || "[]") : [];
  const goals = existing ? JSON.parse(existing.goals_json || "{}") : {};
  const currentSkills: ProfileSkill[] = Array.isArray(data.skills) ? data.skills : [];
  const nextSkill = { ...skillFromClaim(normalized), source: "manual" as const };
  const byName = new Map(currentSkills.map((skill) => [skill.name, skill]));
  const old = byName.get(nextSkill.name);
  byName.set(nextSkill.name, old
    ? {
        ...old,
        source: old.source === "manual" ? old.source : "manual",
        proficiency: Math.max(old.proficiency || 0, nextSkill.proficiency || 0),
        evidence: Array.from(new Set([...(old.evidence || []), ...(nextSkill.evidence || [])])).slice(0, 5),
      }
    : nextSkill);

  history.push({
    timestamp: new Date().toISOString(),
    event: "确认画像技能",
    changes: [`已确认核心技能：${nextSkill.name}`],
  });

  await repos.profiles.upsert(
    userId,
    JSON.stringify({ ...data, skills: Array.from(byName.values()).slice(0, 20) }),
    JSON.stringify(history),
    JSON.stringify(goals),
  );
  const readBack = await repos.profiles.get(userId);
  return { skillName: nextSkill.name, readBackVerified: profileContainsSkill(readBack, nextSkill.name) };
}

export async function GET(request: Request) {
  try {
    const user = await getCurrentUser();
    const { searchParams } = new URL(request.url);
    const signalType = searchParams.get("signal_type") || undefined;
    const source = searchParams.get("source") || undefined;
    const since = searchParams.get("since") || undefined;
    const status = searchParams.get("status") || undefined;
    const limit = searchParams.get("limit") ? parseInt(searchParams.get("limit")!) : 50;

    const signals = await getDataRepositories().signals.query({ signal_type: signalType, source, since, limit }, user.userId);
    const parsed = signals.map((s) => ({
      ...s,
      content_json: parseContent(s.content_json),
    })).filter((s) => !status || contentStatus(s.content_json) === status);

    return NextResponse.json({ success: true, data: parsed });
  } catch (err: unknown) {
    if (err instanceof Error && err.message === "Not authenticated") {
      return NextResponse.json({ success: false, error: "未登录" }, { status: 401 });
    }
    return NextResponse.json(
      { success: false, error: `查询失败: ${err instanceof Error ? err.message : "unknown"}` },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    const body = await request.json() as {
      source?: string;
      signal_type: string;
      content_json: Record<string, unknown>;
      session_id?: string;
    };

    if (!body.signal_type) {
      return NextResponse.json({ success: false, error: "缺少 signal_type 字段" }, { status: 400 });
    }

    const decision = normalizeProfileSignalForStorage({
      source: body.source || "dingwei",
      signal_type: body.signal_type,
      content_json: body.content_json || {},
      session_id: body.session_id,
    });
    if (!decision.accepted || !decision.signal) {
      return NextResponse.json({ success: false, error: decision.rejectedReason || "信号质量不达标" }, { status: 422 });
    }

    const repos = getDataRepositories();
    const signalInput = {
      source: decision.signal.source,
      signal_type: decision.signal.signal_type,
      content_json: JSON.stringify(decision.signal.content_json || {}),
      session_id: decision.signal.session_id || undefined,
    };
    const id = await repos.signals.insert(signalInput, user.userId);
    const readBack = await repos.signals.get(id, user.userId);
    const readBackVerified = profileSignalReadBackMatches(readBack, signalInput, id);
    if (!readBackVerified) {
      return NextResponse.json({
        success: false,
        error: "画像信号写入后回读校验失败，已阻止成功提示",
        data: { id, readBackVerified: false },
      }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: { id, readBackVerified } });
  } catch (err: unknown) {
    if (err instanceof Error && err.message === "Not authenticated") {
      return NextResponse.json({ success: false, error: "未登录" }, { status: 401 });
    }
    return NextResponse.json(
      { success: false, error: `写入失败: ${err instanceof Error ? err.message : "unknown"}` },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await getCurrentUser();
    const repos = getDataRepositories();
    const body = await request.json() as {
      id?: number;
      action?: "confirm" | "edit" | "reject";
      content_json?: Record<string, unknown>;
    };
    const id = Number(body.id || 0);
    if (!id) return NextResponse.json({ success: false, error: "缺少 id" }, { status: 400 });
    const existing = await repos.signals.get(id, user.userId);
    if (!existing) return NextResponse.json({ success: false, error: "信号不存在" }, { status: 404 });

    const currentContent = parseContent(existing.content_json);
    let nextContent = { ...currentContent, ...(body.content_json || {}) };
    let source = existing.source;

    if (body.action === "confirm") {
      nextContent = {
        ...nextContent,
        status: "confirmed",
        sourceType: "manual",
        confidence: Math.max(typeof nextContent.confidence === "number" ? nextContent.confidence : 0.9, 0.9),
        confirmedAt: new Date().toISOString(),
      };
      source = "user_confirmed";
    } else if (body.action === "reject") {
      nextContent = {
        ...nextContent,
        status: "rejected",
        rejectedAt: new Date().toISOString(),
      };
    } else if (body.action === "edit") {
      nextContent = {
        ...nextContent,
        status: contentStatus(nextContent) === "confirmed" ? "confirmed" : "candidate",
        editedAt: new Date().toISOString(),
      };
    } else {
      return NextResponse.json({ success: false, error: "未知 action" }, { status: 400 });
    }

    const decision = normalizeProfileSignalForStorage({
      source,
      signal_type: existing.signal_type,
      content_json: nextContent,
      session_id: existing.session_id,
    });
    if (!decision.accepted || !decision.signal) {
      return NextResponse.json({ success: false, error: decision.rejectedReason || "信号质量不达标" }, { status: 422 });
    }

    const signalInput = {
      source: decision.signal.source,
      signal_type: decision.signal.signal_type,
      content_json: JSON.stringify(decision.signal.content_json),
      session_id: decision.signal.session_id || undefined,
    };
    const updated = await repos.signals.update(id, signalInput, user.userId);
    if (!updated) {
      return NextResponse.json({ success: false, error: "画像信号更新失败，已阻止成功提示", data: { id, readBackVerified: false } }, { status: 500 });
    }
    const readBack = await repos.signals.get(id, user.userId);
    const readBackVerified = profileSignalReadBackMatches(readBack, signalInput, id);
    if (!readBackVerified) {
      return NextResponse.json({
        success: false,
        error: "画像信号更新后回读校验失败，已阻止成功提示",
        data: { id, readBackVerified: false },
      }, { status: 500 });
    }

    let profileSkillReadBack: { skillName: string; readBackVerified: boolean } | null = null;
    if (body.action === "confirm" && existing.signal_type === "skill_claim") {
      profileSkillReadBack = await upsertConfirmedSkill(user.userId, decision.signal.content_json);
      if (profileSkillReadBack && !profileSkillReadBack.readBackVerified) {
        return NextResponse.json({
          success: false,
          error: "画像技能晋升后回读校验失败，已阻止成功提示",
          data: { id, readBackVerified, profileSkillReadBackVerified: false },
        }, { status: 500 });
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        id,
        content_json: decision.signal.content_json,
        readBackVerified,
        profileSkillReadBackVerified: profileSkillReadBack?.readBackVerified ?? null,
      },
    });
  } catch (err: unknown) {
    if (err instanceof Error && err.message === "Not authenticated") {
      return NextResponse.json({ success: false, error: "未登录" }, { status: 401 });
    }
    return NextResponse.json(
      { success: false, error: `更新失败: ${err instanceof Error ? err.message : "unknown"}` },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await getCurrentUser();
    const { searchParams } = new URL(request.url);
    const id = Number(searchParams.get("id") || 0);
    if (!id) return NextResponse.json({ success: false, error: "缺少 id" }, { status: 400 });
    const deleted = await getDataRepositories().signals.delete(id, user.userId);
    return NextResponse.json({ success: true, deleted });
  } catch (err: unknown) {
    if (err instanceof Error && err.message === "Not authenticated") {
      return NextResponse.json({ success: false, error: "未登录" }, { status: 401 });
    }
    return NextResponse.json(
      { success: false, error: `删除失败: ${err instanceof Error ? err.message : "unknown"}` },
      { status: 500 },
    );
  }
}
