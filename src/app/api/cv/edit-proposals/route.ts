import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getDataRepositories } from "@/lib/data-repositories";
import { resumeEditProposalToDTO } from "@/lib/agent/resume-edit-proposals";
import { validateResumeSectionContent, type ResumeSectionId } from "@/lib/agent/resume-save-guard";
import { stableContentHash } from "@/lib/agent/verified-action";

const SECTION_IDS = new Set(["summary", "experience", "projects", "education", "skills"]);

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

export async function GET() {
  try {
    const user = await getCurrentUser();
    const rows = await getDataRepositories().resumeEditProposals.listPending(user.userId);
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
    const sectionId = String(body.sectionId || body.section || "") as ResumeSectionId;
    const proposedContent = String(body.proposedContent || body.content || "");
    const reason = String(body.reason || "").slice(0, 1200);
    const riskFlags = parseRiskFlags(body.riskFlags);
    const expectedBaseHash = typeof body.baseHash === "string" ? body.baseHash : typeof body.expectedBaseHash === "string" ? body.expectedBaseHash : "";
    const expectedBaseVersion = typeof body.baseVersion === "string" ? body.baseVersion : typeof body.expectedBaseVersion === "string" ? body.expectedBaseVersion : "";

    if (!SECTION_IDS.has(sectionId)) {
      return NextResponse.json({ success: false, error: "无效的简历板块" }, { status: 400 });
    }

    const validation = validateResumeSectionContent(sectionId, proposedContent);
    if (!validation.valid) {
      return NextResponse.json({ success: false, error: validation.reason || "提案内容未通过校验" }, { status: 400 });
    }

    const cvRow = await getDataRepositories().cv.get(user.userId);
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

    const row = await getDataRepositories().resumeEditProposals.create({
      sectionId,
      baseVersion: activeVersion.activeVersion,
      baseHash: currentBaseHash,
      originalContent: section.content || "",
      proposedContent,
      reason,
      riskFlags,
    }, user.userId);

    return NextResponse.json({ success: true, data: resumeEditProposalToDTO(row) });
  } catch (err) {
    if (err instanceof Error && err.message === "Not authenticated") {
      return NextResponse.json({ success: false, error: "未登录" }, { status: 401 });
    }
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}
