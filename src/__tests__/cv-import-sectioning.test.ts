import { afterEach, describe, expect, it, vi } from "vitest";

describe("CV import sectioning", () => {
  afterEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.doUnmock("@/lib/auth");
    vi.doUnmock("@/lib/data-repositories");
  });

  it("moves embedded project blocks out of experience when the model returns mixed sections", async () => {
    vi.stubEnv("DEEPSEEK_API_KEY", "test-key");
    vi.stubEnv("DEEPSEEK_RESUME_PARSE_MODEL", "deepseek-chat");
    let persistedCvData: unknown;
    vi.doMock("@/lib/auth", () => ({
      getCurrentUser: async () => ({ userId: "import-user", username: "import-user", role: "member", tokenVersion: 0 }),
    }));
    vi.doMock("@/lib/data-repositories", () => ({
      getDataRepositories: () => ({
        cv: {
          get: async () => persistedCvData ? { data_json: JSON.stringify(persistedCvData) } : undefined,
        },
        resumeDocuments: {
          createIntake: async (input: { document: { id: string; version_id: string }; cvData: unknown }) => {
            persistedCvData = input.cvData;
            return input.document;
          },
        },
      }),
    }));
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

    const { POST } = await import("@/app/api/cv/import/route");
    const response = await POST(request);
    const body = await response.json();

    expect(body.success).toBe(true);
    expect(body.data.sections.experience).toContain("某科技公司 AI产品经理");
    expect(body.data.sections.experience).not.toContain("纸鸢求职助手项目");
    expect(body.data.sections.projects).toContain("项目经历");
    expect(body.data.sections.projects).toContain("纸鸢求职助手项目");
    expect(body.data.sections.projects).toContain("评分引擎");
    expect(body.data.persisted.cvData).toBeTruthy();
  });

  it("rejects unauthenticated intake instead of returning parse-only success", async () => {
    vi.doMock("@/lib/auth", () => ({ getCurrentUser: async () => { throw new Error("Not authenticated"); } }));
    vi.doMock("@/lib/data-repositories", () => ({ getDataRepositories: vi.fn() }));
    const { POST } = await import("@/app/api/cv/import/route");

    const response = await POST(new Request("http://localhost/api/cv/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: "完整简历正文" }),
    }));
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.success).toBe(false);
  });

  it("stores Agent Chat image imports as pending with the original image payload", async () => {
    vi.stubEnv("DEEPSEEK_API_KEY", "test-key");
    let capturedIntake: Record<string, unknown> | undefined;
    let persistedCvData: unknown;
    vi.doMock("@/lib/auth", () => ({
      getCurrentUser: async () => ({ userId: "image-import-user", username: "image-user", role: "member", tokenVersion: 0 }),
    }));
    vi.doMock("@/lib/data-repositories", () => ({
      getDataRepositories: () => ({
        cv: { get: async () => persistedCvData ? { data_json: JSON.stringify(persistedCvData) } : undefined },
        resumeDocuments: {
          createIntake: async (input: Record<string, unknown>) => {
            capturedIntake = input;
            persistedCvData = input.cvData;
            return input.document;
          },
        },
      }),
    }));
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({
        personal: "张三 13800138000",
        summary: "AI 产品经理",
        experience: "负责 Agent 产品设计与交付 100%",
        projects: "",
        skills: "Prompt Engineering",
        education: "某大学 本科",
      }) } }],
    }), { status: 200, headers: { "Content-Type": "application/json" } })));
    const { POST } = await import("@/app/api/cv/import/route");

    const response = await POST(new Request("http://localhost/api/cv/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: "张三 13800138000\nAI 产品经理\n负责 Agent 产品设计与交付 100%\nPrompt Engineering\n某大学 本科",
        source: "image_ocr",
        originalImages: ["data:image/png;base64,original-image"],
      }),
    }));
    const body = await response.json();
    const artifact = capturedIntake?.artifact as { original_base64?: string; mime_type?: string };

    expect(response.status).toBe(200);
    expect(body.data.persisted.status).toBe("pending");
    expect(body.data.integrity).toMatchObject({
      status: "needs_review",
      verificationMode: "model_reconstructed",
    });
    expect(artifact.mime_type).toBe("application/x-resume-image-set+json");
    expect(JSON.parse(artifact.original_base64 || "[]")).toEqual(["data:image/png;base64,original-image"]);
  });
});
