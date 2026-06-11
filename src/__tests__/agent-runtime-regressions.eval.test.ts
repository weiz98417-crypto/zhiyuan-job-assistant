import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildResumeEditProposalActionPlan,
  buildResumeSavePlan,
  sanitizeUnsupportedResumeSaveClaim,
  validateResumeSectionContent,
} from "@/lib/agent/resume-save-guard";
import {
  buildVerifiedActionSuccess,
  validateDocumentFieldContent,
} from "@/lib/agent/verified-action";
import { listActiveAgentRunsClient } from "@/lib/agent/run-ledger-client";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("agent runtime regression evals", () => {
  it("baseline: blocks placeholder and half-written resume saves", () => {
    const placeholder = "**Projects** -> replace with:";
    const halfWritten = "Work Experience: keep original details\n\nProjects: replace with:\n";

    expect(validateResumeSectionContent("projects", placeholder).valid).toBe(false);
    expect(validateResumeSectionContent("projects", halfWritten).valid).toBe(false);
    expect(buildResumeSavePlan([
      { role: "assistant", content: `Updated version:\n${halfWritten}` },
      { role: "user", content: "save this into projects" },
    ])).toBeNull();
  });

  it("boundary: accepts compact valid manual edits but rejects agent control markup", () => {
    const validManualSkills = "SQL / RAG / Prompt Engineering / Agent design / A-B testing";
    const codeFence = "```markdown\nSQL / RAG / Prompt Engineering\n```";
    const diffTable = "| before | after | reason |\n| --- | --- | --- |\n| old | new | ok |";

    expect(validateResumeSectionContent("skills", validManualSkills).valid).toBe(true);
    expect(validateDocumentFieldContent(codeFence, { minCompactLength: 5 }).valid).toBe(false);
    expect(validateDocumentFieldContent(diffTable, { minCompactLength: 5 }).valid).toBe(false);
  });

  it("regression: never lets a failed verifier look like a saved resume", () => {
    const verified = buildVerifiedActionSuccess({
      action: "save_resume_section",
      targetType: "cv",
      targetField: "skills",
      data: { saved: true },
      expectedContent: "SQL / RAG / Prompt Engineering",
      readBackContent: "old skills",
      checks: validateDocumentFieldContent("SQL / RAG / Prompt Engineering", { minCompactLength: 5 }).checks,
    });

    expect(verified.success).toBe(false);
    expect(verified.readBack?.code).toBe("read_back.mismatch");
    expect(sanitizeUnsupportedResumeSaveClaim("Successfully saved to resume.", false)).not.toContain("Successfully saved");
  });

  it("recovery: reload can read active durable runs for the current session", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      expect(url).toBe("/api/agent/runs?sessionId=42");
      return new Response(JSON.stringify({
        success: true,
        enabled: true,
        data: [{
          id: "run-refresh",
          user_id: "user-1",
          session_id: 42,
          task_type: "resume_edit",
          agent_id: "resume",
          status: "running",
          created_at: "2026-06-10T00:00:00.000Z",
          updated_at: "2026-06-10T00:01:00.000Z",
        }],
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }));

    const result = await listActiveAgentRunsClient(42);

    expect(result.enabled).toBe(true);
    expect(result.data).toHaveLength(1);
    expect(result.data[0]).toMatchObject({
      id: "run-refresh",
      session_id: 42,
      status: "running",
    });
  });

  it("recovery: pending resume proposal survives refresh and routes approval by proposal id", () => {
    const messages = [
      {
        role: "tool",
        content: "已创建简历修改提案 rep_123e4567-e89b-12d3-a456-426614174000（skills），请先确认差异，确认后才会写入 CV。",
      },
      {
        role: "user",
        content: "应用这个提案",
      },
    ];

    expect(buildResumeEditProposalActionPlan(messages)).toEqual({
      action: "apply",
      proposalId: "rep_123e4567-e89b-12d3-a456-426614174000",
    });
    expect(buildResumeSavePlan(messages)).toBeNull();
  });

  it("recovery: pending resume proposal can be discarded after refresh", () => {
    const messages = [
      {
        role: "tool",
        content: "已创建简历修改提案 rep_refresh_pending_1（projects），请先确认差异，确认后才会写入 CV。",
      },
      {
        role: "user",
        content: "不要了，废弃这个简历修改提案",
      },
    ];

    expect(buildResumeEditProposalActionPlan(messages)).toEqual({
      action: "discard",
      proposalId: "rep_refresh_pending_1",
    });
  });
});
