/** spec 32 路由级行为锁定：summarize 路由经 llm-json 收口后的成功形态/截断修复/失败文案。
 *  代表性路由级验证（summarize 为三处「parse→围栏兜底」同型样板的共用形状；
 *  news 已有 news-routes.test.ts，import-reference 四形态基线在 llm-json-repair.test.ts）。 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fetchMock = vi.fn();

import { POST } from "@/app/api/chat/summarize/route";

beforeEach(() => {
  vi.stubEnv("DEEPSEEK_API_KEY", "test-key");
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

function summarizeRequest(): Request {
  const messages = [1, 2, 3].map((round) => ({ role: "user" as const, content: `第${round}轮:我在找 AI 产品经理的岗位,负责10人团队` }));
  return new Request("http://localhost:3000/api/chat/summarize", {
    method: "POST",
    body: JSON.stringify({ messages }),
  });
}

function deepseekBody(content: string) {
  return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content } }] }), text: async () => "" };
}

describe("chat/summarize JSON 收口行为锁定 (spec 32)", () => {
  it("围栏 JSON → 200,成功形态与迁移前一致", async () => {
    fetchMock.mockResolvedValue(deepseekBody('```json\n{"targetRoles":["AI 产品经理"],"narrative":"测试"}\n```'));
    const res = await POST(summarizeRequest());
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.targetRoles).toEqual(["AI 产品经理"]);
    expect(body.data.skills).toMatchObject({ advantage: "未提及" });
  });

  it("max_tokens 截断 JSON → 200,截断修复后正常出数据", async () => {
    fetchMock.mockResolvedValue(deepseekBody('{"targetRoles":["AI 产品经理","数据分'));
    const res = await POST(summarizeRequest());
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.targetRoles).toEqual(["AI 产品经理", "数据分"]);
  });

  it("彻底不可解析 → 500,失败文案与迁移前逐字一致", async () => {
    fetchMock.mockResolvedValue(deepseekBody("这不是JSON"));
    const res = await POST(summarizeRequest());
    const body = await res.json();
    expect(res.status).toBe(500);
    expect(body).toEqual({ success: false, error: "AI 返回格式解析失败" });
  });
});
