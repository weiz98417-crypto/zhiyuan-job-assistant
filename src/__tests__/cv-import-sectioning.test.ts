import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/cv/import/route";

describe("CV import sectioning", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("moves embedded project blocks out of experience when the model returns mixed sections", async () => {
    vi.stubEnv("DEEPSEEK_API_KEY", "test-key");
    vi.stubEnv("DEEPSEEK_RESUME_PARSE_MODEL", "deepseek-chat");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      choices: [{
        message: {
          content: JSON.stringify({
            personal: "李文浩 13800000000 liwenhao@example.com",
            summary: "5年AI产品经验，负责求职助手与Agent系统产品。",
            experience: [
              "某科技公司 AI产品经理 2022.03-至今",
              "负责AI求职助手的需求分析、功能规划、跨端协作和上线迭代。",
              "项目经历",
              "纸鸢求职助手项目",
              "项目背景：用户需要把JD评估、简历优化、面试准备集中到同一产品中。",
              "核心工作：设计评分引擎、简历解析、Agent Chat和多页面联动。",
              "项目成果：完成扫描版PDF解析、报告生成和多Agent协作链路。",
            ].join("\n"),
            projects: "",
            skills: "SQL、Prompt Engineering、产品规划、用户研究",
            education: "某大学 本科",
          }),
        },
      }],
    }), { status: 200, headers: { "Content-Type": "application/json" } })));

    const request = new Request("http://localhost/api/cv/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: "李文浩简历全文" }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(body.success).toBe(true);
    expect(body.data.sections.experience).toContain("某科技公司 AI产品经理");
    expect(body.data.sections.experience).not.toContain("纸鸢求职助手项目");
    expect(body.data.sections.projects).toContain("项目经历");
    expect(body.data.sections.projects).toContain("纸鸢求职助手项目");
    expect(body.data.sections.projects).toContain("评分引擎");
  });
});
