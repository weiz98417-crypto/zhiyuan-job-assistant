import { createHash, randomUUID } from "node:crypto";
import type { ExecutionPrincipal } from "@/lib/agent/runtime/durable-agent-run";
import { assembleAgentMemoryContext } from "@/lib/agent/memory-context";
import { stableContentHash } from "@/lib/agent/verified-action";
import { validateResumeSectionContent, type ResumeSectionId } from "@/lib/agent/resume-save-guard";
import { scoreAgentOutput, BLOCKING_SCORE_THRESHOLD } from "@/lib/agent/llm-scorers";
import type { ChatCompletionRequest, ChatResult } from "@/lib/ai/model-gateway";
import { getDataRepositories } from "@/lib/data-repositories";
import { retrieveExcellentResumePatternMemory } from "@/lib/excellent-resume-patterns";
import { buildJudgePrompt, getTemperatureByEffort } from "@/lib/judge-engine";
import { retrieveReferenceResumeSnippets } from "@/lib/reference-resume-vector";
import { stableResumeHash, type ResumeDraftRecord } from "@/lib/resume/document";
import { checkNumberProvenance, formatProvenanceFeedback } from "@/lib/server/resume-factuality";
import { requestResumeOptimizationModel } from "@/lib/server/resume-optimization-model";
import type { Operation } from "@/types";

export { ResumeOptimizationProviderError } from "@/lib/server/resume-optimization-model";

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
  options: {
    signal?: AbortSignal;
    /** 测试注入：quality scorer 的 LLM 客户端（与 model-gateway complete 同形）。 */
    qualityComplete?: (request: ChatCompletionRequest) => Promise<ChatResult>;
  } = {},
): Promise<{
  sectionId: ResumeSectionId;
  artifactId: string;
  baseVersion: string;
  baseHash: string;
  variants: OptimizedVariant[];
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
  const response = await requestResumeOptimizationModel({
    fast: input.fast && !snippets.length && !patternMemory.length,
    messages: [
      { role: "system", content: prompt },
      { role: "user", content: `请优化 ${input.sectionId}，生成改写方案并严格返回 JSON。` },
    ],
    temperature: getTemperatureByEffort(effort),
    maxTokens: 8000,
    signal: options.signal,
  });
  const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
  const parsed = parseModelJson(payload.choices?.[0]?.message?.content || "{}");
  let candidateVariants = arrayValue(parsed.variants).slice(0, 6).map(parseObject).filter((variant) => stringValue(variant.content));
  if (candidateVariants.length === 0) throw new Error("AI 未生成有效简历优化方案");

  // ── Spec 24 / ADR-0041 产物事实门 ──
  // 硬门（确定性）：数字溯源。软门（LLM Judge）：faithfulness/hallucination。
  const factualitySources = [
    sectionContent,
    ...Object.values(fullCV),
    stringValue(input.jdText),
    [stringValue(input.instruction), ...arrayValue(input.questionAnswers).map((qa) => parseObject(qa)).map((qa) => `${stringValue(qa.question)} ${stringValue(qa.answer)}`)].filter(Boolean).join("\n"),
  ];
  const provenanceOf = (content: string) => checkNumberProvenance(content, factualitySources);

  // 硬门第一遍：任一方案有编造数字嫌疑 → 带违规清单重试一次（仅一次，ADR-0041）
  const firstPassFailures = candidateVariants
    .map((variant) => ({ variant, result: provenanceOf(stringValue(variant.content)) }))
    .filter((entry) => !entry.result.ok);
  if (firstPassFailures.length > 0) {
    const allViolations = firstPassFailures.flatMap((entry) => entry.result.violations);
    const retryResponse = await requestResumeOptimizationModel({
      fast: false,
      messages: [
        { role: "system", content: prompt },
        { role: "user", content: `请优化 ${input.sectionId}，生成改写方案并严格返回 JSON。\n\n${formatProvenanceFeedback({ ok: false, checked: allViolations.length, violations: allViolations })}` },
      ],
      temperature: getTemperatureByEffort(effort),
      maxTokens: 8000,
      signal: options.signal,
    });
    const retryPayload = await retryResponse.json() as { choices?: Array<{ message?: { content?: string } }> };
    const retryParsed = parseModelJson(retryPayload.choices?.[0]?.message?.content || "{}");
    const retryVariants = arrayValue(retryParsed.variants).slice(0, 6).map(parseObject).filter((variant) => stringValue(variant.content));
    const retryPassing = retryVariants.filter((variant) => provenanceOf(stringValue(variant.content)).ok);
    const firstPassPassing = candidateVariants.filter((variant) => provenanceOf(stringValue(variant.content)).ok);
    // 重试只此一次：通过者取两遍并集（按内容去重），仍不通过者淘汰并放弃
    const seenContents = new Set(firstPassPassing.map((variant) => stableResumeHash(stringValue(variant.content))));
    candidateVariants = [...firstPassPassing, ...retryPassing.filter((variant) => !seenContents.has(stableResumeHash(stringValue(variant.content))))];
    if (candidateVariants.length === 0) {
      throw new ResumeOptimizationInputError(
        `数字溯源未通过（重试 1 次后仍失败），${input.sectionId} 保持原文未改动。编造嫌疑数字：${[...new Set(allViolations.map((violation) => violation.token))].slice(0, 12).join("、")}`,
      );
    }
  }

  // 软门：faithfulness/hallucination（Spec 15 评分器推进生产 verify 位）。
  // veto（编造数组非空）→ 淘汰；低分无 veto → 降级「仅供参考」提案。
  const factualityByContent = new Map<string, { advisory: boolean; faithfulnessScore?: number; advisoryReason?: string }>();
  const scoringCandidates = candidateVariants.slice(0, 3); // 通常 2-3 个方案；上限防判官成本失控
  for (const variant of scoringCandidates) {
    const content = stringValue(variant.content);
    try {
      const quality = await scoreAgentOutput({
        taskType: "resume_edit",
        output: content,
        sourceMaterials: factualitySources.map((source) => source || "").filter(Boolean),
        request: stringValue(input.instruction) || undefined,
      }, options.qualityComplete ? { complete: options.qualityComplete } : {});
      const vetoed = quality.hardVetoes.length > 0;
      // Spec 15 语义：blocking 任务低分不进 qualityWarnings（那是 advisory 任务的信号），
      // 生产软门直接用合并分对阈值判定（ADR-0041：低分降级「仅供参考」，不阻断）。
      const lowScore = !vetoed && quality.score < BLOCKING_SCORE_THRESHOLD;
      factualityByContent.set(stableResumeHash(content), {
        advisory: lowScore,
        faithfulnessScore: quality.score,
        advisoryReason: vetoed
          ? `编造判定：${quality.hardVetoes.join(",")}`
          : lowScore
            ? `忠实度评分 ${quality.score} 低于阈值`
            : undefined,
      });
    } catch {
      // 判官不可用不阻塞主链路（软门语义）；无记录 = 未评分
    }
  }
  // veto（编造数组非空）→ 淘汰该方案；低分无 veto → 保留但降级「仅供参考」。
  // 判官配额外（第 4-6 个方案）不裸进草稿：强制降级「仅供参考」（P1-1）
  for (const variant of candidateVariants) {
    const contentHash = stableResumeHash(stringValue(variant.content));
    if (!factualityByContent.has(contentHash)) {
      factualityByContent.set(contentHash, { advisory: true, advisoryReason: "判官评分配额外，未评分——按仅供参考处理" });
    }
  }
  const survivingVariants = candidateVariants.filter((variant) => {
    const factuality = factualityByContent.get(stableResumeHash(stringValue(variant.content)));
    return !factuality || !factuality.advisoryReason?.startsWith("编造判定");
  });
  if (survivingVariants.length === 0) {
    const reasons = [...factualityByContent.values()].map((entry) => entry.advisoryReason).filter(Boolean).join("；");
    throw new ResumeOptimizationInputError(`产物未通过忠实度校验（重试后仍失败），${input.sectionId} 保持原文未改动。${reasons}`);
  }
  candidateVariants = survivingVariants;

  const activeDocument = await repositories.resumeDocuments.getActive(principal.userId);
  const drafts: ResumeDraftRecord[] = candidateVariants.flatMap((variant, index) => {
    const content = stringValue(variant.content);
    const validation = validateResumeSectionContent(input.sectionId, content);
    if (!validation.valid) return [];
    const provenance = provenanceOf(content);
    const factuality = factualityByContent.get(stableResumeHash(content));
    const advisory = factuality?.advisory === true;
    const label = (stringValue(variant.label) || `方案 ${index + 1}`).slice(0, 140);
    return [{
      id: deterministicId(`draft_${index + 1}`, principal.userId, input.requestKey),
      document_id: activeDocument?.id || null,
      artifact_id: artifactId,
      variant_id: stringValue(variant.variantId) || `variant_${index + 1}`,
      title: advisory ? `仅供参考：${label}` : label,
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
        label: advisory ? `仅供参考：${label}` : label,
        content,
        approach: stringValue(variant.approach),
        advisory,
        factuality: {
          provenanceChecked: provenance.checked,
          provenanceOk: provenance.ok,
          faithfulnessScore: factuality?.faithfulnessScore,
          advisoryReason: factuality?.advisoryReason,
        },
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

export interface OptimizedVariant {
  id: string;
  variantId: string;
  label: string;
  approach: string;
  content: string;
  advisory?: boolean;
  factuality?: { provenanceChecked?: number; faithfulnessScore?: number; advisoryReason?: string };
}

function buildResult(
  sectionId: ResumeSectionId,
  artifactId: string,
  baseVersion: string,
  baseHash: string,
  drafts: ResumeDraftRecord[],
  referenceMemory: Record<string, unknown>,
): {
  sectionId: ResumeSectionId;
  artifactId: string;
  baseVersion: string;
  baseHash: string;
  variants: OptimizedVariant[];
  readBackVerified: true;
  referenceMemory: Record<string, unknown>;
} {
  return {
    sectionId,
    artifactId,
    baseVersion,
    baseHash,
    variants: drafts.map((draft) => {
      const content = parseObject(draft.content_json);
      const factuality = parseObject(content.factuality);
      return {
        id: draft.id,
        variantId: draft.variant_id,
        label: stringValue(content.label) || draft.title,
        approach: stringValue(content.approach),
        content: stringValue(content.content),
        ...(content.advisory === true ? { advisory: true as const } : {}),
        ...(Object.keys(factuality).length > 0
          ? { factuality: factuality as { provenanceChecked?: number; faithfulnessScore?: number; advisoryReason?: string } }
          : {}),
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
