import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, verifyTokenVersion } from "@/lib/auth";
import { getDataRepositories } from "@/lib/data-repositories";
import {
  redactReferenceResumeText,
  reindexReferenceResumeRecord,
} from "@/lib/reference-resume-vector";

async function ensureAdmin() {
  const payload = await getCurrentUser();
  if (payload.role !== "admin") throw new Error("Forbidden");
  await verifyTokenVersion(payload);
  return payload;
}

export async function GET() {
  try {
    await ensureAdmin();
    const resumes = await getDataRepositories().referenceResumes.list();
    const pending = resumes.filter((resume) => resume.visibility === "team_pending" || resume.status === "pending");
    const team = resumes.filter((resume) => resume.visibility === "team" && resume.status !== "disabled");
    const disabled = resumes.filter((resume) => resume.status === "disabled" || resume.visibility === "disabled");
    const indexFailed = resumes.filter((resume) => resume.status === "index_failed");
    const qualityScores = resumes
      .map((resume) => Number(resume.quality_score || 0))
      .filter((score) => Number.isFinite(score) && score > 0);

    return NextResponse.json({
      success: true,
      data: {
        pending,
        health: {
          total: resumes.length,
          team: team.length,
          pending: pending.length,
          disabled: disabled.length,
          indexFailed: indexFailed.length,
          averageQuality: qualityScores.length
            ? Number((qualityScores.reduce((sum, score) => sum + score, 0) / qualityScores.length).toFixed(2))
            : 0,
        },
      },
    });
  } catch (error) {
    if ((error as Error).message === "Forbidden") {
      return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
    }
    if (["Not authenticated", "Invalid or expired token", "Token has been revoked"].includes((error as Error).message)) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }
    console.error("[admin/reference-resumes] GET", error);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const admin = await ensureAdmin();
    const body = await request.json().catch(() => ({}));
    const id = Number(body.id);
    const action = String(body.action || "");
    if (!id || !["approve", "reject", "disable"].includes(action)) {
      return NextResponse.json({ success: false, error: "Invalid id or action" }, { status: 400 });
    }

    const repos = getDataRepositories();
    const existing = await repos.referenceResumes.get(id);
    if (!existing) {
      return NextResponse.json({ success: false, error: "Reference resume not found" }, { status: 404 });
    }

    const updates: Record<string, unknown> = {};
    if (action === "approve") {
      updates.visibility = "team";
      updates.status = "active";
      updates.anonymized = true;
      updates.shared_text_redacted = existing.shared_text_redacted || redactReferenceResumeText(existing.raw_text);
      updates.approved_by = admin.userId;
      updates.approved_at = new Date().toISOString();
    } else if (action === "reject") {
      updates.visibility = "private";
      updates.status = "active";
      updates.approved_by = null;
      updates.approved_at = null;
    } else {
      updates.visibility = "disabled";
      updates.status = "disabled";
    }

    const ok = await repos.referenceResumes.update(id, updates);
    if (!ok) {
      return NextResponse.json({ success: false, error: "Reference resume update failed" }, { status: 500 });
    }

    const latest = await repos.referenceResumes.get(id);
    let indexing = null;
    if (latest) {
      indexing = await reindexReferenceResumeRecord(latest, latest.user_id || admin.userId);
    }

    return NextResponse.json({ success: true, data: { id, action, indexing } });
  } catch (error) {
    if ((error as Error).message === "Forbidden") {
      return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
    }
    if (["Not authenticated", "Invalid or expired token", "Token has been revoked"].includes((error as Error).message)) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }
    console.error("[admin/reference-resumes] PATCH", error);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}
