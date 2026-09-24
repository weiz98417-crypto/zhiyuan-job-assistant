import { afterEach, describe, expect, it, vi } from "vitest";
import { createAgentTaskContract } from "@/lib/agent/task-contract";

const executeToolMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/agent/tools", () => ({
  executeTool: executeToolMock,
  formatToolResult: (result: { llmSummary?: string }) => result.llmSummary || "图片识别完成",
  getTool: () => ({
    parameters: { images: { type: "array", required: true, description: "images" } },
    toolCtxCap: 800,
    formatResult: () => "图片识别完成",
  }),
}));

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  executeToolMock.mockReset();
});

describe("server Agent Loop image compatibility", () => {
  it("injects the latest user images into image-capable tools", async () => {
    vi.stubEnv("DEEPSEEK_API_KEY", "test-key");
    vi.stubEnv("ZHIPU_API_KEY", "");
    executeToolMock.mockResolvedValue({
      success: true,
      data: { documentType: "resume" },
      llmSummary: "图片识别完成",
      errorCategory: "ok",
    });
    const encoder = new TextEncoder();
    const responses = [
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call-1","function":{"name":"evaluate_jd_full","arguments":"{}"}}]}}]}\n\ndata: [DONE]\n\n',
      'data: {"choices":[{"delta":{"content":"已识别图片。"}}]}\n\ndata: [DONE]\n\n',
    ];
    vi.stubGlobal("fetch", vi.fn(async () => new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(responses.shift() || "data: [DONE]\n\n"));
        controller.close();
      },
    }), { status: 200 })));
    const { agentLoopServer } = await import("@/lib/agent/loop/server-runner");

    for await (const _event of agentLoopServer({
      agent: { id: "evaluate", model: "deepseek-v4-flash", toolNames: ["evaluate_jd_full"] } as never,
      systemPrompt: "识别用户图片",
      messages: [{
        role: "user",
        content: "这是我的简历",
        images: ["data:image/png;base64,resume-image"],
      }],
      tools: [{ type: "function", function: { name: "evaluate_jd_full" } }],
    })) {
    }

    expect(executeToolMock).toHaveBeenCalledWith(
      "evaluate_jd_full",
      { images: ["data:image/png;base64,resume-image"] },
      undefined,
    );
  });

  it("evaluates the current JD screenshot before a model can choose an older JD", async () => {
    vi.stubEnv("DEEPSEEK_API_KEY", "test-key");
    executeToolMock.mockResolvedValue({
      success: true,
      data: { reportNum: 3 },
      llmSummary: "新 JD 已评估",
      errorCategory: "ok",
    });
    const requestBodies: Record<string, unknown>[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_url, init) => {
      requestBodies.push(JSON.parse(String(init?.body || "{}")) as Record<string, unknown>);
      return new Response('data: {"choices":[{"delta":{"content":"这份新 JD 已评估。"}}]}\n\ndata: [DONE]\n\n', { status: 200 });
    }));
    const { agentLoopServer } = await import("@/lib/agent/loop/server-runner");
    const events = [];

    for await (const event of agentLoopServer({
      agent: { id: "evaluate", toolNames: ["evaluate_jd_full", "get_recent_jd_context"] } as never,
      systemPrompt: "JD 助手",
      messages: [
        { role: "assistant", content: "上一份 JD 已评估。" },
        { role: "user", content: "评估这张新 JD", images: ["data:image/png;base64,current-jd"] },
      ],
      tools: [{ type: "function", function: { name: "evaluate_jd_full" } }],
      taskContract: createAgentTaskContract({ taskType: "jd_evaluation", target: "评估这张新 JD" }),
    })) events.push(event);

    expect(executeToolMock).toHaveBeenCalledWith("evaluate_jd_full", {
      images: ["data:image/png;base64,current-jd"],
    }, undefined);
    expect(requestBodies).toHaveLength(1);
    expect(events.some((event) => event.type === "text" && event.content.includes("新 JD"))).toBe(true);
  });

  it("serializes verified tool history as ordinary model context", async () => {
    vi.stubEnv("DEEPSEEK_API_KEY", "test-key");
    const requestBodies: Record<string, unknown>[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_url, init) => {
      requestBodies.push(JSON.parse(String(init?.body || "{}")) as Record<string, unknown>);
      return new Response('data: {"choices":[{"delta":{"content":"我继续回答。"}}]}\n\ndata: [DONE]\n\n', { status: 200 });
    }));
    const { agentLoopServer } = await import("@/lib/agent/loop/server-runner");

    for await (const _event of agentLoopServer({
      systemPrompt: "求职助手",
      messages: [
        { role: "tool", content: "[VERIFIED_TOOL_FACT tool=evaluate_jd_full] 已写入报告" },
        { role: "user", content: "继续分析" },
      ],
    })) {
    }

    const messages = requestBodies[0].messages as Array<{ role: string; content: string; tool_call_id?: string }>;
    expect(messages.some((message) => message.role === "tool")).toBe(false);
    expect(messages.some((message) => message.role === "user" && message.content.includes("已完成的工具记录"))).toBe(true);
    expect(messages.every((message) => !message.tool_call_id)).toBe(true);
  });

  it("blocks resume-reading tools when the JD contract forbids matching", async () => {
    vi.stubEnv("DEEPSEEK_API_KEY", "test-key");
    const requestBodies: Record<string, unknown>[] = [];
    const responses = [
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call-1","function":{"name":"read_file","arguments":"{\\"path\\":\\"我的简历\\"}"}}]}}]}\n\ndata: [DONE]\n\n',
      'data: {"choices":[{"delta":{"content":"我只分析这份 JD 本身。"}}]}\n\ndata: [DONE]\n\n',
    ];
    vi.stubGlobal("fetch", vi.fn(async (_url, init) => {
      requestBodies.push(JSON.parse(String(init?.body || "{}")) as Record<string, unknown>);
      return new Response(responses.shift() || "data: [DONE]\n\n", { status: 200 });
    }));
    const { agentLoopServer } = await import("@/lib/agent/loop/server-runner");
    const contract = createAgentTaskContract({ taskType: "jd_evaluation", target: "评估这份 JD" });
    contract.routing = { jdMatchResume: false };

    for await (const _event of agentLoopServer({
      agent: { id: "evaluate", toolNames: ["read_file", "get_profile", "evaluate_jd_full"] } as never,
      systemPrompt: "JD 助手",
      messages: [{ role: "user", content: "评估这份 JD，但不要匹配我的简历" }],
      tools: [
        { type: "function", function: { name: "read_file" } },
        { type: "function", function: { name: "get_profile" } },
        { type: "function", function: { name: "evaluate_jd_full" } },
      ],
      taskContract: contract,
    })) {
    }

    expect(executeToolMock).not.toHaveBeenCalled();
    const toolNames = (requestBodies[0].tools as Array<{ function: { name: string } }>).map((tool) => tool.function.name);
    expect(toolNames).toEqual(["evaluate_jd_full"]);
  });

  it("passes the current resume screenshot to the model for read-only diagnosis", async () => {
    vi.stubEnv("DEEPSEEK_API_KEY", "test-key");
    const requestBodies: Record<string, unknown>[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_url, init) => {
      requestBodies.push(JSON.parse(String(init?.body || "{}")) as Record<string, unknown>);
      return new Response('data: {"choices":[{"delta":{"content":"内容和结构清晰；ATS 标题建议标准化。"}}]}\n\ndata: [DONE]\n\n', {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      });
    }));
    const { agentLoopServer } = await import("@/lib/agent/loop/server-runner");
    const events = [];

    for await (const event of agentLoopServer({
      agent: { id: "resume", toolNames: ["read_file", "apply_resume_edit_proposal"] } as never,
      systemPrompt: "简历助手",
      messages: [
        { role: "user", content: "评估之前的简历", images: ["data:image/png;base64,old"] },
        { role: "assistant", content: "可以" },
        { role: "user", content: "评估这份简历", images: ["data:image/png;base64,current"] },
      ],
      tools: [{ type: "function", function: { name: "read_file" } }],
      taskContract: createAgentTaskContract({ taskType: "resume_diagnosis", target: "评估这份简历" }),
    })) events.push(event);

    expect(requestBodies).toHaveLength(1);
    expect(requestBodies[0]).not.toHaveProperty("tools");
    const modelMessages = requestBodies[0].messages as Array<{ role: string; content: unknown }>;
    expect(modelMessages[1].content).toBe("评估之前的简历");
    expect(modelMessages.at(-1)?.content).toEqual([
      { type: "text", text: "评估这份简历" },
      { type: "image_url", image_url: { url: "data:image/png;base64,current" } },
    ]);
    expect(executeToolMock).not.toHaveBeenCalled();
    expect(events.some((event) => event.type === "text" && event.content.includes("ATS"))).toBe(true);
  });

  it("invites pasted resume text after a screenshot model failure", async () => {
    vi.stubEnv("DEEPSEEK_API_KEY", "test-key");
    vi.stubGlobal("fetch", vi.fn(async () => new Response("invalid image", { status: 400 })));
    const { agentLoopServer } = await import("@/lib/agent/loop/server-runner");
    const events = [];

    for await (const event of agentLoopServer({
      agent: { id: "resume", toolNames: [] } as never,
      systemPrompt: "简历助手",
      messages: [{ role: "user", content: "评估这份简历", images: ["data:image/png;base64,current"] }],
      taskContract: createAgentTaskContract({ taskType: "resume_diagnosis", target: "评估这份简历" }),
    })) events.push(event);

    expect(events.filter((event) => event.type === "text")).toHaveLength(1);
    expect(events.some((event) => event.type === "text" && event.content.includes("当前对话粘贴简历文字"))).toBe(true);
    expect(events).toContainEqual(expect.objectContaining({ type: "run_directive", directive: "wait_user" }));
    expect(events.at(-1)).toEqual({ type: "done" });
  });

  it("does not blame an unreadable screenshot for a provider connection failure", async () => {
    vi.stubEnv("DEEPSEEK_API_KEY", "test-key");
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("connection reset"); }));
    const { agentLoopServer } = await import("@/lib/agent/loop/server-runner");
    const events = [];

    for await (const event of agentLoopServer({
      agent: { id: "resume", toolNames: [] } as never,
      systemPrompt: "简历助手",
      messages: [{ role: "user", content: "评估这份简历", images: ["data:image/png;base64,current"] }],
      taskContract: createAgentTaskContract({ taskType: "resume_diagnosis", target: "评估这份简历" }),
    })) events.push(event);

    expect(events.some((event) => event.type === "run_directive" && event.directive === "wait_user")).toBe(false);
    expect(events.some((event) => event.type === "text" && event.content.includes("截图暂时无法读清"))).toBe(false);
    expect(events.some((event) => event.type === "text" && event.content.includes("AI 请求失败"))).toBe(true);
  });

  it("does not claim a resume was diagnosed when the model returns no answer", async () => {
    vi.stubEnv("DEEPSEEK_API_KEY", "test-key");
    vi.stubGlobal("fetch", vi.fn(async () => new Response("data: [DONE]\n\n", {
      status: 200,
      headers: { "Content-Type": "text/event-stream" },
    })));
    const { agentLoopServer } = await import("@/lib/agent/loop/server-runner");
    const events = [];

    for await (const event of agentLoopServer({
      agent: { id: "resume", toolNames: [] } as never,
      systemPrompt: "简历助手",
      messages: [{ role: "user", content: "评估这份简历", images: ["data:image/png;base64,current"] }],
      taskContract: createAgentTaskContract({ taskType: "resume_diagnosis", target: "评估这份简历" }),
    })) events.push(event);

    expect(events.some((event) => event.type === "error" && event.message.includes("empty response"))).toBe(true);
    expect(events.some((event) => event.type === "text" && event.content === "操作完成。")).toBe(false);
  });

  it("aborts an in-flight diagnosis request when the Run is cancelled", async () => {
    vi.stubEnv("DEEPSEEK_API_KEY", "test-key");
    const controller = new AbortController();
    const fetchMock = vi.fn((_url: string, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
      controller.abort();
    }));
    vi.stubGlobal("fetch", fetchMock);
    const { agentLoopServer } = await import("@/lib/agent/loop/server-runner");
    const events = [];

    for await (const event of agentLoopServer({
      agent: { id: "resume", toolNames: [] } as never,
      systemPrompt: "简历助手",
      messages: [{ role: "user", content: "评估这份简历", images: ["data:image/png;base64,current"] }],
      taskContract: createAgentTaskContract({ taskType: "resume_diagnosis", target: "评估这份简历" }),
      signal: controller.signal,
    })) events.push(event);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(events.at(-1)).toEqual({ type: "done" });
    expect(events.some((event) => event.type === "text" || event.type === "run_directive")).toBe(false);
  });

  it("continues an unreadable screenshot with pasted text without resending the old image", async () => {
    vi.stubEnv("DEEPSEEK_API_KEY", "test-key");
    const requestBodies: Record<string, unknown>[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_url, init) => {
      const body = JSON.parse(String(init?.body || "{}")) as Record<string, unknown>;
      requestBodies.push(body);
      return new Response('data: {"choices":[{"delta":{"content":"这份简历可补充量化成果和标准 ATS 标题。"}}]}\n\ndata: [DONE]\n\n', {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      });
    }));
    const { agentLoopServer } = await import("@/lib/agent/loop/server-runner");
    const contract = createAgentTaskContract({
      taskType: "resume_diagnosis",
      target: "评估这份简历",
      routing: { requiresClarification: true, clarificationQuestion: "请在当前对话粘贴简历文字。" },
    });
    const events = [];

    for await (const event of agentLoopServer({
      agent: { id: "resume", toolNames: ["read_file"] } as never,
      systemPrompt: "简历助手",
      messages: [
        { role: "user", content: "评估这份简历", images: ["data:image/png;base64,old"] },
        { role: "assistant", content: "请在当前对话粘贴简历文字。" },
        { role: "user", content: "工作经历：负责 AI 产品规划。项目经历：搭建 RAG 知识库。" },
      ],
      taskContract: contract,
    })) events.push(event);

    expect(requestBodies).toHaveLength(1);
    const modelMessages = requestBodies[0].messages as Array<{ content: unknown }>;
    expect(modelMessages.every((message) => !JSON.stringify(message.content).includes("data:image/"))).toBe(true);
    expect(events.some((event) => event.type === "text" && event.content.includes("量化成果"))).toBe(true);
    expect(events.some((event) => event.type === "run_directive")).toBe(false);
  });

  it("retries a new screenshot in the same diagnosis despite the old clarification", async () => {
    vi.stubEnv("DEEPSEEK_API_KEY", "test-key");
    const requestBodies: Record<string, unknown>[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_url, init) => {
      requestBodies.push(JSON.parse(String(init?.body || "{}")) as Record<string, unknown>);
      return new Response('data: {"choices":[{"delta":{"content":"新截图显示成果数字较少，建议补齐量化证据。"}}]}\n\ndata: [DONE]\n\n', {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      });
    }));
    const { agentLoopServer } = await import("@/lib/agent/loop/server-runner");
    const events = [];

    for await (const event of agentLoopServer({
      agent: { id: "resume", toolNames: [] } as never,
      systemPrompt: "简历助手",
      messages: [
        { role: "user", content: "评估这份简历", images: ["data:image/png;base64,old"] },
        { role: "assistant", content: "请重新上传清晰截图。" },
        { role: "user", content: "换这张清晰截图继续评估", images: ["data:image/png;base64,new"] },
      ],
      taskContract: createAgentTaskContract({
        taskType: "resume_diagnosis",
        target: "评估这份简历",
        routing: { requiresClarification: true, clarificationQuestion: "请重新上传清晰截图。" },
      }),
    })) events.push(event);

    expect(requestBodies).toHaveLength(1);
    const serializedMessages = JSON.stringify(requestBodies[0].messages);
    expect(serializedMessages).toContain("data:image/png;base64,new");
    expect(serializedMessages).not.toContain("data:image/png;base64,old");
    expect(events.some((event) => event.type === "text" && event.content.includes("新截图"))).toBe(true);
    expect(events.some((event) => event.type === "run_directive")).toBe(false);
  });
});
