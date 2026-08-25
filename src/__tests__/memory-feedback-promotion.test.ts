import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildFeedbackScopeKey,
  canTransitionMemoryStatus,
  computeEditDistanceRatio,
  decideMemoryPromotion,
  normalizeMemoryFeedbackAction,
  updateFeedbackStats,
} from "@/lib/memory/feedback-promotion";
import { computeReferenceSnippetScore } from "@/lib/reference-resume-vector";

function source(file: string): string {
  return fs.readFileSync(path.join(process.cwd(), file), "utf8");
}

describe("memory feedback promotion rules", () => {
  it("does not promote team-shared memory from one accepted output", () => {
    const stats = updateFeedbackStats({
      action: "accepted",
      scopeKey: buildFeedbackScopeKey({ taskType: "cv_optimize", roleCategory: "ai_product_manager", sectionId: "projects" }),
    });

    const decision = decideMemoryPromotion({
      status: "candidate",
      visibility: "team",
      confidence: 0.8,
      importance: 0.8,
      sourceCount: 2,
      stats,
      text: "AI product resume writing should connect business goal, technical workflow, evaluation loop, and product result.",
    });

    expect(decision.nextStatus).toBe("candidate");
    expect(decision.reason).toBe("insufficient_feedback");
    expect(decision.changed).toBe(false);
  });

  it("promotes private candidate memory only after repeated positive feedback", () => {
    let stats = updateFeedbackStats({ action: "accepted", scopeKey: "cv|ai_pm|projects|full" });
    stats = updateFeedbackStats({ previous: stats, action: "saved", scopeKey: "cv|ai_pm|projects|full" });
    stats = updateFeedbackStats({ previous: stats, action: "accepted", scopeKey: "cv|ai_pm|projects|full" });

    const decision = decideMemoryPromotion({
      status: "candidate",
      visibility: "private",
      confidence: 0.72,
      importance: 0.7,
      sourceCount: 1,
      stats,
      text: "AI product resume writing should frame projects as problem, action, evaluation, and measurable impact.",
    });

    expect(decision.nextStatus).toBe("active");
    expect(decision.reason).toBe("repeated_positive_feedback");
    expect(decision.trustScore).toBeGreaterThan(0.7);
  });

  it("requires admin approval before team memory becomes shared active guidance", () => {
    let stats = updateFeedbackStats({ action: "accepted", scopeKey: "cv|ai_pm|summary|full" });
    stats = updateFeedbackStats({ previous: stats, action: "saved", scopeKey: "cv|ai_pm|summary|full" });
    stats = updateFeedbackStats({ previous: stats, action: "accepted", scopeKey: "cv|ai_pm|summary|full" });

    const decision = decideMemoryPromotion({
      status: "candidate",
      visibility: "team",
      confidence: 0.8,
      importance: 0.8,
      sourceCount: 2,
      stats,
      text: "AI product summary should start with role positioning and then compress evidence, domain scenarios, and strongest outcomes.",
    });

    expect(decision.nextStatus).toBe("candidate");
    expect(decision.reason).toBe("awaiting_admin_approval");
    expect(decision.needsAdminApproval).toBe(true);
    expect(canTransitionMemoryStatus({
      actorRole: "system",
      currentStatus: "candidate",
      nextStatus: "active",
      visibility: "team",
    })).toBe(false);
    expect(canTransitionMemoryStatus({
      actorRole: "admin",
      currentStatus: "candidate",
      nextStatus: "active",
      visibility: "team",
    })).toBe(true);
  });

  it("repeated negative feedback rejects memory and downranks snippets", () => {
    let stats = updateFeedbackStats({ action: "rejected", scopeKey: "cv|ai_pm|projects|full" });
    stats = updateFeedbackStats({ previous: stats, action: "dismissed", scopeKey: "cv|ai_pm|projects|full" });
    stats = updateFeedbackStats({ previous: stats, action: "heavily_edited", scopeKey: "cv|ai_pm|projects|full" });

    const decision = decideMemoryPromotion({
      status: "active",
      visibility: "private",
      confidence: 0.8,
      importance: 0.8,
      sourceCount: 3,
      stats,
      text: "AI product resume writing should connect business goal, action, and measurable impact.",
    });
    const accepted = computeReferenceSnippetScore({ similarity: 0.84, quality: 0.8, roleScore: 1, acceptedCount: 4 });
    const rejected = computeReferenceSnippetScore({ similarity: 0.84, quality: 0.8, roleScore: 1, rejectedCount: 4 });

    expect(decision.nextStatus).toBe("rejected");
    expect(decision.reason).toBe("repeated_negative_feedback");
    expect(accepted).toBeGreaterThan(rejected);
  });

  it("tracks edit distance and scoped feedback separately", () => {
    const action = normalizeMemoryFeedbackAction("modified");
    const scopeA = buildFeedbackScopeKey({ taskType: "cv_optimize", roleCategory: "ai_product_manager", sectionId: "projects", operation: "full" });
    const scopeB = buildFeedbackScopeKey({ taskType: "cv_optimize", roleCategory: "ai_operations", sectionId: "summary", operation: "full" });
    let stats = updateFeedbackStats({ action, scopeKey: scopeA });
    stats = updateFeedbackStats({ previous: stats, action: "accepted", scopeKey: scopeB });

    expect(action).toBe("heavily_edited");
    expect(stats.scopes[scopeA].negative).toBe(1);
    expect(stats.scopes[scopeB].positive).toBe(1);
    expect(computeEditDistanceRatio("abc", "abc")).toBe(0);
    expect(computeEditDistanceRatio("abc", "xyz")).toBeGreaterThan(0.9);
  });

  it("rejects generic or low-evidence pattern text", () => {
    const stats = updateFeedbackStats({ action: "accepted", scopeKey: "cv|ai_pm|skills|full" });
    const decision = decideMemoryPromotion({
      status: "candidate",
      visibility: "private",
      confidence: 0.9,
      importance: 0.9,
      sourceCount: 2,
      stats,
      text: "API",
    });

    expect(decision.nextStatus).toBe("rejected");
    expect(decision.reason).toBe("policy_or_quality_ineligible");
  });
});

describe("memory feedback integration wiring", () => {
  it("routes optimization feedback through the promotion service", () => {
    const route = source("src/app/api/cv/record-preference/route.ts");
    const panel = source("src/app/cv/optimize-panel.tsx");

    expect(route).toContain("recordOptimizationMemoryFeedback");
    expect(route).toContain("heavily_edited");
    expect(route).toContain("roleCategory");
    expect(route).toContain("edited_text");
    expect(panel).toContain('taskType: "cv_optimize"');
    expect(panel).toContain("roleCategory");
  });

  it("uses snippet-level, scoped usage for reference reranking", () => {
    const referenceVector = source("src/lib/reference-resume-vector.ts");
    const optimizeService = source("src/lib/server/resume-optimization-service.ts");

    expect(referenceVector).toContain("metadata_json->'snippetIds'");
    expect(referenceVector).toContain("metadata_json->>'roleCategory'");
    expect(referenceVector).toContain("metadata_json->>'sectionId'");
    expect(referenceVector).toContain("feedbackTrustScore");
    expect(optimizeService).toContain("ranking: snippets.map");
  });

  it("keeps candidate pattern memory out of default optimization retrieval", () => {
    const patterns = source("src/lib/excellent-resume-patterns.ts");

    expect(patterns).toContain("[\"active\"]");
    expect(patterns).toContain("feedbackTrustScore");
    expect(patterns).toContain("patternRank");
  });

  it("defines memory transition audit storage in PostgreSQL", () => {
    const schema = source("src/lib/postgres-schema.sql");
    const repositories = source("src/lib/data-repositories.ts");

    expect(schema).toContain("CREATE TABLE IF NOT EXISTS memory_status_transitions");
    expect(schema).toContain("previous_status");
    expect(schema).toContain("next_status");
    expect(schema).toContain("actor_role");
    expect(repositories).toContain('"memory_status_transitions"');
  });
});
