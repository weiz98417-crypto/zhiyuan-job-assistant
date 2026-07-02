import { afterEach, describe, expect, it, vi } from "vitest";
import { evaluateJDFull } from "@/lib/agent/tools/action/evaluate-jd-full";

vi.mock("@/lib/agent/tools/memory-helpers", () => ({
  fetchAgentMemoryContext: vi.fn(async () => null),
}));

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("evaluate_jd_full image/text priority", () => {
  it("does not forward images to the streaming evaluator when jd_text is already available", async () => {
    const stream = new ReadableStream({
      start(controller) {
        controller.close();
      },
    });
    const fetchMock = vi.fn(async (_input: Parameters<typeof fetch>[0], _init?: Parameters<typeof fetch>[1]) => (
      new Response(stream, { status: 200 })
    ));
    vi.stubGlobal("fetch", fetchMock);

    const jdText = "岗位职责：负责 AI 产品规划、需求分析、Agent 工作流设计、评测体系搭建和跨团队落地。任职要求：熟悉大模型应用、数据分析、Prompt Engineering 和产品交付。";
    const result = await evaluateJDFull.handler({
      jd_text: jdText,
      images: ["data:image/png;base64,abc"],
      target_company: "测试公司",
    });

    expect(result.success).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(String((init as RequestInit).body));
    expect(body.jdText).toBe(jdText);
    expect(body.images).toEqual([]);
  });
});
