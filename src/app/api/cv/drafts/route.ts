import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getDataRepositories } from "@/lib/data-repositories";
import { stableContentHash } from "@/lib/agent/verified-action";
import { validateResumeSectionContent, type ResumeSectionId } from "@/lib/agent/resume-save-guard";
import { stableResumeHash, type ResumeDraftRecord } from "@/lib/resume/document";

const SECTION_IDS = new Set<ResumeSectionId>(["summary", "experience", "projects", "education", "skills"]);

type CVSection = { id: string; content?: string };
type CVVersion = { sections?: CVSection[] };

export async function GET(request: Request) {
  try {
    const user = await getCurrentUser();
    const url = new URL(request.url);
    const id = url.searchParams.get("id") || "";
    const artifactId = url.searchParams.get("artifactId") || "";
    if (id) {
      const draft = await getDataRepositories().resumeDrafts.get(id, user.userId);
      return draft
        ? NextResponse.json({ success: true, data: draftToDTO(draft) })
        : NextResponse.json({ success: false, error: "简历草稿不存在" }, { status: 404 });
    }
    if (!artifactId) return NextResponse.json({ success: false, error: "缺少 artifactId" }, { status: 400 });
    const drafts = await getDataRepositories().resumeDrafts.listByArtifact(artifactId, user.userId);
    return NextResponse.json({ success: true, data: drafts.map(draftToDTO) });
  } catch (error) {
    if (error instanceof Error && error.message === "Not authenticated") {
      return NextResponse.json({ success: false, error: "未登录" }, { status: 401 });
    }
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    const body = await request.json().catch(() => ({}));
    const sectionId = String(body.sectionId || body.section || "") as ResumeSectionId;
    const variants = Array.isArray(body.variants) ? body.variants.slice(0, 6) as Array<Record<string, unknown>> : [];
    if (!SECTION_IDS.has(sectionId)) return NextResponse.json({ success: false, error: "无效的简历板块" }, { status: 400 });
    if (!variants.length) return NextResponse.json({ success: false, error: "没有可保存的优化方案" }, { status: 400 });

    const repositories = getDataRepositories();
    const cvRow = await repositories.cv.get(user.userId);
    const cvData = cvRow?.data_json ? JSON.parse(cvRow.data_json) as Record<string, unknown> : {};
    const activeVersion = String(cvData.activeVersion || "");
    const versions = cvData.versions && typeof cvData.versions === "object"
      ? cvData.versions as Record<string, CVVersion>
      : {};
    const active = versions[activeVersion];
    const originalContent = active?.sections?.find((section) => section.id === sectionId)?.content || "";
    if (!activeVersion || !active?.sections) {
      return NextResponse.json({ success: false, error: "CV 数据为空，请先导入或填写简历" }, { status: 400 });
    }

    const artifactId = `draft_artifact_${randomUUID()}`;
    const activeDocument = await repositories.resumeDocuments.getActive(user.userId);
    const baseHash = stableContentHash(active);
    const drafts: ResumeDraftRecord[] = [];
    for (let index = 0; index < variants.length; index += 1) {
      const variant = variants[index];
      const content = String(variant.content || "").trim();
      const validation = validateResumeSectionContent(sectionId, content);
      if (!validation.valid) continue;
      const draft: ResumeDraftRecord = {
        id: `draft_${randomUUID()}`,
        document_id: activeDocument?.id || null,
        artifact_id: artifactId,
        variant_id: String(variant.variantId || `variant_${index + 1}`),
        title: String(variant.label || `方案 ${index + 1}`).slice(0, 160),
        status: "draft",
        base_version: activeVersion,
        base_hash: baseHash,
        patches_json: JSON.stringify([{
          sectionId,
          originalContent,
          proposedContent: content,
          proposedHash: stableResumeHash(content),
        }]),
        content_json: JSON.stringify({
          sectionId,
          label: String(variant.label || `方案 ${index + 1}`),
          content,
          approach: String(variant.approach || ""),
        }),
        integrity_json: JSON.stringify({
          contentHash: stableResumeHash(content),
          compactLength: content.replace(/\s/g, "").length,
          valid: true,
        }),
      };
      drafts.push(draft);
    }

    if (!drafts.length) {
      return NextResponse.json({ success: false, error: "优化方案均未通过完整性校验" }, { status: 400 });
    }
    const saved = await repositories.resumeDrafts.createArtifact(drafts, user.userId);
    const readBack = await repositories.resumeDrafts.listByArtifact(artifactId, user.userId);
    if (!draftReadBackMatches(saved, readBack)) {
      return NextResponse.json({ success: false, error: "简历草稿保存后的正文或哈希读回不一致" }, { status: 500 });
    }
    return NextResponse.json({
      success: true,
      data: {
        artifactId,
        sectionId,
        baseVersion: activeVersion,
        baseHash,
        variants: readBack.map(draftToDTO),
        readBackVerified: true,
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Not authenticated") {
      return NextResponse.json({ success: false, error: "未登录" }, { status: 401 });
    }
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}

function draftToDTO(draft: ResumeDraftRecord) {
  const content = parseJson(draft.content_json);
  const patches = parseJsonArray(draft.patches_json);
  return {
    id: draft.id,
    artifactId: draft.artifact_id,
    variantId: draft.variant_id,
    documentId: draft.document_id || null,
    title: draft.title,
    status: draft.status,
    baseVersion: draft.base_version,
    baseHash: draft.base_hash,
    sectionId: content.sectionId || patches[0]?.sectionId || "",
    label: content.label || draft.title,
    content: content.content || patches[0]?.proposedContent || "",
    approach: content.approach || "",
    patches,
    integrity: parseJson(draft.integrity_json),
    createdAt: draft.created_at,
    updatedAt: draft.updated_at,
  };
}

function parseJson(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch { return {}; }
}

function parseJsonArray(value: string): Array<Record<string, unknown>> {
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed.filter((item) => item && typeof item === "object") : [];
  } catch { return []; }
}

function draftReadBackMatches(expected: ResumeDraftRecord[], actual: ResumeDraftRecord[]): boolean {
  if (expected.length !== actual.length) return false;
  const actualById = new Map(actual.map((draft) => [draft.id, draft]));
  return expected.every((draft) => {
    const readBack = actualById.get(draft.id);
    if (!readBack || readBack.artifact_id !== draft.artifact_id || readBack.base_hash !== draft.base_hash) return false;
    const expectedContent = String(parseJson(draft.content_json).content || "");
    const actualContent = String(parseJson(readBack.content_json).content || "");
    return expectedContent === actualContent && stableResumeHash(actualContent) === String(parseJson(readBack.integrity_json).contentHash || "");
  });
}
