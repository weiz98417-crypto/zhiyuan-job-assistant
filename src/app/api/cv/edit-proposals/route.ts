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

    const row = await getDataRepositories().resumeEditProposals.create({
      sectionId,
      baseVersion: activeVersion.activeVersion,
      baseHash: stableContentHash(activeVersion.active),
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
