import { createHash, randomUUID } from "node:crypto";
import type { ExecutionPrincipal } from "@/lib/agent/runtime/durable-agent-run";
import { assembleAgentMemoryContext } from "@/lib/agent/memory-context";
import { stableContentHash } from "@/lib/agent/verified-action";
import { validateResumeSectionContent, type ResumeSectionId } from "@/lib/agent/resume-save-guard";
import { getDataRepositories } from "@/lib/data-repositories";
import { retrieveExcellentResumePatternMemory } from "@/lib/excellent-resume-patterns";
import { buildJudgePrompt, getTemperatureByEffort } from "@/lib/judge-engine";
import { llmRetry } from "@/lib/llm-retry";
import { retrieveReferenceResumeSnippets } from "@/lib/reference-resume-vector";
import { stableResumeHash, type ResumeDraftRecord } from "@/lib/resume/document";
import type { Operation } from "@/types";

export interface ResumeOptimizationInput {
  sectionId: ResumeSectionId;
  instruction?: string;
  operation?: string;
  effort?: number;
  enablePlaceholders?: boolean;
  fast?: boolean;
  roleDirection?: string;
  questionAnswers?: Array<{ question: string; answer: string }>;
  targetJD?: { role?: string; company?: string; keywords?: string[]; text?: string };
  userProfile?: { headline?: string; superpowers?: string[]; targetRoles?: Array<{ name: string; fit?: string }> };
  referenceIds?: number[];
  jdText?: string;
  requestKey?: string;
}

export class ResumeOptimizationInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ResumeOptimizationInputError";
  }
}

export async function optimizeResumeSectionForAgent(
  principal: ExecutionPrincipal,
  input: ResumeOptimizationInput,
  options: { signal?: AbortSignal } = {},
): Promise<{
  sectionId: ResumeSectionId;
  artifactId: string;
  baseVersion: string;
  baseHash: string;
  variants: Array<{ id: string; variantId: string; label: string; approach: string; content: string }>;
  readBackVerified: true;
  referenceMemory: Record<string, unknown>;
}> {
  const repositories = getDataRepositories();
  const cvRow = await repositories.cv.get(principal.userId);
  const cvData = parseObject(cvRow?.data_json);
  const activeVersion = stringValue(cvData.activeVersion);
  const active = parseObject(parseObject(cvData.versions)[activeVersion]);
  const sections = arrayValue(active.sections).map(parseSection).filter(Boolean) as Array<{ id: string; content: string }>;
  if (!activeVersion || sections.length === 0) {
    throw new ResumeOptimizationInputError("CV 数据为空，请先导入或填写简历");
  }
  const fullCV = Object.fromEntries(sections.map((section) => [section.id, section.content]));
  const sectionContent = fullCV[input.sectionId] || "";
  if (sectionContent.trim().length < 20) {
    throw new ResumeOptimizationInputError(`${input.sectionId} 板块内容不足 20 字，无法优化`);
  }
  const baseHash = stableContentHash(active);
  const artifactId = deterministicId("draft_artifact", principal.userId, input.requestKey);
  const existingDrafts = await repositories.resumeDrafts.listByArtifact(artifactId, principal.userId);
  if (existingDrafts.length > 0) {
    if (existingDrafts.some((draft) => draft.base_version !== activeVersion || draft.base_hash !== baseHash)) {
      throw new ResumeOptimizationInputError("同一优化请求的简历基线已经变化，请重新发起优化");
    }
    return buildResult(input.sectionId, artifactId, activeVersion, baseHash, existingDrafts, {});
  }

  const effort = Math.max(1, Math.min(5, Number(input.effort) || 3));
  const operation = normalizeOperation(input.operation);
  const memoryContext = await assembleAgentMemoryContext({
    userId: principal.userId,
    task: "resume_optimization",
    agentId: "resume",
    query: `${input.instruction || ""}\n${stringValue(input.jdText).slice(0, 900)}\n${sectionContent.slice(0, 900)}`,
    budgetChars: 900,
    semanticTopK: 4,
  });
  const referenceIds = Array.isArray(input.referenceIds)
    ? input.referenceIds.map(Number).filter((value) => Number.isFinite(value) && value > 0).slice(0, 3)
    : [];
  const effectiveRoleCategory = input.roleDirection
    && input.roleDirection !== "auto"
    && input.roleDirection !== "generic"
    ? input.roleDirection
    : stringValue(input.targetJD?.role) || stringValue(input.userProfile?.targetRoles?.[0]?.name);
  const [explicitReferences, preferences, snippets, patternMemory] = await Promise.all([
    Promise.all(referenceIds.map((id) => repositories.referenceResumes.get(id, principal.userId)))
      .then((items) => items.filter(Boolean) as Array<{ name: string; sections_json: string }>),
    repositories.preferences.listRecent(principal.userId, 10).catch(() => []),
    retrieveReferenceResumeSnippets({
      userId: principal.userId,
      query: [
        input.instruction || "",
        input.roleDirection || "",
        input.targetJD?.role || "",
        input.targetJD?.company || "",
        input.targetJD?.keywords?.join(" ") || "",
        input.jdText || "",
        sectionContent,
      ].filter(Boolean).join("\n"),
      roleCategory: effectiveRoleCategory,
      sectionType: input.sectionId,
      limit: 4,
    }).catch(() => []),
    retrieveExcellentResumePatternMemory({
      userId: principal.userId,
      roleCategory: effectiveRoleCategory,
      limit: 6,
    }).catch(() => []),
  ]);
  const apiKey = process.env.DEEPSEEK_API_KEY?.trim();
  if (!apiKey) throw new Error("未配置 DEEPSEEK_API_KEY");
  const prompt = buildJudgePrompt({
    sectionId: input.sectionId,
    sectionContent,
    fullCV,
    operation,
    effort,
    enablePlaceholders: input.enablePlaceholders !== false,
    targetJD: input.targetJD as Parameters<typeof buildJudgePrompt>[0]["targetJD"],
    referenceIds,
    referenceResumes: explicitReferences,
    intent: [
      input.instruction || "",
      input.jdText ? `Target JD:\n${input.jdText.slice(0, 1200)}` : "",
      memoryContext.llmSummary ? `Long-term memory context:\n${memoryContext.llmSummary}` : "",
    ].filter(Boolean).join("\n\n"),
    userProfile: input.userProfile as Parameters<typeof buildJudgePrompt>[0]["userProfile"],
    roleDirection: input.roleDirection,
    questionAnswers: input.questionAnswers,
    referenceSnippets: snippets,
    patternMemory,
    preferences,
  });
  const response = await llmRetry("https://api.deepseek.com/chat/completions", apiKey, {
    model: input.fast && !snippets.length && !patternMemory.length
      ? process.env.DEEPSEEK_RESUME_FAST_MODEL?.trim() || "deepseek-v4-flash"
      : process.env.DEEPSEEK_RESUME_MODEL?.trim() || "deepseek-v4-pro",
    messages: [
      { role: "system", content: prompt },
      { role: "user", content: `请优化 ${input.sectionId}，生成改写方案并严格返回 JSON。` },
    ],
    temperature: getTemperatureByEffort(effort),
    max_tokens: 8000,
    response_format: { type: "json_object" },
    retries: 2,
    fallbackModel: process.env.DEEPSEEK_FALLBACK_MODEL,
    signal: options.signal,
  });
  const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
  const parsed = parseModelJson(payload.choices?.[0]?.message?.content || "{}");
  const variants = arrayValue(parsed.variants).slice(0, 6).map(parseObject).filter((variant) => stringValue(variant.content));
  if (variants.length === 0) throw new Error("AI 未生成有效简历优化方案");

  const activeDocument = await repositories.resumeDocuments.getActive(principal.userId);
  const drafts: ResumeDraftRecord[] = variants.flatMap((variant, index) => {
    const content = stringValue(variant.content);
    const validation = validateResumeSectionContent(input.sectionId, content);
    if (!validation.valid) return [];
    return [{
      id: deterministicId(`draft_${index + 1}`, principal.userId, input.requestKey),
      document_id: activeDocument?.id || null,
      artifact_id: artifactId,
      variant_id: stringValue(variant.variantId) || `variant_${index + 1}`,
      title: (stringValue(variant.label) || `方案 ${index + 1}`).slice(0, 160),
      status: "draft",
      base_version: activeVersion,
      base_hash: baseHash,
      patches_json: JSON.stringify([{
        sectionId: input.sectionId,
        originalContent: sectionContent,
        proposedContent: content,
        proposedHash: stableResumeHash(content),
      }]),
      content_json: JSON.stringify({
        sectionId: input.sectionId,
        label: stringValue(variant.label) || `方案 ${index + 1}`,
        content,
        approach: stringValue(variant.approach),
      }),
      integrity_json: JSON.stringify({
        contentHash: stableResumeHash(content),
        compactLength: content.replace(/\s/g, "").length,
        valid: true,
      }),
    }];
  });
  if (drafts.length === 0) throw new Error("优化方案均未通过完整性校验");
  await repositories.resumeDrafts.createArtifact(drafts, principal.userId);
  const readBack = await repositories.resumeDrafts.listByArtifact(artifactId, principal.userId);
  if (!draftReadBackMatches(drafts, readBack)) throw new Error("简历草稿保存后的正文或哈希读回不一致");
  return buildResult(input.sectionId, artifactId, activeVersion, baseHash, readBack, {
    snippetIds: snippets.map((snippet) => snippet.id),
    referenceResumeIds: [...new Set(snippets.map((snippet) => snippet.referenceResumeId))],
    patternMemoryIds: patternMemory.map((pattern) => pattern.id),
    ranking: snippets.map((snippet) => ({
      snippetId: snippet.id,
      referenceResumeId: snippet.referenceResumeId,
      score: snippet.score,
      ranking: snippet.ranking,
    })),
  });
}

function buildResult(
  sectionId: ResumeSectionId,
  artifactId: string,
  baseVersion: string,
  baseHash: string,
  drafts: ResumeDraftRecord[],
  referenceMemory: Record<string, unknown>,
) {
  return {
    sectionId,
    artifactId,
    baseVersion,
    baseHash,
    variants: drafts.map((draft) => {
      const content = parseObject(draft.content_json);
      return {
        id: draft.id,
        variantId: draft.variant_id,
        label: stringValue(content.label) || draft.title,
        approach: stringValue(content.approach),
        content: stringValue(content.content),
      };
    }),
    readBackVerified: true as const,
    referenceMemory,
  };
}

function draftReadBackMatches(expected: ResumeDraftRecord[], actual: ResumeDraftRecord[]): boolean {
  if (expected.length !== actual.length) return false;
  const byId = new Map(actual.map((draft) => [draft.id, draft]));
  return expected.every((draft) => {
    const readBack = byId.get(draft.id);
    if (!readBack || readBack.artifact_id !== draft.artifact_id || readBack.base_hash !== draft.base_hash) return false;
    const content = stringValue(parseObject(readBack.content_json).content);
    return content === stringValue(parseObject(draft.content_json).content)
      && stableResumeHash(content) === stringValue(parseObject(readBack.integrity_json).contentHash);
  });
}

function deterministicId(prefix: string, userId: string, requestKey?: string): string {
  if (!requestKey) return `${prefix}_${randomUUID()}`;
  return `${prefix}_${createHash("sha256").update(`${userId}:${requestKey}`).digest("hex").slice(0, 24)}`;
}

function normalizeOperation(value: unknown): Operation {
  return value === "star" || value === "quantify" || value === "keywords" ? value : "full";
}

function parseSection(value: unknown): { id: string; content: string } | null {
  const section = parseObject(value);
  const id = stringValue(section.id);
  return id ? { id, content: stringValue(section.content) } : null;
}

function parseModelJson(value: string): Record<string, unknown> {
  const normalized = value.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
  try { return parseObject(JSON.parse(normalized)); } catch {
    const match = normalized.match(/\{[\s\S]*\}/);
    if (!match) return {};
    try { return parseObject(JSON.parse(match[0])); } catch { return {}; }
  }
}

function parseObject(value: unknown): Record<string, unknown> {
  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch { return {}; }
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}
