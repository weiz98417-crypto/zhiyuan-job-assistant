import { describe, expect, it } from "vitest";
import { taskAgentId } from "@/lib/agent/guided-session-state";
import {
  DurableAgentRunService,
  InMemoryAgentRunStore,
} from "@/lib/agent/runtime/durable-agent-run";
import { DurableOrchestratorExecutionEngine } from "@/lib/agent/runtime/durable-orchestrator-engine";
import { createAgentTaskContract, type AgentTaskType } from "@/lib/agent/task-contract";
import { routeAgentTask } from "@/lib/agent/task-routing";
import { buildVerifiedActionSuccess } from "@/lib/agent/verified-action";

type RuntimeEvent = Record<string, unknown> & { type: string };

const resumeContent = "负责 Agent 产品设计并推动核心求职流程上线。";
const resumeVerifiedAction = buildVerifiedActionSuccess({
  action: "apply_resume_edit_proposal",
  targetType: "cv",
  targetField: "experience",
  versionId: "v2",
  data: { proposalId: "proposal-1", readBackVerified: true },
  expectedContent: resumeContent,
  readBackContent: resumeContent,
});

const reportBlocks = Object.fromEntries(
  ["a", "b", "c", "d", "e", "f", "g"].map((key) => [key, { content: `${key.toUpperCase()} 模块结果` }]),
);

const CASES: Array<{
  taskType: AgentTaskType;
  prompt: string;
  events: RuntimeEvent[];
  expectedDelivery?: RegExp;
}> = [
  {
    taskType: "general_chat",
    prompt: "请给我一份三步求职行动计划",
    events: [{ type: "text", content: "第一步明确目标，第二步投递，第三步复盘。" }],
  },
  {
    taskType: "career_positioning_guidance",
    prompt: "帮我做自我定位",
    events: [{
      type: "tool_result",
      name: "self_positioning",
      success: true,
      result: "4 阶段引导框架已加载，请引导用户从第一阶段开始。",
      data: { phases: ["第一阶段：设定期望"] },
    }],
    expectedDelivery: /第一阶段[\s\S]*最希望得到什么/,
  },
  {
    taskType: "resume_query",
    prompt: "读取我的简历",
    events: [
      { type: "tool_result", name: "read_file", success: true, result: "已读取当前简历", data: { content: resumeContent } },
      { type: "text", content: "你的简历目前重点展示了 Agent 产品设计经历。" },
    ],
  },
  {
    taskType: "resume_edit",
    prompt: "优化我的简历",
    events: [
      {
        type: "tool_result",
        name: "apply_resume_edit_proposal",
        success: true,
        result: "简历修改已应用并读回验证",
        data: { proposalId: "proposal-1", readBackVerified: true },
        verifiedAction: resumeVerifiedAction,
      },
      { type: "text", content: "修改已应用，并完成版本与读回校验。" },
    ],
  },
  {
    taskType: "jd_evaluation",
    prompt: "帮我评估这个 JD：负责 AI 产品规划和 Agent 落地，要求三年产品经验",
    events: [{
      type: "tool_result",
      name: "evaluate_jd_full",
      success: true,
      result: "JD 评估报告已生成",
      data: {
        jdText: "负责 AI 产品规划和 Agent 落地，要求三年产品经验并能推动跨团队协作。",
        blocks: reportBlocks,
        reportNum: 101,
        reportReadBackVerified: true,
      },
      uiPayload: { type: "jd_report", reportNum: 101 },
    }],
  },
  {
    taskType: "offer_evaluation",
    prompt: "帮我评估这个 Offer，月薪 30k",
    events: [{
      type: "tool_result",
      name: "evaluate_offer",
      success: true,
      result: "Offer 评估已生成",
      data: { id: 202, modules: [{ id: "compensation", content: "薪酬分析" }], readBackVerified: true },
      uiPayload: { type: "offer_report", reportId: 202, readBackVerified: true },
    }],
  },
  {
    taskType: "interview_coaching",
    prompt: "开始模拟面试",
    events: [
      {
        type: "tool_result",
        name: "start_interview_session",
        success: true,
        result: "模拟面试会话已创建",
        data: { sessionId: "interview-1", phase: "intro", question: "请介绍一个你主导的 Agent 项目。", readBackVerified: true },
        uiPayload: { type: "interview_session", sessionId: "interview-1" },
      },
      { type: "text", content: "第一题：请介绍一个你主导的 Agent 项目。" },
    ],
  },
  {
    taskType: "profile_update",
    prompt: "更新我的求职画像",
    events: [{
      type: "tool_result",
      name: "mine_profile",
      success: true,
      result: "画像已更新并读回验证",
      data: { done: true, collected: { targetRole: "AI 产品经理" }, readBackVerified: true },
      uiPayload: { type: "profile_update", readBackVerified: true },
    }],
  },
  {
    taskType: "reference_resume_save",
    prompt: "把这份优秀简历保存为参考简历",
    events: [{
      type: "tool_result",
      name: "save_reference_resume",
      success: true,
      result: "参考简历已保存并读回验证",
      data: {
        id: 303,
        name: "AI 产品经理参考简历",
        roleCategory: "AI产品经理",
        sections: [{ id: "experience", content: resumeContent }],
        readBackVerified: true,
      },
      uiPayload: { type: "reference_resume", id: 303, readBackVerified: true },
    }],
  },
  {
    taskType: "file_export",
    prompt: "导出这份报告 PDF",
    events: [{
      type: "tool_result",
      name: "export_file",
      success: true,
      result: "报告 PDF 已导出",
      data: { filename: "report.pdf", size: 2048, sha256: "verified-report-hash", readBackVerified: true },
      uiPayload: { type: "file_download", filename: "report.pdf", size: 2048, sha256: "verified-report-hash", readBackVerified: true },
    }],
  },
  {
    taskType: "job_search",
    prompt: "帮我找 3 个杭州 AI 产品经理岗位",
    events: [{
      type: "tool_result",
      name: "scan_portals",
      success: true,
      result: "岗位发现任务已创建并返回机会池",
      data: { scanId: "scan-1", count: 3, readBackVerified: true },
      uiPayload: { type: "job_discovery_batch", scanId: "scan-1", count: 3 },
    }],
  },
];

describe("Agent task runtime E2E", () => {
  it.each(CASES)("routes and completes $taskType without governance replacing delivery", async ({
    taskType,
    prompt,
    events,
    expectedDelivery,
  }) => {
    const route = routeAgentTask({ agentId: "general", content: prompt });
    expect(route.taskType).toBe(taskType);
    expect(route.requiresClarification).toBe(false);

    const runtime = new DurableAgentRunService(new InMemoryAgentRunStore());
    const savedConversations: Array<Array<{ role: string; content: string }>> = [];
    const contract = createAgentTaskContract({
      taskType,
      target: prompt,
      routing: {
        contractPolicy: route.contractPolicy,
        allowedTools: route.allowedTools,
        requiresClarification: route.requiresClarification,
      },
    });
    await runtime.createRun(
      { userId: `e2e-${taskType}` },
      {
        requestId: `request-${taskType}`,
        conversationId: CASES.findIndex((item) => item.taskType === taskType) + 1,
        taskType,
        agentId: taskAgentId(taskType),
        input: { content: prompt },
        contract,
      },
    );
    const run = await runtime.claimNextRun({ workerId: `worker-${taskType}` });
    const engine = new DurableOrchestratorExecutionEngine({
      runtime,
      loadConversation: async () => [],
      saveConversation: async (_principal, _conversationId, messages) => {
        savedConversations.push(messages);
      },
      orchestrate: async function* () {
        for (const event of events) yield event;
        yield { type: "done" };
      },
    });

    const result = await engine.execute({
      run: run!,
      checkpoint: null,
      signal: new AbortController().signal,
    });
    const runEvents = await runtime.listEvents({ userId: run!.userId }, run!.id, 0);
    const contractEvent = runEvents.find((event) => event.type === "run.contract_evaluated");
    const savedText = savedConversations.flat().map((message) => message.content).join("\n");

    expect(result.outcome).toBe("succeeded");
    expect(contractEvent?.payload).toMatchObject({ canClaimSuccess: true, outcome: "succeeded" });
    expect(savedText).not.toContain("这次任务还没有满足成功条件");
    if (expectedDelivery) expect(savedText).toMatch(expectedDelivery);
  });
});
