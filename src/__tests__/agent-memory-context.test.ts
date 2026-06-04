import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  formatAgentMemoryContext,
  resolveAgentMemoryPolicy,
} from "@/lib/agent/memory-context";
import { createSession, advance } from "@/lib/agent/interview/engine";
import { rerankMemoryRows, type MemoryRetrievalRow } from "@/lib/memory/vector-memory";

describe("agent long-term memory policies", () => {
  it("JD evaluation retrieves resume and historical report context", () => {
    const policy = resolveAgentMemoryPolicy("jd");
    expect(policy.sourceTypes).toEqual(expect.arrayContaining(["resume", "profile", "jd", "report"]));
    expect(policy.structuredScopes).toEqual(expect.arrayContaining(["cv", "reports", "memory_items"]));

    const summary = formatAgentMemoryContext({
      task: "jd",
      sourceTypes: policy.sourceTypes,
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
    expect(policy.sourceTypes).toEqual(expect.arrayContaining(["offer", "profile", "report"]));
    expect(policy.structuredScopes).toEqual(expect.arrayContaining(["offers", "offer_reports", "memory_items"]));

    const summary = formatAgentMemoryContext({
      task: "offer",
      sourceTypes: policy.sourceTypes,
      budgetChars: 1200,
      structuredFacts: [
        { label: "comp preference", sourceType: "memory_item", text: "Candidate dislikes outsourcing and intense overtime.", status: "candidate" },
        { label: "prior offer", sourceType: "offer", sourceId: 3, text: "30k x 15, direct hire." },
      ],
      semanticSnippets: [],
    });

    expect(summary).toContain("candidate");
    expect(summary).toContain("[structured:offer#3]");
  });

  it("keeps memory context compact and source-labeled", () => {
    const summary = formatAgentMemoryContext({
      task: "resume",
      sourceTypes: ["resume", "jd"],
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
    const interviewRoute = fs.readFileSync(
      path.join(process.cwd(), "src", "app", "api", "agent", "coach", "session", "route.ts"),
      "utf-8",
    );

    expect(writebackRoute).toContain('status: "candidate"');
    expect(interviewRoute).toContain('status: "candidate"');
    expect(writebackRoute).not.toContain('status: "active"');
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
