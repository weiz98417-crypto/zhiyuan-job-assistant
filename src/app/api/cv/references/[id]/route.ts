import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getDataRepositories } from "@/lib/data-repositories";
import { getAgentReadService } from "@/lib/agent/runtime/agent-read-service";
import {
  buildReferenceResumeRawText,
  normalizeReferenceVisibility,
  normalizeRoleCategory,
  redactReferenceResumeText,
  reindexReferenceResumeRecord,
  scoreReferenceResumeQuality,
} from "@/lib/reference-resume-vector";
import { stableHash } from "@/lib/memory/vector-memory";

interface CVSection {
  id: string;
  title: string;
  content: string;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const user = await getCurrentUser();
    const numId = parseInt(id, 10);
    if (isNaN(numId)) {
      return NextResponse.json({ success: false, error: "无效 ID" }, { status: 400 });
    }

    const resume = await getAgentReadService().getReferenceResume({ userId: user.userId }, numId);
    if (!resume) {
      return NextResponse.json({ success: false, error: "参考简历不存在" }, { status: 404 });
    }
    return NextResponse.json({ success: true, data: resume });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "未知错误";
    return NextResponse.json(
      { success: false, error: `查询失败: ${message}` },
      { status: 500 },
    );
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const user = await getCurrentUser();
    const numId = parseInt(id, 10);
    if (isNaN(numId)) {
      return NextResponse.json({ success: false, error: "无效 ID" }, { status: 400 });
    }

    const body = await request.json().catch(() => ({}));
    const { action, name, sections, tags, notes, roleCategory, visibility, status } = body as {
      action?: "request_team_share" | "withdraw_team_share" | "disable" | "restore";
      name?: string;
      sections?: CVSection[];
      tags?: string[];
      notes?: string;
      roleCategory?: string;
      visibility?: string;
      status?: string;
    };

    if (status !== undefined) {
      return NextResponse.json({ success: false, error: "状态由管理员治理流程控制" }, { status: 403 });
    }

    const repos = getDataRepositories();
    const existing = await repos.referenceResumes.get(numId);
    if (!existing || (existing.user_id && existing.user_id !== user.userId)) {
      return NextResponse.json({ success: false, error: "参考简历不存在" }, { status: 404 });
    }

    const updates: Record<string, unknown> = {};
    if (name !== undefined) updates.name = name;
    if (notes !== undefined) updates.notes = notes;
    if (tags !== undefined) updates.tags = JSON.stringify(tags);
    if (roleCategory !== undefined) updates.role_category = normalizeRoleCategory(roleCategory);

    let rawTextForSharing = existing.raw_text || "";
    if (sections !== undefined) {
      updates.sections_json = JSON.stringify(sections);
      const rawText = buildReferenceResumeRawText(sections);
      const qualityScore = scoreReferenceResumeQuality({ rawText, sections });
      updates.raw_text = rawText;
      updates.quality_score = qualityScore;
      updates.source_hash = stableHash(rawText);
      rawTextForSharing = rawText;
    }

    const userAction = action || legacyVisibilityToAction(visibility);
    if (userAction) {
      applyUserReferenceAction(userAction, updates, rawTextForSharing);
    } else if (sections !== undefined) {
      const currentVisibility = normalizeReferenceVisibility(existing.visibility);
      if (currentVisibility === "team" || currentVisibility === "team_pending") {
        applyUserReferenceAction("request_team_share", updates, rawTextForSharing);
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ success: false, error: "无更新内容" }, { status: 400 });
    }

    const ok = await repos.referenceResumes.update(numId, updates, user.userId);
    if (!ok) {
      return NextResponse.json({ success: false, error: "参考简历不存在" }, { status: 404 });
    }

    const latest = await repos.referenceResumes.get(numId, user.userId);
    if (latest) {
      await reindexReferenceResumeRecord(latest, user.userId);
    }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "未知错误";
    return NextResponse.json(
      { success: false, error: `更新失败: ${message}` },
      { status: 500 },
    );
  }
}

function legacyVisibilityToAction(value: string | undefined) {
  if (value === undefined) return undefined;
  const visibility = normalizeReferenceVisibility(value);
  if (visibility === "team" || visibility === "team_pending") return "request_team_share";
  if (visibility === "disabled") return "disable";
  return "withdraw_team_share";
}

function applyUserReferenceAction(
  action: "request_team_share" | "withdraw_team_share" | "disable" | "restore",
  updates: Record<string, unknown>,
  rawTextForSharing: string,
) {
  if (action === "request_team_share") {
    updates.visibility = "team_pending";
    updates.status = "pending";
    updates.shared_text_redacted = redactReferenceResumeText(rawTextForSharing);
    updates.anonymized = true;
    updates.approved_by = null;
    updates.approved_at = null;
    return;
  }
  if (action === "withdraw_team_share") {
    updates.visibility = "private";
    updates.status = "active";
    updates.approved_by = null;
    updates.approved_at = null;
    return;
  }
  if (action === "disable") {
    updates.visibility = "disabled";
    updates.status = "disabled";
    return;
  }
  if (action === "restore") {
    updates.visibility = "private";
    updates.status = "active";
    updates.approved_by = null;
    updates.approved_at = null;
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const user = await getCurrentUser();
    const numId = parseInt(id, 10);
    if (isNaN(numId)) {
      return NextResponse.json({ success: false, error: "无效 ID" }, { status: 400 });
    }

    const deleted = await getDataRepositories().referenceResumes.delete(numId, user.userId);
    if (!deleted) {
      return NextResponse.json({ success: false, error: "参考简历不存在" }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: { id: numId } });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "未知错误";
    return NextResponse.json(
      { success: false, error: `删除失败: ${message}` },
      { status: 500 },
    );
  }
}
