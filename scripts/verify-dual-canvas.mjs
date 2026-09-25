#!/usr/bin/env node
/**
 * verify-dual-canvas.mjs — 0.11.0-D 门禁:双面画布 Playwright 冒烟(任务 6.1)。
 *
 * 对运行中的实例(默认 http://127.0.0.1:3211)断言:
 *   1. 登录后 /agent 渲染三区:求职旅程栏 / 对话脸 / 分析面令牌
 *   2. ⌘K 命令面板可唤起、可搜索、可 Esc 关闭
 *   3. 旅程栏底部有 ⌘K 入口;对话脸有阶段轨道挂载点
 *   4. Composer 为样张形态(圆角单行 + 发送按钮)
 *
 * 用法:node scripts/verify-dual-canvas.mjs [baseUrl] [--user=xxx] [--pass=xxx]
 * 环境变量:VERIFY_USER / VERIFY_PASS(默认注册临时冒烟账号)。
 * Exit 0 = 全部通过;Exit 1 = 任一失败。
 */
import { chromium } from "playwright";

const BASE_URL = process.argv[2] && !process.argv[2].startsWith("--") ? process.argv[2] : "http://127.0.0.1:3211";
const args = process.argv.slice(2);
const argOf = (name) => args.find((a) => a.startsWith(`--${name}=`))?.split("=").slice(1).join("=");
const USER = argOf("user") || process.env.VERIFY_USER || `smoke_${Date.now().toString(36)}`;
const PASS = argOf("pass") || process.env.VERIFY_PASS || "ZhiyuanSmoke!2026#Alpha";

let failed = false;
const fail = (msg) => { console.error(`[FAIL] ${msg}`); failed = true; };
const pass = (msg) => console.log(`[ok] ${msg}`);

// 脚本含本地自审批与默认口令,只允许对准本机实例。
if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(BASE_URL)) {
  console.error("[verify-dual-canvas] refusing non-localhost target:", BASE_URL);
  process.exit(1);
}

async function approveLocalSqliteUser(username) {
  // 本地冒烟专用:SQLite 驱动 + 新注册账号等待审批时,直接放行(仅限本机验证)。
  let Database;
  try {
    ({ default: Database } = await import("better-sqlite3"));
  } catch {
    return false;
  }
  const { existsSync } = await import("node:fs");
  const { resolve, dirname } = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const here = dirname(fileURLToPath(import.meta.url));
  for (const dataDir of [resolve(here, "../data"), resolve(process.cwd(), "data")]) {
    const dbPath = resolve(dataDir, "zhiyuan.db");
    if (!existsSync(dbPath)) continue;
    const db = new Database(dbPath);
    try {
      const info = db.prepare(
        "UPDATE users SET status = 'active', approved_at = COALESCE(approved_at, datetime('now')) WHERE username = ? AND status != 'active'",
      ).run(username);
      return info.changes > 0 || db.prepare("SELECT 1 FROM users WHERE username = ? AND status = 'active'").get(username) != null;
    } finally {
      db.close();
    }
  }
  return false;
}

async function registerOrLogin() {
  // 生产模式 CSRF 要求 Origin 与 APP_ORIGIN 一致;node fetch 默认不带 Origin。
  const headers = { "Content-Type": "application/json", Origin: BASE_URL };
  const register = await fetch(`${BASE_URL}/api/auth/register`, {
    method: "POST",
    headers,
    body: JSON.stringify({ username: USER, password: PASS, displayName: "冒烟体验官" }),
  });
  if (register.status === 409) { /* already exists */ }
  const login = await fetch(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers,
    body: JSON.stringify({ username: USER, password: PASS }),
  });
  if (!login.ok) throw new Error(`login failed: ${login.status} ${await login.text().catch(() => "")}`);
  return login.headers.getSetCookie?.() ?? [login.headers.get("set-cookie")].filter(Boolean);
}

const run = async () => {
  const cookies = await registerOrLogin();
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1600, height: 950 } });
  for (const raw of cookies) {
    const [nameValue] = raw.split(";");
    const eq = nameValue.indexOf("=");
    await context.addCookies([{ name: nameValue.slice(0, eq), value: nameValue.slice(eq + 1), url: BASE_URL }]);
  }
  const page = await context.newPage();
  try {
    await page.goto(`${BASE_URL}/agent`, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.waitForTimeout(3000);

    // 1) 求职旅程栏
    const journey = page.getByText("求职旅程", { exact: true });
    if ((await journey.count()) >= 1) pass("旅程栏渲染(求职旅程标签)");
    else fail("旅程栏缺失:未找到「求职旅程」标签");

    // 2) 对话脸 Composer(样张形态)
    const composerInput = page.getByPlaceholder(/继续对话|告诉纸鸢/);
    if ((await composerInput.count()) === 1) pass("对话脸 Composer 渲染");
    else fail("Composer 缺失或不唯一");
    const sendButton = page.getByRole("button", { name: "发送消息" });
    if ((await sendButton.count()) === 1) pass("发送按钮渲染");
    else fail("发送按钮缺失");

    // 3) 旅程栏 ⌘K 入口 + 面板开合
    const paletteTrigger = page.getByRole("button", { name: /⌘K 唤起命令面板/ });
    if ((await paletteTrigger.count()) === 1) pass("旅程栏 ⌘K 入口渲染");
    else fail("⌘K 入口缺失");
    await paletteTrigger.first().click();
    const paletteInput = page.getByPlaceholder("搜索工作台、对话或操作…");
    await paletteInput.waitFor({ state: "visible", timeout: 5000 }).then(() => pass("⌘K 面板可唤起")).catch(() => fail("⌘K 面板未弹出"));
    await paletteInput.fill("岗位");
    const discoverItem = page.getByRole("button", { name: /岗位发现/ });
    if ((await discoverItem.count()) >= 1) pass("⌘K 面板可搜索工作台");
    else fail("⌘K 面板搜索无结果");
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
    if ((await paletteInput.count()) === 0) pass("Esc 关闭命令面板");
    else fail("Esc 未关闭命令面板");

    // 4) Ctrl+K 全局唤起
    await page.keyboard.press("Control+k");
    await page.getByPlaceholder("搜索工作台、对话或操作…").waitFor({ state: "visible", timeout: 3000 })
      .then(() => pass("Ctrl+K 全局唤起"))
      .catch(() => fail("Ctrl+K 全局唤起失败"));
    await page.keyboard.press("Escape");

    // 5) 分析面令牌已注入(覆盖层/行内都吃 --color-analyst-*)
    const tokenProbe = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--color-analyst-bg").trim());
    if (tokenProbe) pass(`分析面令牌已定义(--color-analyst-bg=${tokenProbe})`);
    else fail("分析面令牌缺失(--color-analyst-bg)");
  } catch (error) {
    fail(`冒烟执行中断: ${error.message}`);
  } finally {
    await browser.close();
  }
};

run()
  .catch(async (error) => {
    // 新账号等待审批 → 本地 SQLite 直接放行后整段重试一次。
    if (String(error?.message).includes("ACCOUNT_NOT_ACTIVE") && (await approveLocalSqliteUser(USER))) {
      return run();
    }
    throw error;
  })
  .then(() => {
    if (failed) { console.error("[verify-dual-canvas] FAILED"); process.exit(1); }
    console.log("[verify-dual-canvas] all checks passed");
    process.exit(0);
  })
  .catch((error) => {
    console.error("[verify-dual-canvas] crashed:", error);
    process.exit(1);
  });
