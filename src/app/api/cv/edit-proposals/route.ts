import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getDataRepositories } from "@/lib/data-repositories";
import { resumeEditProposalToDTO } from "@/lib/agent/resume-edit-proposals";
import type { ResumeEditProposalStatus } from "@/lib/agent/resume-edit-proposals";
import { validateResumeSectionContent, type ResumeSectionId } from "@/lib/agent/resume-save-guard";
import { stableContentHash } from "@/lib/agent/verified-action";

const SECTION_IDS = new Set(["summary", "experience", "projects", "education", "skills"]);
const PROPOSAL_STATUSES = new Set<ResumeEditProposalStatus>(["pending", "applied", "discarded", "stale", "rolled_back"]);

type CVSection = { id: string; title?: string; content?: string };
type CVVersion = { sections?: CVSection[] };

function parseRiskFlags(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function getActiveVersion(cvData: Record<string, unknown>): { activeVersion: string; active: CVVersion } | null {
  const activeVersion = typeof cvData.activeVersion === "string" ? cvData.activeVersion : "";
  const versions = cvData.versions && typeof cvData.versions === "object"
    ? cvData.versions as Record<string, CVVersion>
    : {};
  const active = activeVersion ? versions[activeVersion] : undefined;
  return activeVersion && active?.sections ? { activeVersion, active } : null;
}

export async function GET(request: Request) {
  try {
    const user = await getCurrentUser();
    const url = new URL(request.url);
    const rawStatus = url.searchParams.get("status");
    const status = (rawStatus || "pending") as ResumeEditProposalStatus;
    if (!PROPOSAL_STATUSES.has(status)) {
      return NextResponse.json({ success: false, error: "Invalid proposal status" }, { status: 400 });
    }
    const rawLimit = Number(url.searchParams.get("limit") || 20);
    const limit = Number.isFinite(rawLimit) ? rawLimit : 20;
    const rows = status === "pending" && !rawStatus
      ? await getDataRepositories().resumeEditProposals.listPending(user.userId)
      : await getDataRepositories().resumeEditProposals.listByStatus(user.userId, status, limit);
    return NextResponse.json({ success: true, data: rows.map(resumeEditProposalToDTO) });
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
    const body = await request.json().catch(() => ({}));
    const repositories = getDataRepositories();
    const draftId = String(body.draftId || "");
    const draft = draftId ? await repositories.resumeDrafts.get(draftId, user.userId) : undefined;
    const draftContent = draft ? parseDraftContent(draft.content_json, draft.patches_json) : null;
    const sectionId = String(draftContent?.sectionId || body.sectionId || body.section || "") as ResumeSectionId;
    const proposedContent = String(draftContent?.content || body.proposedContent || body.content || "");
    const reason = String(body.reason || (draft ? `selected_resume_draft:${draft.id}` : "")).slice(0, 1200);
    const riskFlags = [...parseRiskFlags(body.riskFlags), ...(draft ? ["persistent_draft"] : [])];
    const expectedBaseHash = draft?.base_hash || (typeof body.baseHash === "string" ? body.baseHash : typeof body.expectedBaseHash === "string" ? body.expectedBaseHash : "");
    const expectedBaseVersion = draft?.base_version || (typeof body.baseVersion === "string" ? body.baseVersion : typeof body.expectedBaseVersion === "string" ? body.expectedBaseVersion : "");

    if (draftId && !draft) {
      return NextResponse.json({ success: false, error: "简历草稿不存在或不属于当前用户" }, { status: 404 });
    }

    if (!SECTION_IDS.has(sectionId)) {
      return NextResponse.json({ success: false, error: "无效的简历板块" }, { status: 400 });
    }

    const validation = validateResumeSectionContent(sectionId, proposedContent);
    if (!validation.valid) {
      return NextResponse.json({ success: false, error: validation.reason || "提案内容未通过校验" }, { status: 400 });
    }

    const cvRow = await repositories.cv.get(user.userId);
    const cvData = cvRow?.data_json ? JSON.parse(cvRow.data_json) as Record<string, unknown> : {};
    const activeVersion = getActiveVersion(cvData);
    if (!activeVersion) {
      return NextResponse.json({ success: false, error: "CV 数据为空，请先在 CV 页面创建简历" }, { status: 400 });
    }

    const section = activeVersion.active.sections?.find((item) => item.id === sectionId);
    if (!section) {
      return NextResponse.json({ success: false, error: `找不到板块: ${sectionId}` }, { status: 400 });
    }

    const currentBaseHash = stableContentHash(activeVersion.active);
    const baseVersionConflict = Boolean(expectedBaseVersion && expectedBaseVersion !== activeVersion.activeVersion);
    const baseHashConflict = Boolean(expectedBaseHash && expectedBaseHash !== currentBaseHash);
    if (baseVersionConflict || baseHashConflict) {
      return NextResponse.json({
        success: false,
        error: "简历已经发生变化，已阻止用旧上下文创建修改提案。请重新读取简历后再生成方案。",
        code: "base_version_conflict",
        data: {
          expectedBaseVersion,
          currentBaseVersion: activeVersion.activeVersion,
          expectedBaseHash,
          currentBaseHash,
        },
      }, { status: 409 });
    }

    const row = await repositories.resumeEditProposals.create({
      sectionId,
      baseVersion: activeVersion.activeVersion,
      baseHash: currentBaseHash,
      originalContent: section.content || "",
      proposedContent,
      reason,
      riskFlags,
    }, user.userId);

    if (draft) await repositories.resumeDrafts.updateStatus(draft.id, "selected", user.userId);

    return NextResponse.json({ success: true, data: { ...resumeEditProposalToDTO(row), draftId: draft?.id, artifactId: draft?.artifact_id } });
  } catch (err) {
    if (err instanceof Error && err.message === "Not authenticated") {
      return NextResponse.json({ success: false, error: "未登录" }, { status: 401 });
    }
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}

function parseDraftContent(contentJson: string, patchesJson: string): { sectionId: string; content: string } | null {
  try {
    const content = JSON.parse(contentJson || "{}") as Record<string, unknown>;
    if (typeof content.sectionId === "string" && typeof content.content === "string") {
      return { sectionId: content.sectionId, content: content.content };
    }
  } catch { /* use patch fallback */ }
  try {
    const patches = JSON.parse(patchesJson || "[]") as Array<Record<string, unknown>>;
    const patch = patches[0];
    if (typeof patch?.sectionId === "string" && typeof patch?.proposedContent === "string") {
      return { sectionId: patch.sectionId, content: patch.proposedContent };
    }
  } catch { /* invalid draft */ }
  return null;
}
