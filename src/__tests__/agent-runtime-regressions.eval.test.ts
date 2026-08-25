import { afterEach, describe, expect, it, vi } from "vitest";
import fs from "fs";
import path from "path";
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
import {
  getDurableAgentRunClient,
  listActiveDurableAgentRunsClient,
  requestDurableAgentRunCancelClient,
} from "@/lib/agent/runtime/durable-run-client";
import { readFile } from "@/lib/agent/tools/query/read-file";
import {
  createAgentTaskContract,
  inferCompletedCriteriaFromToolResult,
  resolveTaskContractRunOutcome,
} from "@/lib/agent/task-contract";
import { buildConfirmedImageResumeImportToolCall, buildRequiredResumeDraftToolCall } from "@/lib/agent/loop/client-runner";
import { RESUME_RUNTIME_INCIDENT_20260717 } from "@/__tests__/fixtures/agent-resume-runtime-regression-fixtures";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("agent runtime regression evals", () => {
  it("regression: a named current-resume continuation stays on the CV data resource", async () => {
    const longExperience = `AI 解决方案经历 ${"交付可验证业务结果。".repeat(180)}`;
    const fetchMock = vi.fn(async (url: string) => {
      if (url !== "/api/cv/data") throw new Error(`unexpected URL: ${url}`);
      return new Response(JSON.stringify({
        success: true,
        data: {
          activeVersion: "v3",
          versions: {
            v3: {
              sections: [
                { id: "summary", title: "个人概述", content: "候选人，AI 产品方向" },
                { id: "experience", title: "工作经历", content: longExperience },
                { id: "projects", title: "项目经验", content: "Agent 求职助手项目" },
              ],
            },
          },
        },
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await readFile.handler(RESUME_RUNTIME_INCIDENT_20260717.readToolCalls[1]);

    expect(result.success).toBe(true);
    expect(result.errorCategory).toBe("ok");
    expect(result.llmSummary).toContain("第 1601-");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith("/api/cv/data");
  });

  it("reads a resume over 20k characters through stable continuation offsets", async () => {
    const longExperience = `${"负责 Agent 产品设计、评测和交付。".repeat(1300)}TAIL-RESUME-OVER-20K`;
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      success: true,
      data: {
        activeVersion: "v20",
        versions: {
          v20: {
            sections: [{ id: "experience", title: "工作经历", content: longExperience }],
          },
        },
      },
    }), { status: 200, headers: { "Content-Type": "application/json" } })));

    const first = await readFile.handler({ path: "我的简历" });
    const second = await readFile.handler({ path: "我的简历", offset: 16000, limit: 16000 });

    expect(first.success).toBe(true);
    expect(first.data).toMatchObject({ truncated: true, nextOffset: 16000 });
    expect(first.llmSummary).toContain("offset=16000");
    expect(first.rawData).toMatchObject({ content: expect.stringContaining("TAIL-RESUME-OVER-20K") });
    expect(second.success).toBe(true);
    expect(second.llmSummary).toContain("TAIL-RESUME-OVER-20K");
    expect(second.data).toMatchObject({ truncated: false, nextOffset: null });
  });

  it("can page through the canonical source artifact when integrity needs review", async () => {
    const sourceText = `${"图片识别原文事实。".repeat(2600)}TAIL-SOURCE-ARTIFACT`;
    const fetchMock = vi.fn(async (url: string) => {
      expect(url).toBe("/api/cv/data?includeSource=1");
      return new Response(JSON.stringify({
        success: true,
        data: {
          activeVersion: "v-image",
          versions: {
            "v-image": { sections: [{ id: "experience", title: "工作经历", content: "结构化内容" }] },
          },
          resumeDocument: {
            id: "resume-image",
            integrity: { status: "needs_review" },
            sourceText,
            chunks: [{ id: "chunk-image-0", start: 0, end: sourceText.length, content: sourceText }],
          },
        },
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await readFile.handler({
      path: "我的简历",
      projection: "source",
      offset: 16000,
      limit: 16000,
    });

    expect(result.success).toBe(true);
    expect(result.llmSummary).toContain("TAIL-SOURCE-ARTIFACT");
    expect(result.data).toMatchObject({ projection: "source", truncated: false });
    expect(result.rawData).toMatchObject({
      resumeDocument: { id: "resume-image", chunks: [{ id: "chunk-image-0" }] },
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("imports the full confirmed image resume instead of a guided-session excerpt", () => {
    const sourceText = `${"完整图片简历事实。".repeat(2600)}TAIL-IMAGE-IMPORT`;
    const call = buildConfirmedImageResumeImportToolCall({
      userText: "确认，保存到我的简历",
      sourceText,
      images: ["data:image/png;base64,original-image"],
      allowedTools: ["read_file", "import_resume"],
    });

    expect(call?.name).toBe("import_resume");
    const args = JSON.parse(call?.arguments || "{}");
    expect(args.source).toBe("image_ocr");
    expect(args.originalImages).toEqual(["data:image/png;base64,original-image"]);
    expect(args.text).toBe(sourceText);
    expect(args.text).toContain("TAIL-IMAGE-IMPORT");
    expect(args.text.length).toBeGreaterThan(20000);
  });

  it("regression: a current-resume API failure is not disguised as a filesystem error", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      expect(url).toBe("/api/cv/data");
      return new Response(JSON.stringify({ success: false, error: "数据库暂不可用" }), {
        status: 503,
        headers: { "Content-Type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await readFile.handler({ path: "候选人甲的简历" });

    expect(result).toMatchObject({
      success: false,
      error: "数据库暂不可用",
      errorCategory: "transient",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("boundary: the legacy personal-profile alias still reads the current CV resource", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url !== "/api/cv/data") throw new Error(`unexpected URL: ${url}`);
      return new Response(JSON.stringify({
        success: true,
        data: {
          activeVersion: "v1",
          versions: {
            v1: {
              sections: [
                { id: "summary", title: "个人概述", content: "AI 产品经理" },
              ],
            },
          },
        },
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await readFile.handler({ path: "个人画像" });

    expect(result).toMatchObject({
      success: true,
      errorCategory: "ok",
      data: expect.objectContaining({ source: "cv" }),
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith("/api/cv/data");
  });

  it("regression: the first resume optimization draft waits for approval instead of failing", () => {
    const contract = createAgentTaskContract({
      taskType: "resume_edit",
      target: RESUME_RUNTIME_INCIDENT_20260717.optimizeRequest,
      baseVersion: "v3",
      baseHash: "fnv1a32:incident",
    });
    const completedCriteria = inferCompletedCriteriaFromToolResult(contract, {
      toolName: "optimize_resume_section",
      toolSuccess: true,
      data: {
        sectionId: "experience",
        variants: [{ label: "结果导向版", content: "负责 Agent 产品设计，推动核心流程上线。" }],
      },
    });

    const outcome = resolveTaskContractRunOutcome(contract, completedCriteria, {
      hasAssistantResponse: true,
      lastToolSuccess: true,
    });

    expect(outcome.status).toBe(RESUME_RUNTIME_INCIDENT_20260717.expected.draftStatus);
    expect(outcome.replaceAssistantMessage).toBe(false);
    expect(outcome.gate.completedCriteria).toContain("draft generated");
    expect(outcome.gate.unmetCriteria).toContain("user approved draft");
  });

  it("regression: a redundant later tool failure cannot erase a completed resume read", () => {
    const contract = createAgentTaskContract({
      taskType: "resume_query",
      target: "读一下候选人的简历",
    });

    const outcome = resolveTaskContractRunOutcome(
      contract,
      ["resume context read", "answer generated"],
      { hasAssistantResponse: true, lastToolSuccess: false },
    );

    expect(outcome.status).toBe("succeeded");
    expect(outcome.replaceAssistantMessage).toBe(false);
    expect(outcome.gate.canClaimSuccess).toBe(true);
  });

  it("regression: a broad resume optimization request cannot stop after only reading the resume", () => {
    const contract = createAgentTaskContract({
      taskType: "resume_edit",
      target: RESUME_RUNTIME_INCIDENT_20260717.optimizeRequest,
    });

    const forcedCall = buildRequiredResumeDraftToolCall({
      contract,
      userText: RESUME_RUNTIME_INCIDENT_20260717.optimizeRequest,
      successfulTools: ["read_file"],
      allowedTools: ["read_file", "optimize_resume_section", "create_resume_edit_proposal"],
    });

    expect(forcedCall?.name).toBe(RESUME_RUNTIME_INCIDENT_20260717.expected.initialOptimizationTool);
    expect(JSON.parse(forcedCall?.arguments || "{}")).toMatchObject({
      section: "experience",
      instruction: RESUME_RUNTIME_INCIDENT_20260717.optimizeRequest,
    });
  });

  it("regression: forced resume optimization preserves the original request after tool observations", () => {
    const contract = createAgentTaskContract({
      taskType: "resume_edit",
      target: RESUME_RUNTIME_INCIDENT_20260717.optimizeRequest,
    });

    const forcedCall = buildRequiredResumeDraftToolCall({
      contract,
      userText: "<tool_result name=\"read_file\">已读取 3194 字简历正文</tool_result>",
      successfulTools: ["read_file"],
      allowedTools: ["read_file", "optimize_resume_section"],
    });

    expect(JSON.parse(forcedCall?.arguments || "{}")).toMatchObject({
      section: "experience",
      instruction: RESUME_RUNTIME_INCIDENT_20260717.optimizeRequest,
    });
  });

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
      expect(url).toBe("/api/agent/runs?conversationId=42&activeOnly=true");
      return new Response(JSON.stringify({
        success: true,
        data: [{
          id: "run-refresh",
          userId: "user-1",
          conversationId: 42,
          taskType: "resume_edit",
          agentId: "resume",
          status: "running",
          createdAt: "2026-06-10T00:00:00.000Z",
          updatedAt: "2026-06-10T00:01:00.000Z",
        }],
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }));

    const result = await listActiveDurableAgentRunsClient(42);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: "run-refresh",
      conversationId: 42,
      status: "running",
    });
  });

  it("recovery: resume control can load the current durable run snapshot", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      expect(url).toBe("/api/agent/runs/run-refresh");
      return new Response(JSON.stringify({
        success: true,
        data: {
          run: {
            id: "run-refresh",
            userId: "user-1",
            conversationId: 42,
            taskType: "resume_edit",
            agentId: "resume",
            status: "waiting_user",
            checkpointBoundary: "after_tool",
            createdAt: "2026-06-10T00:00:00.000Z",
            updatedAt: "2026-06-10T00:01:00.000Z",
          },
        },
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }));

    const detail = await getDurableAgentRunClient("run-refresh");

    expect(detail).toMatchObject({ status: "waiting_user", checkpointBoundary: "after_tool" });
  });

  it("recovery: cancel control calls the owner-scoped cancel endpoint", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toBe("/api/agent/runs/run-refresh/cancel");
      expect(init?.method).toBe("POST");
      expect(JSON.parse(String(init?.body))).toEqual({ requestId: "cancel-refresh" });
      return new Response(JSON.stringify({ success: true, data: { run: { id: "run-refresh", status: "cancel_requested" } } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(requestDurableAgentRunCancelClient("run-refresh", "cancel-refresh")).resolves.toMatchObject({
      id: "run-refresh",
      status: "cancel_requested",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("recovery: agent page renders resume and cancel controls for active durable runs", () => {
    const page = fs.readFileSync(path.join(process.cwd(), "src", "app", "agent", "page.tsx"), "utf-8");

    expect(page).toContain("handleResumeActiveRun");
    expect(page).toContain("handleCancelActiveRun");
    expect(page).toContain("getDurableAgentRunClient");
    expect(page).toContain("requestDurableAgentRunCancelClient");
  });

  it("recovery: agent page keeps a rollback affordance for the latest applied resume edit", () => {
    const page = fs.readFileSync(path.join(process.cwd(), "src", "app", "agent", "page.tsx"), "utf-8");

    expect(page).toContain("latestRollbackProposal");
    expect(page).toContain("handleRollbackLatestProposal");
    expect(page).toContain("status=applied&limit=1");
    expect(page).toContain("撤销最近一次已应用的简历修改");
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
