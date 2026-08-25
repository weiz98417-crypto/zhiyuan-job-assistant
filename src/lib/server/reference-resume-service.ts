import type { ExecutionPrincipal } from "@/lib/agent/runtime/durable-agent-run";
import { getDataRepositories } from "@/lib/data-repositories";
import { persistExcellentResumePatternsBestEffort } from "@/lib/excellent-resume-patterns";
import { stableHash } from "@/lib/memory/vector-memory";
import {
  buildReferenceResumeRawText,
  indexReferenceResumeBestEffort,
  looksLikeResumeText,
  normalizeReferenceVisibility,
  normalizeRoleCategory,
  redactReferenceResumeText,
  scoreReferenceResumeQuality,
} from "@/lib/reference-resume-vector";
import { resumeSectionsToCvSections } from "@/lib/resume/document";
import { parseResumeTextInChunks } from "@/lib/server/resume-import-service";

export interface SaveReferenceResumeInput {
  resumeText: string;
  name?: string;
  roleCategory: string;
  visibility?: "private" | "team";
  tags?: string[];
  notes?: string;
}

export async function saveReferenceResumeForAgent(
  principal: ExecutionPrincipal,
  input: SaveReferenceResumeInput,
  options: { signal?: AbortSignal } = {},
): Promise<Record<string, unknown> & { id: number; name: string; roleCategory: string; readBackVerified: true }> {
  const rawText = input.resumeText.trim();
  if (!looksLikeResumeText(rawText)) throw new Error("上传内容不像一份完整简历");
  const roleCategory = normalizeRoleCategory(input.roleCategory, rawText);
  if (!roleCategory || roleCategory === "general") throw new Error("保存优秀简历前需要确认具体岗位方向");
  const parsed = await parseResumeTextInChunks(rawText, options.signal);
  const sections = resumeSectionsToCvSections(parsed.sections);
  const rawTextForIndex = buildReferenceResumeRawText(sections, rawText);
  const sourceHash = stableHash(rawTextForIndex);
  const repositories = getDataRepositories();
  const duplicate = await repositories.referenceResumes.findBySourceHash(sourceHash, principal.userId);
  if (duplicate) {
    return {
      id: duplicate.id,
      name: duplicate.name,
      roleCategory: duplicate.role_category || roleCategory,
      visibility: duplicate.visibility || "private",
      status: duplicate.status || "active",
      qualityScore: Number(duplicate.quality_score || 0),
      duplicate: true,
      readBackVerified: true,
    };
  }
  const qualityScore = scoreReferenceResumeQuality({ rawText: rawTextForIndex, sections });
  const requestedVisibility = normalizeReferenceVisibility(input.visibility || "private");
  const visibility = requestedVisibility === "team" ? "team_pending" : requestedVisibility;
  const status = visibility === "team_pending" ? "pending" : visibility === "disabled" ? "disabled" : "active";
  const anonymized = visibility !== "private";
  const redactedText = redactReferenceResumeText(rawTextForIndex);
  const baseName = input.name?.trim() || `参考简历-${roleCategory}`;
  const name = await repositories.referenceResumes.nameExists(baseName, undefined, principal.userId)
    ? `${baseName}-${sourceHash.slice(0, 8)}`
    : baseName;
  const tags = inferTags(sections.map((section) => section.content).join(" "), input.tags || [], roleCategory);
  const id = await repositories.referenceResumes.insert({
    name,
    source: "paste",
    sections_json: JSON.stringify(sections),
    raw_text: rawTextForIndex,
    tags: JSON.stringify(tags),
    notes: input.notes || "",
    role_category: roleCategory,
    visibility,
    status,
    quality_score: qualityScore,
    anonymized,
    shared_text_redacted: anonymized ? redactedText : "",
    source_hash: sourceHash,
    metadata_json: JSON.stringify({ saveAsExcellent: true, requestedVisibility, roleCategory, qualityScore }),
  }, principal.userId);
  const readBack = await repositories.referenceResumes.get(id, principal.userId);
  if (
    !readBack
    || readBack.id !== id
    || readBack.name !== name
    || readBack.role_category !== roleCategory
    || readBack.source_hash !== sourceHash
  ) {
    throw new Error("优秀简历保存后读回校验失败");
  }
  const [indexing, patternMemory] = await Promise.all([
    indexReferenceResumeBestEffort({
      referenceResumeId: id,
      ownerUserId: principal.userId,
      name,
      sections,
      rawText: anonymized ? redactedText : rawTextForIndex,
      roleCategory,
      visibility,
      status,
      qualityScore,
    }).catch((error) => ({ status: "failed", chunks: 0, embedded: 0, failed: 0, reason: error instanceof Error ? error.message : String(error) })),
    persistExcellentResumePatternsBestEffort({
      userId: principal.userId,
      referenceResumeId: id,
      sections,
      rawText: anonymized ? redactedText : rawTextForIndex,
      roleCategory,
      visibility,
    }).catch((error) => ({ status: "failed", extracted: 0, persisted: 0, reason: error instanceof Error ? error.message : String(error) })),
  ]);
  return {
    id,
    name,
    source: "paste",
    sections,
    tags,
    roleCategory,
    visibility,
    status,
    qualityScore,
    anonymized,
    indexing,
    patternMemory,
    readBackVerified: true,
  };
}

function inferTags(content: string, requested: string[], roleCategory: string): string[] {
  const tags = new Set(requested.map(String).map((tag) => tag.trim()).filter(Boolean));
  const patterns: Array<[RegExp, string]> = [
    [/产品经理/g, "产品经理"],
    [/后端|Java|Go|Python|Node\.js/g, "后端开发"],
    [/前端|React|Vue|TypeScript/g, "前端开发"],
    [/算法|机器学习|深度学习/g, "AI/算法"],
    [/数据|SQL|数据分析/g, "数据"],
    [/设计|Figma|UI|UX/g, "设计"],
    [/运营/g, "运营"],
  ];
  for (const [pattern, tag] of patterns) if (pattern.test(content)) tags.add(tag);
  tags.add(roleCategory);
  return Array.from(tags);
}
