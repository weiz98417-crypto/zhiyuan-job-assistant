import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  enforceAgentMemoryPolicy,
  formatAgentMemoryContext,
  resolveAgentMemoryPolicy,
} from "@/lib/agent/memory-context";
import { detectMemoryTaskConflict } from "@/lib/agent/memory-policy";
import { createSession, advance } from "@/lib/agent/interview/engine";
import { rerankMemoryRows, type MemoryRetrievalRow } from "@/lib/memory/vector-memory";

describe("agent long-term memory policies", () => {
  it("JD evaluation retrieves resume and historical report context", () => {
    const policy = resolveAgentMemoryPolicy("jd");
    expect(policy.task).toBe("jd_evaluation");
    expect(policy.allowedSourceTypes).toEqual(expect.arrayContaining(["cv", "profile", "jd", "jd_report"]));
    expect(policy.allowedSourceTypes).not.toContain("reference_resume");
    expect(policy.structuredScopes).toEqual(expect.arrayContaining(["cv", "reports", "memory_items"]));

    const summary = formatAgentMemoryContext({
      task: policy.task,
      policyId: policy.id,
      sourceTypes: policy.allowedSourceTypes,
      budgetChars: 1200,
      structuredFacts: [
        { label: "current CV", sourceType: "cv", text: "Built BI dashboards and AI product workflows." },
        { label: "Acme PM report", sourceType: "jd_report", sourceId: 7, text: "Prior report found weak industry fit." },
      ],
      semanticSnippets: [],
    });

    expect(summary).toContain("[structured:cv]");
    expect(summary).toContain("[structured:jd_report#7]");
  });

  it("offer evaluation retrieves compensation preferences and prior offer context", () => {
    const policy = resolveAgentMemoryPolicy("offer");
    expect(policy.task).toBe("offer_evaluation");
    expect(policy.allowedSourceTypes).toEqual(expect.arrayContaining(["offer", "offer_report", "profile"]));
    expect(policy.allowedSourceTypes).not.toContain("jd");
    expect(policy.structuredScopes).toEqual(expect.arrayContaining(["offers", "offer_reports", "memory_items"]));

    const summary = formatAgentMemoryContext({
      task: policy.task,
      policyId: policy.id,
      sourceTypes: policy.allowedSourceTypes,
      budgetChars: 1200,
      structuredFacts: [
        { label: "comp preference", sourceType: "offer_report", text: "Candidate dislikes outsourcing and intense overtime.", status: "active", memoryType: "compensation_preference" },
        { label: "prior offer", sourceType: "offer", sourceId: 3, text: "30k x 15, direct hire." },
      ],
      semanticSnippets: [],
    });

    expect(summary).toContain("compensation_preference");
    expect(summary).toContain("[structured:offer#3]");
  });

  it("keeps memory context compact and source-labeled", () => {
    const policy = resolveAgentMemoryPolicy("resume_optimization");
    const summary = formatAgentMemoryContext({
      task: policy.task,
      policyId: policy.id,
      sourceTypes: policy.allowedSourceTypes,
      budgetChars: 180,
      structuredFacts: [
        { label: "current CV", sourceType: "cv", text: "x".repeat(400) },
      ],
      semanticSnippets: [
        { id: 1, sourceType: "jd", sourceId: "9", snippet: "JD requires data product ownership.", score: 0.9, similarity: 0.8, metadata: {} },
      ],
    });

    expect(summary).toContain("[structured:cv]");
    expect(summary.length).toBeLessThanOrEqual(220);
    expect(summary).toContain("truncated");
  });

  it("denies raw excellent-resume snippets outside resume optimization", () => {
    const jdPolicy = resolveAgentMemoryPolicy("jd_evaluation");
    const enforced = enforceAgentMemoryPolicy({
      policy: jdPolicy,
      agentId: "evaluate",
      structuredFacts: [],
      semanticSnippets: [
        {
          id: 8,
          sourceType: "reference_resume",
          sourceId: "101",
          snippet: "Excellent resume raw phrase.",
          similarity: 0.9,
          score: 0.9,
          metadata: { visibility: "team", status: "active" },
        },
      ],
    });

    expect(enforced.semanticSnippets).toHaveLength(0);
    expect(enforced.deniedSources[0]).toMatchObject({
      taskType: "jd_evaluation",
      agentId: "evaluate",
      sourceType: "reference_resume",
      sourceId: "101",
      reason: "raw_reference_snippet_denied",
    });
  });

  it("allows resume optimization to use active reference snippets and active patterns", () => {
    const policy = resolveAgentMemoryPolicy("resume_optimization");
    const enforced = enforceAgentMemoryPolicy({
      policy,
      agentId: "resume",
      structuredFacts: [
        {
          label: "excellent pattern",
          sourceType: "reference_resume",
          sourceId: 12,
          text: "Frame AI product work as business goal, technical loop, evaluation, and result.",
          status: "active",
          visibility: "team",
          memoryType: "excellent_resume_pattern",
        },
      ],
      semanticSnippets: [
        {
          id: 1,
          sourceType: "reference_resume",
          sourceId: "12",
          snippet: "Reference resume snippet",
          similarity: 0.82,
          score: 0.86,
          metadata: { visibility: "team", status: "active" },
        },
      ],
    });

    expect(enforced.structuredFacts).toHaveLength(1);
    expect(enforced.semanticSnippets).toHaveLength(1);
    expect(enforced.deniedSources).toHaveLength(0);
  });

  it("keeps candidate memory out of prompts until promoted", () => {
    const policy = resolveAgentMemoryPolicy("offer_evaluation");
    const enforced = enforceAgentMemoryPolicy({
      policy,
      agentId: "offer",
      structuredFacts: [
        {
          label: "offer observation",
          sourceType: "offer_report",
          sourceId: 3,
          text: "Candidate disliked a previous outsourcing offer.",
          status: "candidate",
          memoryType: "offer_evaluation_observation",
        },
      ],
      semanticSnippets: [],
    });

    expect(enforced.structuredFacts).toHaveLength(0);
    expect(enforced.deniedSources[0]?.reason).toBe("candidate_memory_denied");
  });

  it("offer evaluation cannot receive unrelated JD memory", () => {
    const policy = resolveAgentMemoryPolicy("offer_evaluation");
    const enforced = enforceAgentMemoryPolicy({
      policy,
      agentId: "offer",
      structuredFacts: [
        {
          label: "old JD report",
          sourceType: "jd_report",
          sourceId: 9,
          text: "Unrelated JD score was low.",
          status: "active",
          memoryType: "jd_evaluation_observation",
        },
      ],
      semanticSnippets: [
        {
          id: 9,
          sourceType: "jd",
          sourceId: "9",
          snippet: "JD requires BI projects.",
          similarity: 0.8,
          score: 0.8,
          metadata: { status: "active" },
        },
      ],
    });

    expect(enforced.structuredFacts).toHaveLength(0);
    expect(enforced.semanticSnippets).toHaveLength(0);
    expect(enforced.deniedSources.map((item) => item.sourceType)).toEqual(["jd_report", "jd"]);
  });

  it("general chat does not retrieve broad semantic memory by default", () => {
    const policy = resolveAgentMemoryPolicy("general_chat");
    const enforced = enforceAgentMemoryPolicy({
      policy,
      agentId: "general",
      structuredFacts: [],
      semanticSnippets: [
        {
          id: 2,
          sourceType: "profile",
          sourceId: "profile",
          snippet: "Private profile fact.",
          similarity: 0.9,
          score: 0.9,
          metadata: { status: "active" },
        },
      ],
    });

    expect(policy.semanticTopK).toBe(0);
    expect(enforced.semanticSnippets).toHaveLength(0);
    expect(enforced.deniedSources[0]?.reason).toBe("source_type_denied");
  });

  it("unknown tasks fail closed and conflicting upload intent asks clarification", () => {
    const unknown = resolveAgentMemoryPolicy("mystery_task");
    expect(unknown.task).toBe("unknown");
    expect(unknown.allowedSourceTypes).toHaveLength(0);
    expect(unknown.semanticTopK).toBe(0);

    const conflict = detectMemoryTaskConflict({
      userTextTask: "jd_evaluation",
      contentTask: "offer_evaluation",
    });
    expect(conflict.requiresClarification).toBe(true);
    expect(conflict.reason).toContain("conflicts");
  });
});

describe("interview memory binding", () => {
  it("does not lose bound JD/resume after advancing the interview", () => {
    const session = createSession("Acme", "AI PM", {
      jdId: 12,
      reportNum: 8,
      jdText: "JD requires data products and prompt engineering.",
      cvText: "Resume includes AI hardware and computer vision projects.",
      memoryContext: "Prior report says industry gap is the main risk.",
    });

    session.currentQuestion = { id: "q1", phase: "intro", text: "Introduce yourself.", type: "tech" };
    advance(session);

    expect(session.sourceBinding?.jdId).toBe(12);
    expect(session.sourceBinding?.reportNum).toBe(8);
    expect(session.sourceBinding?.cvText).toContain("computer vision");
  });
});

describe("agent memory isolation and writeback", () => {
  it("semantic reranking never returns another user's memory", () => {
    const rows: MemoryRetrievalRow[] = [
      row({ id: 1, user_id: "user-a", similarity: 0.6 }),
      row({ id: 2, user_id: "user-b", similarity: 0.99 }),
    ];

    const snippets = rerankMemoryRows(rows, "user-a", 5);
    expect(snippets).toHaveLength(1);
    expect(snippets[0].id).toBe(1);
  });

  it("agent writeback creates candidate memory, not confirmed profile facts", () => {
    const writebackRoute = fs.readFileSync(
      path.join(process.cwd(), "src", "app", "api", "agent", "memory-writeback", "route.ts"),
      "utf-8",
    );
    const interviewService = fs.readFileSync(
      path.join(process.cwd(), "src", "lib", "server", "interview-analysis-service.ts"),
      "utf-8",
    );

    expect(writebackRoute).toContain('status: "candidate"');
    expect(writebackRoute).toContain("readBackVerified: true");
    expect(interviewService).toContain('status: "candidate"');
    expect(interviewService).toContain("readBackVerified: true");
    expect(writebackRoute).not.toContain('status: "active"');
  });

  it("memory persistence routes and repositories fail closed on read-back mismatch", () => {
    const memoryIndexRoute = fs.readFileSync(
      path.join(process.cwd(), "src", "app", "api", "agent", "memory-index", "route.ts"),
      "utf-8",
    );
    const memoryWritebackRoute = fs.readFileSync(
      path.join(process.cwd(), "src", "app", "api", "agent", "memory-writeback", "route.ts"),
      "utf-8",
    );
    const postgresMemory = fs.readFileSync(
      path.join(process.cwd(), "src", "lib", "memory", "postgres-memory.ts"),
      "utf-8",
    );
    const feedbackPromotion = fs.readFileSync(
      path.join(process.cwd(), "src", "lib", "memory", "feedback-promotion.ts"),
      "utf-8",
    );

    expect(memoryIndexRoute).toContain("readBackVerified: true");
    expect(memoryWritebackRoute).toContain("readBackVerified: true");
    expect(postgresMemory).toContain("memory item read-back verification failed");
    expect(postgresMemory).toContain("memory evidence read-back verification failed");
    expect(postgresMemory).toContain("memory chunks read-back verification failed");
    expect(feedbackPromotion).toContain("memory promotion read-back verification failed");
  });
});

function row(overrides: Partial<MemoryRetrievalRow>): MemoryRetrievalRow {
  return {
    id: 0,
    user_id: "user-a",
    source_type: "cv",
    source_id: "0",
    chunk_index: 0,
    chunk_text: "Built BI products and AI workflows.",
    embedding_model: "mock",
    metadata_json: { confidence: 0.8, importance: 0.7 },
    similarity: 0.5,
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}
