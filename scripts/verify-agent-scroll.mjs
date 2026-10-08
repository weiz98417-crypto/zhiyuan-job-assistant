import assert from "node:assert/strict";
import { chromium } from "playwright";
import { SignJWT } from "jose";
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });
const baseUrl = process.argv[2] || "http://127.0.0.1:3107";
assert.match(baseUrl, /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/);
const token = await new SignJWT({ userId: "scroll-fixture", role: "member" })
  .setProtectedHeader({ alg: "HS256" }).setExpirationTime("10m")
  .sign(new TextEncoder().encode(process.env.JWT_SECRET || "dev-secret-change-in-production-min-32-chars!!"));
const timestamp = "2026-10-07T12:00:00.000Z";
const question = "请介绍一个你主导的 AI 产品，如何验证业务价值？";
const messages = Array.from({ length: 24 }, (_, index) => ({ role: index % 2 ? "assistant" : "user", content: `${index + 1}. ${question}\n${"项目背景、具体行动、验证结果。".repeat(25)}`, timestamp }));
const interviewState = { status: "active", planSnapshot: { snapshotId: "scroll-plan", createdAt: timestamp, source: {}, mode: "realistic", difficulty: "normal", focusAreas: [], allowFollowUps: true, resumeSnapshot: { body: "负责 AI 产品" } }, currentQuestionId: "question-1", questionGraph: [{ id: "question-1", question, kind: "main", answerTurnIds: [] }], transcript: [], scoreArtifacts: [], rebindHistory: [] };
const sessions = Array.from({ length: 50 }, (_, index) => ({ id: index + 1, title: `模拟面试 ${index + 1}`, messages_json: JSON.stringify(messages), interview_state_json: JSON.stringify(interviewState), created_at: timestamp, updated_at: timestamp }));
const browser = await chromium.launch({ channel: "msedge" });
let failed = false;
try {
  for (const viewport of [{ width: 1920, height: 1080 }, { width: 1280, height: 720 }, { width: 1280, height: 600 }, { width: 390, height: 844 }]) {
    const context = await browser.newContext({ viewport });
    await context.addCookies([{ name: "auth_token", value: token, url: baseUrl }]);
    await context.route("**/api/**", async (route) => {
      const pathname = new URL(route.request().url()).pathname;
      let body = { success: true, data: [] };
      if (pathname === "/api/users/me") body = { id: "scroll-fixture", role: "member", displayName: "布局验收" };
      if (pathname === "/api/sessions") body.data = sessions;
      if (/^\/api\/sessions\/\d+$/.test(pathname)) body.data = sessions[0];
      if (pathname === "/api/interview/voice/config") body.data = { configured: false };
      await route.fulfill({ contentType: "application/json", body: JSON.stringify(body) });
    });
    const page = await context.newPage();
    await page.goto(`${baseUrl}/agent?sessionId=1`, { waitUntil: "networkidle" });
    const composer = page.getByPlaceholder("继续对话…");
    await composer.waitFor({ state: "visible" });
    await page.waitForTimeout(600);
    const geometry = await page.evaluate(() => {
      const input = document.querySelector('textarea[placeholder="继续对话…"]');
      const rect = input.getBoundingClientRect();
      let viewport = document.querySelector('[data-role="assistant"]');
      while (viewport && getComputedStyle(viewport).overflowY !== "auto") viewport = viewport.parentElement;
      return { height: window.innerHeight, documentHeight: document.documentElement.scrollHeight, composerTop: rect.top, composerBottom: rect.bottom, messageHeight: viewport?.clientHeight, messageScrollHeight: viewport?.scrollHeight };
    });
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    const after = await composer.boundingBox();
    const result = { viewport, ...geometry, scrollOffset: await page.evaluate(() => window.scrollY), composerMoved: Math.abs(after.y - geometry.composerTop) };
    console.log(JSON.stringify(result));
    try {
      assert.ok(geometry.documentHeight <= viewport.height + 1, "workspace creates an outer page scrollbar");
      assert.ok(geometry.composerBottom <= viewport.height, "composer falls below viewport");
      assert.ok(result.composerMoved <= 1, "outer scrolling moves composer");
      assert.ok(geometry.messageScrollHeight > geometry.messageHeight, "long conversation must scroll inside message viewport");
      const scrolls = await page.evaluate(() => {
        let messagesViewport = document.querySelector('[data-role="assistant"]');
        while (messagesViewport && getComputedStyle(messagesViewport).overflowY !== "auto") messagesViewport = messagesViewport.parentElement;
        messagesViewport.scrollTop = messagesViewport.scrollHeight;
        const messageOffset = messagesViewport.scrollTop;
        const rail = document.querySelector('[data-testid="workbench-journey-rail"]');
        const historyViewport = rail && Array.from(rail.querySelectorAll("div")).find((element) => getComputedStyle(element).overflowY === "auto" && element.scrollHeight > element.clientHeight);
        if (historyViewport) historyViewport.scrollTop = historyViewport.scrollHeight;
        return { messageOffset, historyOffset: historyViewport?.scrollTop, inputTop: document.querySelector("textarea").getBoundingClientRect().top, pageOffset: window.scrollY };
      });
      assert.ok(scrolls.messageOffset > 0, "message viewport must actually scroll");
      if (viewport.width >= 1024) assert.ok(scrolls.historyOffset > 0, "long history rail must scroll independently");
      assert.equal(scrolls.pageOffset, 0);
      assert.ok(Math.abs(scrolls.inputTop - geometry.composerTop) <= 1, "internal scrolling moves composer");
    } catch (error) {
      failed = true;
      console.error(error.message);
    }
    await page.screenshot({ path: `.private/agent-scroll-${viewport.width}-${viewport.height}.png`, fullPage: false });
    await context.close();
  }
} finally {
  await browser.close();
}
if (failed) process.exitCode = 1;
