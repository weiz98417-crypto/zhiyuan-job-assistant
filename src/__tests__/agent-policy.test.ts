import { describe, expect, it } from "vitest";
import { enforceToolPolicy, isToolAllowedInMode } from "@/lib/agent/loop/tool-policy";
import { buildAgentContextState, formatAgentContextState } from "@/lib/agent/memory/coordinator";
import { evaluateAgent } from "@/lib/agent/registry/agents/evaluate-agent";
import { interviewAgent } from "@/lib/agent/registry/agents/interview-agent";
import { getReportDetail } from "@/lib/agent/tools/query/get-report-detail";

describe("agent tool policy", () => {
  it("blocks evaluate agent web search unless explicitly requested", () => {
    const result = enforceToolPolicy({
      toolName: "web_search",
      params: { query: "字节 Seed 薪资" },
      messages: [{ role: "user", content: "根据我的简历重新评估这个JD" }],
      toolWhitelist: evaluateAgent.toolNames,
    });
    expect(result?.success).toBe(false);
    expect(result?.llmSummary).toContain("不要联网搜索");
  });

  it("blocks interview agent web search for JD preparation advice", () => {
    const result = enforceToolPolicy({
      toolName: "web_search",
      params: { query: "字节跳动 面经" },
      messages: [{ role: "user", content: "这个JD需要考察代码吗？我重点应该准备什么" }],
      toolWhitelist: interviewAgent.toolNames,
    });
    expect(result?.success).toBe(false);
  });

  it("allows interview web search when user explicitly asks for 面经", () => {
    const result = enforceToolPolicy({
      toolName: "web_search",
      params: { query: "字节跳动 AI数据运营 面经" },
      messages: [{ role: "user", content: "帮我搜一下字节这个岗位的面经" }],
      toolWhitelist: [...interviewAgent.toolNames, "web_search"],
    });
    expect(result).toBeNull();
  });

  it("blocks fetch_jd_content when user did not provide a fresh URL", () => {
    const result = enforceToolPolicy({
      toolName: "fetch_jd_content",
      params: { url: "https://stale.example/jobs/1" },
      messages: [{ role: "user", content: "现在根据我的简历对这个JD做完整评估" }],
      toolWhitelist: evaluateAgent.toolNames,
    });
    expect(result?.error).toContain("没有提供新的 JD 链接");
  });
});

describe("AgentContextState", () => {
  it("extracts recent JD, report number, resume mention, and supplemental company fact", () => {
    const state = buildAgentContextState([
      { role: "user", content: "JD：负责搭建 Agent 完成数据生产任务，要求 Python、Prompt Engineering、数据标注策略、模型调优，字节 Seed AI数据运营实习生。" },
      { role: "assistant", content: "报告编号: 5" },
      { role: "user", content: "公司是字节，而且我有简历啊" },
    ]);
    expect(state.latestJD?.bodyPreview).toContain("搭建 Agent");
    expect(state.latestReport?.reportNum).toBe(5);
    expect(state.targetCompany).toBe("字节跳动");
    expect(state.resumeMentioned).toBe(true);
    expect(formatAgentContextState(state)).toContain("用户后续补充");
  });
});

describe("agent tool whitelists", () => {
  it("evaluate agent can read resume and recent JD", () => {
    expect(evaluateAgent.toolNames).toContain("read_file");
    expect(evaluateAgent.toolNames).toContain("get_recent_jd_context");
    expect(evaluateAgent.toolNames).not.toContain("web_search");
  });

  it("global context tools remain executable even when a stale mode whitelist is narrower", () => {
    expect(isToolAllowedInMode("read_file", ["evaluate_jd_full"])).toBe(true);
    expect(isToolAllowedInMode("get_profile", ["evaluate_jd_full"])).toBe(true);
    expect(isToolAllowedInMode("get_recent_jd_context", ["generate_interview_questions"])).toBe(true);
    expect(isToolAllowedInMode("web_search", ["evaluate_jd_full"])).toBe(false);
  });

  it("interview agent reads local JD context and does not expose web_search by default", () => {
    expect(interviewAgent.toolNames).toContain("get_recent_jd_context");
    expect(interviewAgent.toolNames).not.toContain("web_search");
  });

  it("get_report_detail keeps full report out of LLM context", () => {
    expect(getReportDetail.toolCtxCap).toBeLessThanOrEqual(1200);
  });
});
