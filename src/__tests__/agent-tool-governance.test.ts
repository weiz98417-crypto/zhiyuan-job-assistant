import { describe, expect, it } from "vitest";
import { vi } from "vitest";
import {
  createAgentTaskContract,
  inferCompletedCriteriaFromToolResult,
} from "@/lib/agent/task-contract";
import {
  auditToolGovernance,
  auditToolRouteConflicts,
  enforceToolGovernance,
  evaluateToolGovernance,
  getLegacyToolGovernanceCompatibility,
  getTaskContractPolicy,
  getToolGovernance,
  isMissingToolGovernanceDefaultDenied,
  resolveToolEffectForCall,
} from "@/lib/agent/tool-governance";
import { requiresReadBackVerification } from "@/lib/agent/tools/readback-verification";
import { enforceReadBackSuccessGate } from "@/lib/agent/tools/readback-verification";
import { executeTool, getAllTools } from "@/lib/agent/tools";

describe("agent tool governance", () => {
  it("classifies every registered tool with governance metadata", () => {
    const tools = getAllTools();
    const issues = auditToolGovernance(tools);

    expect(tools.length).toBeGreaterThan(0);
    expect(issues).toEqual([]);
  });

  it("does not have high-priority route conflicts", () => {
    expect(auditToolRouteConflicts()).toEqual([]);
  });

  it("default-denies tools missing governance metadata in tests and development", () => {
    expect(isMissingToolGovernanceDefaultDenied()).toBe(true);

    const decision = evaluateToolGovernance({
      toolName: "legacy_unclassified_tool",
      params: {},
    });
    expect(decision).toMatchObject({
      allowed: false,
      effect: "read",
    });
    expect(decision.reason).toContain("缺少治理元数据");

    const compatibility = getLegacyToolGovernanceCompatibility("legacy_unclassified_tool");
    expect(compatibility.defaultDenied).toBe(true);
    expect(compatibility.removalChecklist).toEqual(expect.arrayContaining([
      expect.stringContaining("ToolGovernance"),
      expect.stringContaining("regression eval"),
    ]));
  });

  it("binds governance read-back requirements to the runtime success gate", () => {
    const governedReadBackTools = getAllTools()
      .filter((tool) => tool.governance?.requiresReadBack)
      .map((tool) => tool.name)
      .sort();

    expect(governedReadBackTools).toEqual(expect.arrayContaining([
      "apply_resume_edit_proposal",
      "create_resume_edit_proposal",
      "download_report_pdf",
      "evaluate_jd_full",
      "evaluate_offer",
      "export_file",
      "save_reference_resume",
      "save_resume_section",
    ]));
    for (const toolName of governedReadBackTools) {
      expect(requiresReadBackVerification(toolName)).toBe(true);
    }
  });

  it("does not gate interview score delivery on optional memory write-back", () => {
    expect(getToolGovernance("score_interview_answer")).toMatchObject({
      effect: "guide",
      requiresReadBack: false,
    });
    expect(requiresReadBackVerification("score_interview_answer")).toBe(false);

    const result = enforceReadBackSuccessGate("score_interview_answer", {
      success: true,
      data: {
        overall: 2,
        dimensions: { structure: 1.5, specificity: 1.5 },
        suggestions: ["Use a structured example before answering."],
      },
      errorCategory: "ok",
    });

    expect(result.success).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it("allows the interview score tool to return a score when memory write-back is unavailable", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/api/agent/memory-context")) {
        return new Response(JSON.stringify({ success: true, data: { llmSummary: "" } }), { status: 200 });
      }
      if (url.includes("/api/agent/coach/score-answer")) {
        return new Response(JSON.stringify({
          success: true,
          data: {
            overall: 1.2,
            dimensions: { structure: 1, specificity: 1, highlight: 1, timing: 2 },
            suggestions: ["When you do not know, state assumptions and outline a task chain."],
          },
        }), { status: 200 });
      }
      if (url.includes("/api/agent/memory-writeback")) {
        return new Response(JSON.stringify({ success: false, error: "Unauthorized" }), { status: 401 });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    const result = await executeTool("score_interview_answer", {
      question: "How would you structure a vague AI analysis request?",
      answer: "I do not know.",
      mode: "technical",
      context: "JD asks for demand structuring.",
    });

    expect(fetchMock).toHaveBeenCalled();
    expect(result.success).toBe(true);
    expect(result.error).toBeUndefined();
    expect(result.data).toMatchObject({
      overall: 1.2,
      memoryWriteback: { success: false, readBackVerified: false },
      readBackVerified: false,
    });
    expect(result.uiPayload).toMatchObject({
      type: "interview_score",
      readBackVerified: false,
    });
  });

  it("maps self-positioning to guidance instead of profile write", () => {
    const contract = createAgentTaskContract({
      taskType: "career_positioning_guidance",
      target: "profile:self-positioning",
    });

    expect(getTaskContractPolicy(contract.taskType)).toBe("guidance");
    expect(evaluateToolGovernance({
      toolName: "self_positioning",
      params: {},
      taskContract: contract,
      agentId: "profile",
    })).toMatchObject({ allowed: true, effect: "guide", contractPolicy: "guidance" });
    expect(resolveToolEffectForCall("mine_profile", { action: "start" })).toBe("guide");
    expect(resolveToolEffectForCall("mine_profile", { action: "answer" })).toBe("guide");
    expect(inferCompletedCriteriaFromToolResult(contract, {
      toolName: "mine_profile",
      toolSuccess: true,
    })).toContain("guidance framework loaded");
  });

  it("blocks high-risk writes during guidance contracts", () => {
    const contract = createAgentTaskContract({
      taskType: "career_positioning_guidance",
      target: "profile:self-positioning",
    });

    const result = enforceToolGovernance({
      toolName: "evaluate_jd_full",
      params: { jd_text: "岗位描述" },
      taskContract: contract,
      agentId: "profile",
    });

    expect(result).toMatchObject({
      success: false,
      errorCategory: "need_user_input",
    });
    expect(String(result?.error)).toContain("不属于当前任务");
  });

  it("keeps resume query contracts read-only", () => {
    const contract = createAgentTaskContract({
      taskType: "resume_query",
      target: "我的简历",
    });

    expect(getTaskContractPolicy(contract.taskType)).toBe("read_only");
    expect(evaluateToolGovernance({
      toolName: "read_file",
      params: { path: "我的简历" },
      taskContract: contract,
      agentId: "resume",
    })).toMatchObject({ allowed: true, effect: "read", contractPolicy: "read_only" });

    const blocked = enforceToolGovernance({
      toolName: "apply_resume_edit_proposal",
      params: { proposalId: "proposal-1" },
      taskContract: contract,
      agentId: "resume",
    });

    expect(blocked?.success).toBe(false);
    expect(String(blocked?.error)).toContain("不属于当前任务");
  });

  it("blocks high-risk writes while a route still needs clarification", () => {
    const contract = createAgentTaskContract({
      taskType: "jd_evaluation",
      target: "JD screenshot",
      routing: {
        requiresClarification: true,
        clarificationQuestion: "要按 JD 评估还是重新上传 Offer？",
      },
    });

    const decision = evaluateToolGovernance({
      toolName: "evaluate_jd_full",
      taskContract: contract,
      agentId: "evaluate",
    });

    expect(decision.allowed).toBe(false);
    expect(decision.reason).toContain("澄清/确认阶段");
  });

  it("requires category confirmation before saving excellent resume memory", () => {
    const contract = createAgentTaskContract({
      taskType: "reference_resume_save",
      target: "resume:excellent",
    });

    const blocked = enforceToolGovernance({
      toolName: "save_reference_resume",
      params: { resume_text: "完整简历正文" },
      taskContract: contract,
      agentId: "resume",
    });
    expect(blocked?.success).toBe(false);
    expect(String(blocked?.error)).toContain("岗位类别");

    const allowed = enforceToolGovernance({
      toolName: "save_reference_resume",
      params: { resume_text: "完整简历正文", role_category: "AI产品经理" },
      taskContract: contract,
      agentId: "resume",
    });
    expect(allowed).toBeNull();
    expect(getToolGovernance("save_reference_resume")?.requiresReadBack).toBe(true);
  });

  it("blocks read-only advice from claiming resume saves through save tools", () => {
    const contract = createAgentTaskContract({
      taskType: "career_positioning_guidance",
      target: "profile:self-positioning",
    });

    const result = enforceToolGovernance({
      toolName: "save_resume_section",
      params: { sectionId: "skills", proposedContent: "SQL / RAG / Prompt Engineering" },
      taskContract: contract,
      agentId: "profile",
    });

    expect(result?.success).toBe(false);
    expect(result?.uiPayload?.governanceBlocked).toBe(true);
  });
});
