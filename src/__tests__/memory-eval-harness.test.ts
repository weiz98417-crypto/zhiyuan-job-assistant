import { describe, expect, it } from "vitest";
import {
  buildPendingReferenceResumeSave,
  buildPendingReferenceResumeSaveFromImage,
  completePendingReferenceResumeSave,
} from "@/lib/agent/reference-resume-save-flow";
import { extractExcellentResumePatterns } from "@/lib/excellent-resume-patterns";
import {
  buildMemoryEvalReport,
  computeCopyOverlapScore,
  createMemoryEvalEmbeddingProvider,
  detectMemoryPolicyViolations,
  formatMemoryEvalReport,
  runEmbeddingFailureEval,
  runReferenceRetrievalEval,
  selectActivePatternGuidance,
  scoreResumeOptimizationOutput,
} from "@/lib/memory/eval-harness";
import { chunkMemorySource, type EmbeddingProvider } from "@/lib/memory/vector-memory";
import {
  aiPmExcellentResumeSections,
  aiPmExcellentResumeText,
  boundaryImageFixtures,
  copiedOptimizationOutput,
  memoryEnabledOptimizationOutput,
  memoryEvalSources,
  noMemoryOptimizationOutput,
  patternGuidanceFixtures,
  referenceEvalFixtures,
  targetAiPmJd,
  targetUserResumeSection,
} from "@/__tests__/fixtures/memory-eval-fixtures";

const saveIntent = "把这份简历保存成AI产品经理优秀简历";

describe("memory eval fixtures", () => {
  it("defines the AI PM wedge fixtures used by deterministic evals", () => {
    expect(aiPmExcellentResumeSections).toHaveLength(5);
    expect(aiPmExcellentResumeText).toContain("RAG");
    expect(targetUserResumeSection).toContain("BioLid");
    expect(targetAiPmJd).toContain("AI agent workflows");
    expect(referenceEvalFixtures.some((item) => item.ownerUserId === "user-b" && item.visibility === "private")).toBe(true);
    expect(boundaryImageFixtures.jd.documentType).toBe("jd");
    expect(boundaryImageFixtures.offer.documentType).toBe("offer");
    expect(boundaryImageFixtures.unrelated.documentType).toBe("chat_screenshot");
  });
});

describe("deterministic memory eval harness", () => {
  it("creates repeatable 1536-dimensional mock embeddings", async () => {
    const provider = createMemoryEvalEmbeddingProvider();

    const [first] = await provider.embed(["RAG agent workflow metrics"]);
    const [second] = await provider.embed(["RAG agent workflow metrics"]);

    expect(first).toEqual(second);
    expect(first).toHaveLength(1536);
    expect(Math.hypot(...first)).toBeCloseTo(1, 5);
  });

  it("runs seeded reference retrieval and collects ranked source labels", () => {
    const retrieved = runReferenceRetrievalEval({
      userId: "user-a",
      query: `${targetUserResumeSection}\n${targetAiPmJd}`,
      roleCategory: "AI Product Manager",
      sectionType: "projects",
      references: referenceEvalFixtures,
      limit: 3,
    });

    expect(retrieved.map((item) => item.referenceId)).toContain(101);
    expect(retrieved.map((item) => item.referenceId)).toContain(104);
    expect(retrieved.map((item) => item.referenceId)).not.toContain(103);
    expect(retrieved.map((item) => item.referenceId)).not.toContain(105);
    expect(retrieved[0].sourceLabel).toMatch(/^reference_resume:/);
  });

  it("reports retrieval hits, source labels, quality delta, copy overlap, and policy violations", () => {
    const retrieved = runReferenceRetrievalEval({
      userId: "user-a",
      query: `${targetUserResumeSection}\n${targetAiPmJd}`,
      roleCategory: "AI Product Manager",
      sectionType: "projects",
      references: referenceEvalFixtures,
      limit: 3,
    });

    const report = buildMemoryEvalReport({
      expectedReferenceIds: [101],
      retrieved,
      taskType: "resume_optimization",
      userId: "user-a",
      sources: memoryEvalSources,
      noMemoryOutput: noMemoryOptimizationOutput,
      memoryOutput: memoryEnabledOptimizationOutput,
      referenceTexts: [referenceEvalFixtures[0].text],
    });

    expect(report.retrievalHitAtK).toBe(true);
    expect(report.sourceLabels.length).toBeGreaterThan(0);
    expect(report.qualityDelta).toBeGreaterThan(0);
    expect(report.copyOverlapScore).toBeLessThan(0.25);
    expect(report.policyViolations).toHaveLength(0);
    expect(formatMemoryEvalReport(report)).toContain("retrieval_hit_at_k: true");
  });
});

describe("memory baseline evals", () => {
  it("baseline: pasted excellent resume save can be chunked and embedded", async () => {
    const pending = buildPendingReferenceResumeSave({
      userText: saveIntent,
      resumeText: aiPmExcellentResumeText,
      source: "paste",
      structured: { roleCategory: "AI Product Manager", name: "Redacted Candidate" },
    });

    expect(pending?.roleCategory).toBe("ai_product_manager");
    const completed = completePendingReferenceResumeSave(pending!, "confirm");
    expect(completed).toMatchObject({
      role_category: "ai_product_manager",
      visibility: "private",
    });

    const chunks = chunkMemorySource({
      userId: "user-a",
      sourceType: "reference_resume",
      sourceId: "101",
      title: "Redacted AI PM Reference A",
      text: aiPmExcellentResumeText,
      metadata: { roleCategory: "ai_product_manager", sectionType: "projects" },
    });
    const provider = createMemoryEvalEmbeddingProvider();
    const embedded = await provider.embed(chunks.map((chunk) => chunk.chunkText));

    expect(chunks.length).toBeGreaterThan(0);
    expect(embedded[0]).toHaveLength(1536);
  });

  it("baseline: screenshot-extracted resume asks one role follow-up and preserves text", () => {
    const pending = buildPendingReferenceResumeSaveFromImage(
      "保存成优秀简历",
      1,
      { ...boundaryImageFixtures.resume, structured: undefined },
    );

    expect(pending?.resumeText).toContain("RAG");
    expect(pending?.roleCategory).toBeUndefined();
    expect(completePendingReferenceResumeSave(pending!, "AI Product Manager")).toMatchObject({
      role_category: "ai_product_manager",
    });
  });

  it("baseline: resume optimization retrieves role-relevant snippets and pattern guidance", () => {
    const retrieved = runReferenceRetrievalEval({
      userId: "user-a",
      query: `${targetUserResumeSection}\n${targetAiPmJd}`,
      roleCategory: "AI Product Manager",
      sectionType: "projects",
      references: referenceEvalFixtures,
      limit: 3,
    });
    const patterns = extractExcellentResumePatterns({
      sections: aiPmExcellentResumeSections,
      roleCategory: "ai_product_manager",
      referenceResumeId: 101,
    });

    expect(retrieved.some((item) => item.roleCategory === "ai_product_manager")).toBe(true);
    expect(patterns.length).toBeGreaterThan(0);
    expect(patterns[0].canonicalText).not.toContain("Owned a 0-to-1 RAG knowledge base");
  });
});

describe("memory boundary evals", () => {
  it("boundary: unrelated, JD, and offer screenshots do not enter excellent-resume save flow", () => {
    expect(buildPendingReferenceResumeSaveFromImage(saveIntent, 1, boundaryImageFixtures.unrelated)).toBeNull();
    expect(buildPendingReferenceResumeSaveFromImage(saveIntent, 1, boundaryImageFixtures.jd)).toBeNull();
    expect(buildPendingReferenceResumeSaveFromImage(saveIntent, 1, boundaryImageFixtures.offer)).toBeNull();
  });

  it("boundary: private references never cross users and team references require approval", () => {
    const retrieved = runReferenceRetrievalEval({
      userId: "user-a",
      query: `${targetUserResumeSection}\n${targetAiPmJd}`,
      roleCategory: "AI Product Manager",
      sectionType: "projects",
      references: referenceEvalFixtures,
      limit: 10,
    });

    expect(retrieved.map((item) => item.referenceId)).toContain(104);
    expect(retrieved.map((item) => item.referenceId)).not.toContain(103);
    expect(retrieved.map((item) => item.referenceId)).not.toContain(105);
  });

  it("boundary: JD and offer tasks fail if raw excellent-resume snippets are injected", () => {
    const jdViolations = detectMemoryPolicyViolations({
      taskType: "jd_evaluation",
      userId: "user-a",
      sources: memoryEvalSources,
    });
    const offerViolations = detectMemoryPolicyViolations({
      taskType: "offer_evaluation",
      userId: "user-a",
      sources: memoryEvalSources,
    });

    expect(jdViolations.some((item) => item.reason.includes("raw excellent resume"))).toBe(true);
    expect(offerViolations.some((item) => item.reason.includes("raw excellent resume"))).toBe(true);
  });

  it("boundary: optimized output transfers structure without copying long source phrases", () => {
    const transformedOverlap = computeCopyOverlapScore(memoryEnabledOptimizationOutput, [referenceEvalFixtures[0].text]);
    const copiedOverlap = computeCopyOverlapScore(copiedOptimizationOutput, [referenceEvalFixtures[0].text]);

    expect(transformedOverlap).toBeLessThan(0.25);
    expect(copiedOverlap).toBeGreaterThan(transformedOverlap);
    expect(scoreResumeOptimizationOutput(memoryEnabledOptimizationOutput)).toBeGreaterThan(scoreResumeOptimizationOutput(noMemoryOptimizationOutput));
  });
});

describe("memory regression evals", () => {
  it("regression: accepted snippets move up and rejected snippets move down", () => {
    const baseReferences = referenceEvalFixtures.filter((item) => item.id === 101 || item.id === 102);
    const accepted = runReferenceRetrievalEval({
      userId: "user-a",
      query: "AI product manager RAG agent workflow metrics",
      roleCategory: "AI Product Manager",
      references: baseReferences.map((item) => item.id === 102 ? { ...item, acceptedCount: 8, rejectedCount: 0 } : { ...item, acceptedCount: 0, rejectedCount: 0 }),
      limit: 2,
    });
    const rejected = runReferenceRetrievalEval({
      userId: "user-a",
      query: "AI product manager RAG agent workflow metrics",
      roleCategory: "AI Product Manager",
      references: baseReferences.map((item) => item.id === 102 ? { ...item, acceptedCount: 0, rejectedCount: 8 } : { ...item, acceptedCount: 0, rejectedCount: 0 }),
      limit: 2,
    });

    const acceptedScore = accepted.find((item) => item.referenceId === 102)?.score || 0;
    const rejectedScore = rejected.find((item) => item.referenceId === 102)?.score || 0;

    expect(acceptedScore).toBeGreaterThan(rejectedScore);
  });

  it("regression: weak candidate patterns are not retrieved as active guidance", () => {
    const guidance = selectActivePatternGuidance(patternGuidanceFixtures);

    expect(guidance).toHaveLength(1);
    expect(guidance[0].id).toBe("active-good");
    expect(guidance.map((item) => item.id)).not.toContain("candidate-weak");
    expect(guidance.map((item) => item.id)).not.toContain("rejected");
  });

  it("regression: embedding failures preserve source chunks and expose reindex state", async () => {
    const chunks = chunkMemorySource({
      userId: "user-a",
      sourceType: "reference_resume",
      sourceId: "101",
      text: aiPmExcellentResumeText,
      metadata: { roleCategory: "ai_product_manager" },
    });
    const provider: EmbeddingProvider = {
      model: "failing-eval-provider",
      dimension: 1536,
      async embed() {
        throw new Error("provider unavailable");
      },
    };

    const result = await runEmbeddingFailureEval({ chunks, provider });

    expect(result.savedReferencePreserved).toBe(true);
    expect(result.failed).toBe(chunks.length);
    expect(result.embedded).toBe(0);
    expect(result.reindexableChunkHashes).toHaveLength(chunks.length);
  });
});
