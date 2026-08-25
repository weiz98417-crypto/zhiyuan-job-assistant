import { createHash, randomUUID } from "node:crypto";
import type { ExecutionPrincipal } from "@/lib/agent/runtime/durable-agent-run";
import { assembleAgentMemoryContext } from "@/lib/agent/memory-context";
import { stableContentHash } from "@/lib/agent/verified-action";
import { validateResumeSectionContent, type ResumeSectionId } from "@/lib/agent/resume-save-guard";
import { getDataRepositories } from "@/lib/data-repositories";
import { llmRetry } from "@/lib/llm-retry";
import { stableResumeHash, type ResumeDraftRecord } from "@/lib/resume/document";

const SECTION_IDS: ResumeSectionId[] = ["summary", "experience", "projects", "education", "skills"];

export interface ResumeGenerationInput {
  jdText: string;
  language?: string;
  targetRole?: string;
  referenceIds?: number[];
  requestKey?: string;
}

export class ResumeGenerationInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ResumeGenerationInputError";
  }
}

export async function generateResumeDraftForAgent(
  principal: ExecutionPrincipal,
  input: ResumeGenerationInput,
  options: { signal?: AbortSignal } = {},
): Promise<{
  artifactId: string;
  baseVersion: string;
  baseHash: string;
  drafts: Array<{ id: string; sectionId: ResumeSectionId; label: string; content: string }>;
  readBackVerified: true;
}> {
  const jdText = String(input.jdText || "").trim();
  if (jdText.length < 50) throw new ResumeGenerationInputError("请提供至少 50 字的完整 JD");
  const repositories = getDataRepositories();
  const cvRow = await repositories.cv.get(principal.userId);
  const cvData = parseObject(cvRow?.data_json);
  const baseVersion = stringValue(cvData.activeVersion);
  const active = parseObject(parseObject(cvData.versions)[baseVersion]);
  const currentSections = arrayValue(active.sections).flatMap((value) => {
    const section = parseObject(value);
    const id = stringValue(section.id) as ResumeSectionId;
    return SECTION_IDS.includes(id) ? [{ id, content: stringValue(section.content) }] : [];
  });
  if (!baseVersion || currentSections.length === 0) {
    throw new ResumeGenerationInputError("当前简历为空，请先导入或填写简历");
  }
  const baseHash = stableContentHash(active);
  const artifactId = deterministicId("draft_artifact_cv", principal.userId, input.requestKey);
  const existing = await repositories.resumeDrafts.listByArtifact(artifactId, principal.userId);
  if (existing.length > 0) {
    if (existing.some((draft) => draft.base_version !== baseVersion || draft.base_hash !== baseHash)) {
      throw new ResumeGenerationInputError("同一生成请求的简历基线已经变化，请重新发起");
    }
    return resultFromDrafts(artifactId, baseVersion, baseHash, existing);
  }

  const referenceIds = Array.isArray(input.referenceIds)
    ? input.referenceIds.map(Number).filter((id) => Number.isFinite(id) && id > 0).slice(0, 3)
    : [];
  const references = await Promise.all(referenceIds.map((id) => repositories.referenceResumes.get(id, principal.userId)));
  const memory = await assembleAgentMemoryContext({
    userId: principal.userId,
    task: "resume_optimization",
    agentId: "resume",
    query: `${input.targetRole || ""}\n${jdText.slice(0, 1200)}`,
    budgetChars: 900,
    semanticTopK: 4,
  });
  const apiKey = process.env.DEEPSEEK_API_KEY?.trim();
  if (!apiKey) throw new Error("未配置 DEEPSEEK_API_KEY");
  const response = await llmRetry("https://api.deepseek.com/chat/completions", apiKey, {
    model: process.env.DEEPSEEK_RESUME_MODEL?.trim() || "deepseek-v4-pro",
    messages: [
      {
        role: "system",
        content: `你是严谨的简历定制专家。只能重组和润色原简历已有事实，禁止编造经历、数字、公司、项目或技能。针对 JD 强化相关关键词并保持完整。严格返回 JSON：{"sections":[{"id":"summary|experience|projects|education|skills","label":"定制版","content":"完整正文"}]}`,
      },
      {
        role: "user",
        content: [
          `目标岗位：${input.targetRole || "从 JD 推断"}`,
          `语言：${input.language || "zh"}`,
          `JD：\n${jdText.slice(0, 6000)}`,
          `原简历：\n${currentSections.map((section) => `【${section.id}】\n${section.content}`).join("\n\n").slice(0, 9000)}`,
          references.filter(Boolean).length ? `参考简历仅用于风格，不得复制事实：\n${references.filter(Boolean).map((row) => String(row?.sections_json || "")).join("\n").slice(0, 2500)}` : "",
          memory.llmSummary ? `长期记忆：\n${memory.llmSummary}` : "",
        ].filter(Boolean).join("\n\n"),
      },
    ],
    temperature: 0.25,
    max_tokens: 10000,
    response_format: { type: "json_object" },
    retries: 2,
    fallbackModel: process.env.DEEPSEEK_FALLBACK_MODEL,
    signal: options.signal,
    timeout: 180_000,
  });
  const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
  const parsed = parseModelJson(payload.choices?.[0]?.message?.content || "{}");
  const generated = normalizeGeneratedSections(parsed);
  const activeDocument = await repositories.resumeDocuments.getActive(principal.userId);
  const drafts: ResumeDraftRecord[] = generated.flatMap((section, index) => {
    const validation = validateResumeSectionContent(section.id, section.content);
    if (!validation.valid) return [];
    const originalContent = currentSections.find((current) => current.id === section.id)?.content || "";
    return [{
      id: deterministicId(`draft_cv_${section.id}`, principal.userId, input.requestKey || String(index)),
      document_id: activeDocument?.id || null,
      artifact_id: artifactId,
      variant_id: `targeted_${section.id}`,
      title: section.label,
      status: "draft",
      base_version: baseVersion,
      base_hash: baseHash,
      patches_json: JSON.stringify([{
        sectionId: section.id,
        originalContent,
        proposedContent: section.content,
        proposedHash: stableResumeHash(section.content),
      }]),
      content_json: JSON.stringify({
        sectionId: section.id,
        label: section.label,
        content: section.content,
        approach: "jd_targeted",
      }),
      integrity_json: JSON.stringify({ contentHash: stableResumeHash(section.content), valid: true }),
    }];
  });
  if (drafts.length === 0) throw new Error("AI 未生成通过完整性校验的简历草稿");
  await repositories.resumeDrafts.createArtifact(drafts, principal.userId);
  const readBack = await repositories.resumeDrafts.listByArtifact(artifactId, principal.userId);
  if (!draftReadBackMatches(drafts, readBack)) throw new Error("简历草稿持久化后读回校验失败");
  return resultFromDrafts(artifactId, baseVersion, baseHash, readBack);
}

function resultFromDrafts(artifactId: string, baseVersion: string, baseHash: string, drafts: ResumeDraftRecord[]) {
  return {
    artifactId,
    baseVersion,
    baseHash,
    drafts: drafts.flatMap((draft) => {
      const content = parseObject(draft.content_json);
      const sectionId = stringValue(content.sectionId) as ResumeSectionId;
      return SECTION_IDS.includes(sectionId) ? [{
        id: draft.id,
        sectionId,
        label: stringValue(content.label) || draft.title,
        content: stringValue(content.content),
      }] : [];
    }),
    readBackVerified: true as const,
  };
}

function normalizeGeneratedSections(parsed: Record<string, unknown>): Array<{ id: ResumeSectionId; label: string; content: string }> {
  const raw = Array.isArray(parsed.sections)
    ? parsed.sections
    : SECTION_IDS.map((id) => ({ id, content: parsed[id] }));
  return raw.flatMap((value) => {
    const section = parseObject(value);
    const id = stringValue(section.id) as ResumeSectionId;
    const content = stringValue(section.content);
    if (!SECTION_IDS.includes(id) || !content) return [];
    return [{ id, label: stringValue(section.label) || `${id} 定制版`, content }];
  });
}

function draftReadBackMatches(expected: ResumeDraftRecord[], actual: ResumeDraftRecord[]): boolean {
  if (expected.length !== actual.length) return false;
  const byId = new Map(actual.map((draft) => [draft.id, draft]));
  return expected.every((draft) => {
    const readBack = byId.get(draft.id);
    if (!readBack || readBack.base_hash !== draft.base_hash) return false;
    const content = stringValue(parseObject(readBack.content_json).content);
    return content === stringValue(parseObject(draft.content_json).content)
      && stableResumeHash(content) === stringValue(parseObject(readBack.integrity_json).contentHash);
  });
}

function deterministicId(prefix: string, userId: string, requestKey?: string): string {
  return requestKey
    ? `${prefix}_${createHash("sha256").update(`${userId}:${requestKey}`).digest("hex").slice(0, 24)}`
    : `${prefix}_${randomUUID()}`;
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
