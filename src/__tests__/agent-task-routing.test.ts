import { describe, expect, it } from "vitest";
import { inferAgentTaskType, routeAgentTask } from "@/lib/agent/task-routing";
import {
  createAgentTaskContract,
  inferCompletedCriteriaFromToolResult,
  resolveTaskContractRunOutcome,
} from "@/lib/agent/task-contract";
import type { ImageIntakeResult } from "@/lib/agent/image-intake";

describe("agent task routing", () => {
  it.each([
    ["请给我一份三步求职行动计划", "general_chat"],
    ["帮我做自我定位", "career_positioning_guidance"],
    ["读取我的简历", "resume_query"],
    ["优化我的简历", "resume_edit"],
    ["帮我评估这个 JD：负责 AI 产品规划", "jd_evaluation"],
    ["帮我评估这个 Offer，月薪 30k", "offer_evaluation"],
    ["开始模拟面试", "interview_coaching"],
    ["更新我的求职画像", "profile_update"],
    ["把这份优秀简历保存为参考简历", "reference_resume_save"],
    ["导出这份报告 PDF", "file_export"],
    ["帮我找 3 个杭州 AI 产品经理岗位", "job_search"],
  ] as const)("routes default-agent intent %s to %s", (content, expectedTaskType) => {
    const decision = routeAgentTask({ agentId: "general", content });

    expect(decision.taskType).toBe(expectedTaskType);
  });

  it("routes ordinary chat through the durable read-only runtime", () => {
    const decision = routeAgentTask({
      agentId: "general",
      content: "请给我一份三步求职行动计划",
    });

    expect(decision.taskType).toBe("general_chat");
    expect(decision.contractPolicy).toBe("read_only");
    expect(decision.memoryTask).toBe("general_chat");
    expect(decision.auditSummary).toBe("general:durable_chat");
  });

  it("does not route self-positioning guidance into profile write contracts", () => {
    expect(inferAgentTaskType({
      agentId: "profile",
      content: "帮我做自我定位",
    })).toBe("career_positioning_guidance");
    expect(inferAgentTaskType({
      agentId: "profile",
      content: "我很迷茫，不知道自己适合什么方向",
    })).toBe("career_positioning_guidance");
  });

  it("routes self-positioning from the default agent without contract blocking", () => {
    const decision = routeAgentTask({
      agentId: "general",
      content: "帮我做自我定位",
    });
    expect(decision.taskType).toBe("career_positioning_guidance");

    const contract = createAgentTaskContract({
      taskType: decision.taskType!,
      target: "帮我做自我定位",
    });
    const completedCriteria = [
      ...inferCompletedCriteriaFromToolResult(contract, {
        toolName: "self_positioning",
        toolSuccess: true,
        data: { stage: 1 },
      }),
      "next question or guidance response generated",
    ];
    const outcome = resolveTaskContractRunOutcome(contract, completedCriteria, {
      hasAssistantResponse: true,
      hasUserVisibleArtifact: false,
    });

    expect(outcome.status).toBe("succeeded");
    expect(outcome.gate.unmetCriteria).not.toContain("answer generated");
  });

  it("keeps explicit profile write intents under verified profile update contracts", () => {
    const decision = routeAgentTask({
      agentId: "profile",
      content: "根据刚才的对话更新我的求职画像",
    });
    expect(decision.taskType).toBe("profile_update");
    expect(decision.contractPolicy).toBe("high_risk_verified_write");
    expect(decision.memoryTask).toBe("profile_growth");
    expect(decision.allowedTools).toContain("mine_profile");
  });

  it("keeps other durable task routing intact", () => {
    expect(inferAgentTaskType({
      agentId: "evaluate",
      content: "帮我评估这个 JD",
    })).toBe("jd_evaluation");
    expect(inferAgentTaskType({
      agentId: "profile",
      content: "把这份简历保存为 AI 产品经理优秀简历",
    })).toBe("reference_resume_save");
  });

  it("routes clear job discovery requests to job_search with governed tools", () => {
    const decision = routeAgentTask({
      agentId: "general",
      content: "帮我找上海 AI 产品经理岗位，先扫一批 JD",
    });

    expect(decision.taskType).toBe("job_search");
    expect(decision.contractPolicy).toBe("verified_write");
    expect(decision.requiresClarification).toBe(false);
    expect(decision.allowedTools).toContain("scan_portals");
    expect(decision.allowedTools).toContain("search_jobs");
  });

  it("asks one clarification for vague job discovery requests", () => {
    const decision = routeAgentTask({
      agentId: "general",
      content: "帮我找岗位",
    });

    expect(decision.taskType).toBe("job_search");
    expect(decision.requiresClarification).toBe(true);
    expect(decision.clarificationQuestion).toContain("岗位关键词");
    expect(decision.allowedTools).toContain("scan_portals");
  });

  it("does not confuse JD evaluation with job discovery", () => {
    const decision = routeAgentTask({
      agentId: "evaluate",
      content: "帮我评估这个 JD",
    });

    expect(decision.taskType).toBe("jd_evaluation");
    expect(decision.allowedTools).toContain("evaluate_jd_full");
  });

  it("routes change-batch requests to job_search without creating a vague new scan route", () => {
    const decision = routeAgentTask({
      agentId: "general",
      content: "换一批",
    });

    expect(decision.taskType).toBe("job_search");
    expect(decision.requiresClarification).toBe(false);
    expect(decision.auditSummary).toBe("intent:job_search:next_batch");
  });

  it("routes current-resume read questions to a read-only resume query contract", () => {
    const decision = routeAgentTask({
      agentId: "resume",
      content: "我现在的简历是什么",
    });

    expect(decision.taskType).toBe("resume_query");
    expect(decision.contractPolicy).toBe("read_only");
    expect(decision.memoryTask).toBe("general_chat");
    expect(decision.allowedTools).toContain("read_file");
    expect(decision.allowedTools).not.toContain("apply_resume_edit_proposal");
  });

  it("keeps explicit resume edits under verified write contracts", () => {
    const decision = routeAgentTask({
      agentId: "resume",
      content: "帮我优化并修改这份简历",
    });

    expect(decision.taskType).toBe("resume_edit");
    expect(decision.contractPolicy).toBe("high_risk_verified_write");
    expect(decision.allowedTools).toContain("create_resume_edit_proposal");
  });

  it("routes matching JD image requests into JD evaluation", () => {
    const imageIntake: ImageIntakeResult = {
      documentType: "jd",
      confidence: 0.92,
      quality: "clear",
      extractedText: "数据产品经理岗位职责：负责数据产品规划、需求分析、数据看板、BI 指标体系和跨团队协作。",
    };

    const decision = routeAgentTask({
      agentId: "general",
      content: "帮我评估这个 JD",
      imageIntake,
    });

    expect(decision.taskType).toBe("jd_evaluation");
    expect(decision.contractPolicy).toBe("high_risk_verified_write");
    expect(decision.allowedTools).toContain("evaluate_jd_full");
    expect(decision.requiresClarification).toBe(false);
  });

  it("asks clarification when JD text conflicts with an Offer image", () => {
    const imageIntake: ImageIntakeResult = {
      documentType: "offer",
      confidence: 0.91,
      quality: "clear",
      extractedText: "录用 Offer：月薪 30000，年终奖 2 个月，试用期 6 个月，五险一金按实际工资缴纳。",
    };

    const decision = routeAgentTask({
      agentId: "general",
      content: "帮我评估这个 JD",
      imageIntake,
    });

    expect(decision.taskType).toBe("offer_evaluation");
    expect(decision.requiresClarification).toBe(true);
    expect(decision.blockedReason).toContain("不一致");
    expect(decision.allowedTools).toContain("evaluate_offer");
  });

  it("routes matching Offer image requests into Offer evaluation", () => {
    const imageIntake: ImageIntakeResult = {
      documentType: "offer",
      confidence: 0.93,
      quality: "clear",
      extractedText: "正式 Offer：岗位 AI 产品经理，月薪 30000，13 薪，试用期 3 个月，地点深圳。",
    };

    const decision = routeAgentTask({
      agentId: "general",
      content: "帮我评估这个 Offer",
      imageIntake,
    });

    expect(decision.taskType).toBe("offer_evaluation");
    expect(decision.contractPolicy).toBe("high_risk_verified_write");
    expect(decision.allowedTools).toContain("evaluate_offer");
  });

  it("creates a durable read-only Run for saved-report HR question handoff", () => {
    const decision = routeAgentTask({
      agentId: "offer",
      content: "Please use offerReportId=12 and call generate_offer_hr_question_list. Do not re-evaluate the Offer.",
    });

    expect(decision.taskType).toBe("general_chat");
    expect(decision.contractPolicy).toBe("read_only");
    expect(decision.allowedTools).toContain("generate_offer_hr_question_list");
    expect(decision.auditSummary).toBe("agent:offer:saved_report_assist");
  });

  it("creates a durable read-only Run for saved-report negotiation handoff", () => {
    const decision = routeAgentTask({
      agentId: "offer",
      content: "Please use offerReportId=12 and call generate_offer_negotiation_strategy. Do not re-evaluate the Offer.",
    });

    expect(decision.taskType).toBe("general_chat");
    expect(decision.contractPolicy).toBe("read_only");
    expect(decision.allowedTools).toContain("generate_offer_negotiation_strategy");
    expect(decision.auditSummary).toBe("agent:offer:saved_report_assist");
  });

  it("routes resume screenshots to read-only resume handling instead of JD or Offer evaluation when no edit is requested", () => {
    const imageIntake: ImageIntakeResult = {
      documentType: "resume",
      confidence: 0.9,
      quality: "clear",
      extractedText: "个人简历：5 年 C 端产品经验，海外社交和 AI 应用方向，负责用户增长、需求分析和产品迭代。",
    };

    const decision = routeAgentTask({
      agentId: "general",
      content: "这是我的简历截图，帮我看一下",
      imageIntake,
    });

    expect(decision.taskType).toBe("resume_query");
    expect(decision.allowedTools).toContain("read_file");
    expect(decision.allowedTools).not.toContain("evaluate_jd_full");
    expect(decision.allowedTools).not.toContain("evaluate_offer");
  });

  it("routes self-positioning to guidance contract with guide/read tools only", () => {
    const decision = routeAgentTask({
      agentId: "profile",
      content: "帮我做自我定位",
    });

    expect(decision.taskType).toBe("career_positioning_guidance");
    expect(decision.contractPolicy).toBe("guidance");
    expect(decision.memoryTask).toBe("profile_growth");
    expect(decision.allowedTools).toContain("self_positioning");
    expect(decision.allowedTools).toContain("get_profile");
  });

  it("keeps short follow-up answers inside active self-positioning", () => {
    const decision = routeAgentTask({
      agentId: "offer",
      content: "1. 可以",
      activeTask: {
        taskId: "guided-1",
        taskType: "career_positioning_guidance",
        agentId: "profile",
        status: "waiting_user",
        phase: "expectation",
        expectedInput: "回答当前自我定位问题",
        startedAt: "2026-06-15T00:00:00.000Z",
        lastUpdatedAt: "2026-06-15T00:01:00.000Z",
      },
    });

    expect(decision.taskType).toBe("career_positioning_guidance");
    expect(decision.auditSummary).toContain("guided:career_positioning_guidance:locked");
    expect(decision.allowedTools).toContain("self_positioning");
    expect(decision.allowedTools).not.toContain("evaluate_offer");
  });

  it("asks clarification for symbol-only input inside an active JD evaluation", () => {
    const decision = routeAgentTask({
      agentId: "evaluate",
      content: "+",
      activeTask: {
        taskId: "jd-eval-1",
        taskType: "jd_evaluation",
        agentId: "evaluate",
        status: "waiting_user",
        phase: "active",
        expectedInput: "继续当前任务",
        startedAt: "2026-06-15T00:00:00.000Z",
        lastUpdatedAt: "2026-06-15T00:01:00.000Z",
      },
    });

    expect(decision.taskType).toBe("jd_evaluation");
    expect(decision.requiresClarification).toBe(true);
    expect(decision.clarificationQuestion).toContain("我只看到“+”");
    expect(decision.auditSummary).toContain("non_semantic_input");
    expect(decision.allowedTools).toContain("evaluate_jd_full");
  });

  it("asks clarification for symbol-only input in the evaluate agent", () => {
    const decision = routeAgentTask({
      agentId: "evaluate",
      content: "+",
    });

    expect(decision.taskType).toBe("jd_evaluation");
    expect(decision.requiresClarification).toBe(true);
    expect(decision.clarificationQuestion).toContain("JD 评估");
    expect(decision.auditSummary).toBe("agent:evaluate:non_semantic_input");
  });

  it("asks confirmation before switching away from active self-positioning", () => {
    const decision = routeAgentTask({
      agentId: "offer",
      content: "先评估一下这个 offer",
      activeTask: {
        taskId: "guided-2",
        taskType: "career_positioning_guidance",
        agentId: "profile",
        status: "active",
        phase: "deep_dive",
        expectedInput: "回答当前自我定位问题",
        startedAt: "2026-06-15T00:00:00.000Z",
        lastUpdatedAt: "2026-06-15T00:01:00.000Z",
      },
    });

    expect(decision.taskType).toBe("career_positioning_guidance");
    expect(decision.requiresClarification).toBe(true);
    expect(decision.clarificationQuestion).toContain("切换到「Offer 评估」");
    expect(decision.allowedTools).not.toContain("evaluate_offer");
  });

  it("asks confirmation before switching from active guidance to resume query", () => {
    const decision = routeAgentTask({
      agentId: "profile",
      content: "我现在的简历是什么",
      activeTask: {
        taskId: "guided-resume-query",
        taskType: "career_positioning_guidance",
        agentId: "profile",
        status: "active",
        phase: "deep_dive",
        startedAt: "2026-06-15T00:00:00.000Z",
        lastUpdatedAt: "2026-06-15T00:01:00.000Z",
      },
    });

    expect(decision.taskType).toBe("career_positioning_guidance");
    expect(decision.requiresClarification).toBe(true);
    expect(decision.clarificationQuestion).toContain("简历查询");
    expect(decision.allowedTools).not.toContain("apply_resume_edit_proposal");
  });

  it("routes confirmed switches from active guidance to resume query", () => {
    const decision = routeAgentTask({
      agentId: "profile",
      content: "确认切换到简历查询",
      activeTask: {
        taskId: "guided-resume-query-confirmed",
        taskType: "career_positioning_guidance",
        agentId: "profile",
        status: "active",
        phase: "deep_dive",
        startedAt: "2026-06-15T00:00:00.000Z",
        lastUpdatedAt: "2026-06-15T00:01:00.000Z",
      },
    });

    expect(decision.taskType).toBe("resume_query");
    expect(decision.requiresClarification).toBe(false);
    expect(decision.contractPolicy).toBe("read_only");
  });

  it("routes confirmed switches to the requested task", () => {
    const decision = routeAgentTask({
      agentId: "offer",
      content: "确认切换到 offer 评估",
      activeTask: {
        taskId: "guided-3",
        taskType: "career_positioning_guidance",
        agentId: "profile",
        status: "active",
        phase: "deep_dive",
        startedAt: "2026-06-15T00:00:00.000Z",
        lastUpdatedAt: "2026-06-15T00:01:00.000Z",
      },
    });

    expect(decision.taskType).toBe("offer_evaluation");
    expect(decision.requiresClarification).toBe(false);
    expect(decision.allowedTools).toContain("evaluate_offer");
  });

  it("blocks confirmed switches that are absent from the shared journey graph", () => {
    const decision = routeAgentTask({
      agentId: "general",
      content: "确认切换到岗位发现",
      activeTask: {
        taskId: "offer-1",
        taskType: "offer_evaluation",
        agentId: "offer",
        status: "waiting_user",
        startedAt: "2026-08-26T00:00:00.000Z",
        lastUpdatedAt: "2026-08-26T00:00:00.000Z",
      },
    });
    expect(decision.taskType).toBe("offer_evaluation");
    expect(decision.requiresClarification).toBe(true);
    expect(decision.blockedReason).toContain("illegal task transition");
  });

  it("routes short evaluate replies from JD image clarification into JD evaluation instead of the stale profile lock", () => {
    const decision = routeAgentTask({
      agentId: "profile",
      content: "评估",
      activeTask: {
        taskId: "career-positioning-image-clarification",
        taskType: "career_positioning_guidance",
        agentId: "profile",
        status: "waiting_user",
        phase: "image_intent_clarification",
        expectedInput: "我识别到这像是 JD 截图。你要我先评估，还是先帮你提取关键内容？",
        documentType: "jd",
        imageRoute: "clarify_intent",
        source: "image_clarification",
        sourceText: "数据产品经理岗位职责：负责需求调研、AI解决方案、SQL、BI数据产品。",
        startedAt: "2026-06-16T00:00:00.000Z",
        lastUpdatedAt: "2026-06-16T00:01:00.000Z",
      },
    });

    expect(decision.taskType).toBe("jd_evaluation");
    expect(decision.requiresClarification).toBe(false);
    expect(decision.auditSummary).toContain("guided:image_clarification:confirmed");
    expect(decision.allowedTools).toContain("evaluate_jd_full");
    expect(decision.allowedTools).not.toContain("self_positioning");
  });

  it("keeps interview next-question turns inside active interview coaching", () => {
    const decision = routeAgentTask({
      agentId: "general",
      content: "下一题呗",
      activeTask: {
        taskId: "interview-1",
        taskType: "interview_coaching",
        agentId: "interview",
        status: "waiting_user",
        phase: "one_question_loop",
        expectedInput: "回答当前面试题或要求下一题",
        startedAt: "2026-06-15T00:00:00.000Z",
        lastUpdatedAt: "2026-06-15T00:01:00.000Z",
      },
    });

    expect(decision.taskType).toBe("interview_coaching");
    expect(decision.contractPolicy).toBe("verified_write");
    expect(decision.allowedTools).toContain("generate_interview_questions");
  });
});
