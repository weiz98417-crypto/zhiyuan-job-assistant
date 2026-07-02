import { afterEach, describe, expect, it, vi } from "vitest";
import {
  applyOptionalLlmJudge,
  buildAgentEvalCandidateLifecycleResult,
  generateAgentRunOpenSpecDraftSuggestions,
  normalizeFailureType,
  redactReviewText,
  reviewAgentRun,
  reviewAgentSessionAnomalies,
  sanitizeReviewJson,
} from "@/lib/agent/run-review";
import type { AgentRunRecord, AgentRunStepRecord } from "@/lib/agent/run-ledger";

function run(overrides: Partial<AgentRunRecord> = {}): AgentRunRecord {
  return {
    id: "run-1",
    user_id: "user-1",
    session_id: 1,
    task_type: "resume_edit",
    agent_id: "resume",
    status: "succeeded",
    contract_json: { taskType: "resume_edit", target: "cv.skills" },
    result_json: {},
    error_json: {},
    created_at: "2026-06-10T00:00:00.000Z",
    updated_at: "2026-06-10T00:01:00.000Z",
    ...overrides,
  };
}

function step(overrides: Partial<AgentRunStepRecord> = {}): AgentRunStepRecord {
  return {
    id: 1,
    run_id: "run-1",
    phase: "verifying",
    tool_name: "save_resume_section",
    status: "succeeded",
    input_summary: "",
    output_summary: "saved",
    verifier_json: {},
    error_json: {},
    created_at: "2026-06-10T00:01:00.000Z",
    ...overrides,
  };
}

afterEach(() => {
  delete process.env.AGENT_RUN_REVIEW_LLM_JUDGE;
  delete process.env.AGENT_RUN_REVIEW_LLM_API_KEY;
  vi.unstubAllGlobals();
});

describe("agent run deterministic review", () => {
  it("normalizes unknown failure labels to system_error", () => {
    expect(normalizeFailureType("missing_readback")).toBe("missing_readback");
    expect(normalizeFailureType("missing_run")).toBe("missing_run");
    expect(normalizeFailureType("random_new_label")).toBe("system_error");
  });

  it("redacts private text, image payloads, and secrets", () => {
    const text = redactReviewText(
      "data:image/png;base64,AAAAAA user@example.com 13800138000 sk-a0b9c1f642064a87bc2e4f4d8e79f6c3",
    );

    expect(text).toContain("[image]");
    expect(text).toContain("[email]");
    expect(text).toContain("[phone]");
    expect(text).toContain("[api-key]");
    expect(text).not.toContain("user@example.com");
    expect(text).not.toContain("13800138000");
    expect(text).not.toContain("sk-a0b9");
  });

  it("flags successful high-risk write tools without read-back evidence", () => {
    const review = reviewAgentRun(run(), [
      step({
        verifier_json: {
          readBackRequirement: { required: true, satisfied: false },
        },
      }),
    ]);

    expect(review.verdict).toBe("fail");
    expect(review.primaryFailureType).toBe("missing_readback");
    expect(review.evidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "readback.required_missing" }),
      ]),
    );
  });

  it("flags image business tasks that skip image intake", () => {
    const review = reviewAgentRun(run({
      task_type: "jd_evaluation",
      agent_id: "evaluate",
      contract_json: { taskType: "jd_evaluation", target: "JD截图 1" },
    }), [
      step({
        tool_name: "evaluate_jd_full",
        input_summary: "帮我评估一个JD: JD截图 1",
        output_summary: "report saved",
        verifier_json: { readBackRequirement: { required: true, satisfied: true } },
      }),
    ]);

    expect(review.failureTypes).toContain("image_intake_failure");
    expect(review.evidence.some((item) => item.code === "image_intake.skipped")).toBe(true);
  });

  it("does not count business output text as an image intake step", () => {
    const review = reviewAgentRun(run({
      task_type: "jd_evaluation",
      agent_id: "evaluate",
      contract_json: { taskType: "jd_evaluation", target: "JD截图 1" },
    }), [
      step({
        tool_name: "evaluate_jd_full",
        input_summary: "帮我评估一个JD: JD截图 1",
        output_summary: "report saved without recorded image intake",
        verifier_json: { readBackRequirement: { required: true, satisfied: true } },
      }),
    ]);

    expect(review.failureTypes).toContain("image_intake_failure");
  });

  it("passes image tasks when a real image-intake step is recorded", () => {
    const review = reviewAgentRun(run({
      task_type: "jd_evaluation",
      agent_id: "evaluate",
      contract_json: { taskType: "jd_evaluation", target: "JD截图 1" },
    }), [
      step({
        id: 1,
        phase: "image-intake",
        tool_name: "recognize_document_image",
        status: "succeeded",
        input_summary: "[1 image(s)]",
        output_summary: "documentType=jd route=jd_evaluation",
      }),
      step({
        id: 2,
        tool_name: "evaluate_jd_full",
        input_summary: "帮我评估一个JD: JD截图 1",
        output_summary: "report saved",
        verifier_json: { readBackRequirement: { required: true, satisfied: true } },
      }),
    ]);

    expect(review.failureTypes).not.toContain("image_intake_failure");
  });

  it("flags resume markdown control pollution", () => {
    const review = reviewAgentRun(run(), [
      step({
        tool_name: "apply_resume_edit_proposal",
        output_summary: "**项目经验** → 替换为：\n| 修改前 | 修改后 | 原因 |",
        verifier_json: { readBackRequirement: { required: true, satisfied: true } },
      }),
    ]);

    expect(review.failureTypes).toContain("resume_write_pollution");
    expect(review.verdict).toBe("fail");
  });

  it("flags interview multi-question dumps and context rebinding loss", () => {
    const review = reviewAgentRun(run({
      task_type: "interview_coaching",
      agent_id: "interview",
    }), [
      step({
        tool_name: "generate_interview_questions",
        output_summary: "第1题？第2题？第3题？你是准备面什么公司、什么岗位的面试？",
      }),
    ]);

    expect(review.failureTypes).toContain("interview_policy_violation");
    expect(review.evidence.map((item) => item.code)).toEqual(
      expect.arrayContaining(["interview.multiple_questions", "interview.context_binding_lost"]),
    );
  });

  it("covers the deterministic failure taxonomy with synthetic runs", () => {
    const cases: Array<{
      name: string;
      expected: string;
      run: AgentRunRecord;
      steps: AgentRunStepRecord[];
    }> = [
      {
        name: "routing_error",
        expected: "routing_error",
        run: run({ contract_json: { routing: { requiresClarification: true, clarificationQuestion: "要评估 JD 还是 Offer？" } } }),
        steps: [],
      },
      {
        name: "guided_task_mismatch",
        expected: "guided_task_drift",
        run: run({
          task_type: "offer_evaluation",
          agent_id: "offer",
          contract_json: {
            routing: {
              routeLocked: true,
              activeTaskType: "career_positioning_guidance",
              activeTaskPhase: "deep_dive",
            },
          },
        }),
        steps: [],
      },
      {
        name: "tool_contract_mismatch",
        expected: "tool_contract_mismatch",
        run: run(),
        steps: [step({ output_summary: "blockedBy tool_governance" })],
      },
      {
        name: "context_loss",
        expected: "context_loss",
        run: run({ task_type: "jd_evaluation" }),
        steps: [step({ tool_name: "evaluate_jd_full", output_summary: "请重新上传 JD 截图或把 JD 发给我" })],
      },
      {
        name: "bad_output_rendering",
        expected: "bad_output_rendering",
        run: run({ result_json: { final: "评估结果似乎没有完整返回。| 修改前 | 修改后 | 原因 |" } }),
        steps: [],
      },
      {
        name: "profile_signal_noise",
        expected: "profile_signal_noise",
        run: run({ task_type: "profile_update", agent_id: "profile" }),
        steps: [step({ tool_name: "mine_profile", output_summary: "底线条件：去寻、野蛮、先解" })],
      },
      {
        name: "memory_governance_failure",
        expected: "memory_governance_failure",
        run: run({ task_type: "profile_update", contract_json: { taskType: "profile_update", target: "memory" } }),
        steps: [step({ tool_name: "memory_admin", status: "failed", output_summary: "候选记忆 approve not found, status transition failed" })],
      },
      {
        name: "user_intent_unresolved",
        expected: "user_intent_unresolved",
        run: run({ status: "cancelled" }),
        steps: [step({ output_summary: "user cancelled" })],
      },
      {
        name: "system_error",
        expected: "system_error",
        run: run({ status: "failed", error_json: { message: "Unhandled exception" } }),
        steps: [],
      },
    ];

    for (const item of cases) {
      const review = reviewAgentRun(item.run, item.steps);
      expect(review.failureTypes, item.name).toContain(item.expected);
    }
  });

  it("creates session anomaly candidates when image intake has no durable run", () => {
    const candidates = reviewAgentSessionAnomalies({
      userId: "user-1",
      sessionId: 10,
      messages: [
        { role: "user", content: "帮我评估一个JD", images: ["data:image/png;base64,AAAA"] },
        { role: "assistant", content: "请把 JD 文本贴给我", agent_id: "general" },
      ],
      recentRuns: [],
    });

    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      taskType: "jd_evaluation",
      failureType: "image_intake_not_called",
      runId: null,
      reviewId: null,
    });
    expect(candidates[0].expectedContract).toMatchObject({
      repairPlan: expect.objectContaining({ action: "rerun_image_intake" }),
    });
    expect(JSON.stringify(candidates[0])).not.toContain("data:image");
  });

  it("creates session anomaly candidates for failed tools without runs and false success messages", () => {
    const candidates = reviewAgentSessionAnomalies({
      userId: "user-1",
      sessionId: 11,
      messages: [
        { role: "user", content: "先帮我把简历技能清单保存" },
        {
          role: "tool",
          toolName: "save_resume_section",
          content: "HTTP 500",
          toolResult: { success: false, error: "HTTP 500 user@example.com 13800138000" },
        },
        { role: "assistant", content: "已保存到简历。", agent_id: "resume" },
      ],
      recentRuns: [],
    });

    expect(candidates.map((item) => item.failureType)).toEqual(
      expect.arrayContaining(["missing_run", "tool_failed_but_message_success"]),
    );
    expect(JSON.stringify(candidates)).not.toContain("user@example.com");
    expect(JSON.stringify(candidates)).not.toContain("13800138000");
  });

  it("creates session anomaly candidates for guided task drift", () => {
    const candidates = reviewAgentSessionAnomalies({
      userId: "user-1",
      sessionId: 12,
      activeTask: {
        taskId: "guided-1",
        taskType: "career_positioning_guidance",
        agentId: "profile",
        phase: "deep_dive",
      },
      messages: [
        { role: "user", content: "继续" },
        { role: "assistant", content: "我来评估这个 offer", agent_id: "offer" },
      ],
      recentRuns: [],
    });

    expect(candidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          taskType: "career_positioning_guidance",
          failureType: "guided_task_drift",
        }),
      ]),
    );
  });

  it("sanitizes eval/review JSON before admin exposure", () => {
    const sanitized = sanitizeReviewJson({
      resumeText: "很长的简历正文 ".repeat(80),
      imageBase64: "data:image/png;base64,AAAA",
      nested: { email: "user@example.com", phone: "13800138000" },
    });
    const serialized = JSON.stringify(sanitized);

    expect(serialized).not.toContain("user@example.com");
    expect(serialized).not.toContain("13800138000");
    expect(serialized).not.toContain("data:image");
    expect(serialized.length).toBeLessThan(900);
  });

  it("lets optional LLM judge add warnings but not downgrade deterministic failures", async () => {
    process.env.AGENT_RUN_REVIEW_LLM_JUDGE = "1";
    process.env.AGENT_RUN_REVIEW_LLM_API_KEY = "test-key";
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: JSON.stringify({
          qualityWarning: true,
          reason: "摘要缺少 A-G 分项，用户可能无法判断。",
          failureType: "llm_judge_quality_warning",
        }) } }],
      }),
    })));

    const deterministic = reviewAgentRun(run(), [
      step({ verifier_json: { readBackRequirement: { required: true, satisfied: false } } }),
    ]);
    const judged = await applyOptionalLlmJudge(run(), [], deterministic);

    expect(judged.verdict).toBe("fail");
    expect(judged.primaryFailureType).toBe("missing_readback");
    expect(judged.failureTypes).toContain("llm_judge_quality_warning");
  });

  it("generates redacted OpenSpec draft suggestions without writing files", () => {
    const draft = generateAgentRunOpenSpecDraftSuggestions([{
      id: 1,
      run_id: "run-secret",
      user_id: "user-secret",
      session_id: 1,
      task_type: "jd_evaluation",
      agent_id: "evaluate",
      verdict: "fail",
      score: 0.2,
      primary_failure_type: "image_intake_failure",
      failure_types: ["image_intake_failure"],
      evidence_json: [{
        code: "image_intake.failed",
        failureType: "image_intake_failure",
        severity: "fail",
        message: "OCR failed for user@example.com",
        snippet: "data:image/png;base64,AAAA 13800138000",
      }],
      suggested_fix: "route image intake first for sk-a0b9c1f642064a87bc2e4f4d8e79f6c3",
      eval_candidate_json: {},
      reviewer_version: "deterministic-v1",
      reviewed_at: "2026-06-10T00:00:00.000Z",
    }]);

    expect(draft).toContain("OpenSpec Draft Suggestions");
    expect(draft).toContain("jd_evaluation_image_intake_failure_regression");
    expect(draft).not.toContain("user@example.com");
    expect(draft).not.toContain("13800138000");
    expect(draft).not.toContain("data:image");
    expect(draft).not.toContain("sk-a0b9");
  });

  it("turns promoted eval candidates into redacted regression drafts without auto-apply", () => {
    const result = buildAgentEvalCandidateLifecycleResult({
      id: 7,
      review_id: 1,
      run_id: "run-secret",
      name: "JD Image Intake Failure",
      task_type: "jd_evaluation",
      failure_type: "image_intake_failure",
      input_summary: "帮我评估 JD user@example.com 13800138000 data:image/png;base64,AAAA",
      expected_contract_json: {
        expected: "image intake before evaluate_jd_full",
        token: "sk-a0b9c1f642064a87bc2e4f4d8e79f6c3",
      },
      fixture_json: {
        actual: "OCR failed for user@example.com",
        image: "data:image/png;base64,AAAA",
      },
      status: "promoted",
      admin_note: "",
      dedupe_key: "dedupe",
      created_at: "2026-06-10T00:00:00.000Z",
      updated_at: "2026-06-10T00:00:00.000Z",
    });
    const serialized = JSON.stringify(result);

    expect(result.lifecycle.status).toBe("promoted");
    expect(result.lifecycle.requiresExplicitDeveloperAction).toBe(true);
    expect(result.lifecycle.promotionDraft).toMatchObject({
      taskType: "jd_evaluation",
      failureType: "image_intake_failure",
      sourceCandidateId: 7,
      status: "draft",
    });
    expect(serialized).toContain("jd_evaluation_image_intake_failure_7_regression");
    expect(serialized).not.toContain("user@example.com");
    expect(serialized).not.toContain("13800138000");
    expect(serialized).not.toContain("data:image");
    expect(serialized).not.toContain("sk-a0b9");
    expect(serialized).toContain("不会自动创建");
  });
});
