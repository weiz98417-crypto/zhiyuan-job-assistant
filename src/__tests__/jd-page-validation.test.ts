import { afterEach, describe, expect, it, vi } from "vitest";
import { isJDVerificationPage } from "@/lib/server/jd-page-validation";
import { POST } from "@/app/api/fetch-jd/route";
import { fetchJDTextFromUrl } from "@/lib/server/durable-jd-evaluation";

afterEach(() => vi.unstubAllGlobals());

describe("JD page validation", () => {
  it("recognizes verification pages from title or challenge instructions", () => {
    expect(isJDVerificationPage("滑动验证页面", "欢迎访问前程无忧")).toBe(true);
    expect(isJDVerificationPage("职位详情", "访问过于频繁，请完成安全验证后继续查看岗位信息。")).toBe(true);
    expect(isJDVerificationPage("Just a moment...", "Checking your browser before accessing jobs.")).toBe(true);
    expect(isJDVerificationPage("职位详情", '为了更好的访问体验，请进行验证appkey: "CF_APP_WAF", var AC_Opt = {}')).toBe(true);
  });

  it("accepts a real JD that describes CAPTCHA-related product work", () => {
    const body = "岗位职责：负责验证码产品的需求分析、用户研究与迭代，设计安全验证流程。任职要求：具备产品经理经验和跨团队沟通能力。";
    expect(isJDVerificationPage("验证码产品经理招聘", body)).toBe(false);
    expect(isJDVerificationPage("安全验证工程师", "岗位职责：需要完成安全验证功能研发，负责验证码产品设计。任职要求：熟悉身份认证协议。")).toBe(false);
  });

  it("rejects a long challenge page in the generic fetch API", async () => {
    const html = `<html><head><title>职位详情</title></head><body>${"访问过于频繁，请完成安全验证后继续查看岗位信息。".repeat(15)}</body></html>`;
    vi.stubGlobal("fetch", vi.fn(async () => new Response(html, {
      status: 200,
      headers: { "content-type": "text/html" },
    })));

    const response = await POST(new Request("http://localhost/api/fetch-jd", {
      method: "POST",
      body: JSON.stringify({ url: "https://jobs.51job.com/example/123" }),
    }));
    const result = await response.json();

    expect(response.status).toBe(422);
    expect(result.success).toBe(false);
    expect(result.error).toContain("人机验证");
  });

  it("rejects a verification page in the durable Agent URL fetch", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(
      "<html><head><title>滑动验证</title></head><body>请拖动滑块完成滑动验证，再查看职位。</body></html>",
      { status: 200 },
    )));

    await expect(fetchJDTextFromUrl("https://jobs.51job.com/example/123")).rejects.toThrow("人机验证");
  });

  it("keeps a real job description available in the generic fetch API", async () => {
    const jdBody = "岗位职责：负责验证码产品的需求分析、用户研究与迭代，设计安全验证流程。任职要求：具备产品经理经验和跨团队沟通能力。".repeat(4);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(
      `<html><head><title>验证码产品经理招聘</title></head><body>${jdBody}</body></html>`,
      { status: 200, headers: { "content-type": "text/html" } },
    )));

    const response = await POST(new Request("http://localhost/api/fetch-jd", {
      method: "POST",
      body: JSON.stringify({ url: "https://example.com/jobs/captcha-product" }),
    }));
    const result = await response.json();

    expect(response.status).toBe(200);
    expect(result.success).toBe(true);
    expect(result.data.text).toContain("任职要求");
  });
});
