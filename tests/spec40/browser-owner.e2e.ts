import fs from "node:fs";
import { test } from "@e2e-dev/web";
import { credentials, expect } from "e2e";

const fixture = JSON.parse(fs.readFileSync(".private/spec40/browser-fixture.json", "utf8"));

test("ISS-048 real logout and A to B to A preserve owner-scoped settings", async ({ app, screen, browser }) => {
  await app.open("/login");
  await screen.getByPlaceholder("输入用户名").fill(credentials.user("ownerA").username);
  await screen.getByPlaceholder("输入密码").fill(credentials.user("ownerA").password);
  await screen.getByRole("button", "登 录").tap();
  await expect(browser).toHaveURL("/");
  await browser.goto("/settings");
  await screen.getByLabel("姓名").fill("SPEC40_A_PRIVATE_NAME");
  await expect(screen.getByLabel("姓名")).toHaveValue("SPEC40_A_PRIVATE_NAME");
  await screen.getByRole("main").getByRole("button", "退出登录").tap();
  await expect(browser).toHaveURL("/login");
  await screen.getByPlaceholder("输入用户名").fill(credentials.user("ownerB").username);
  await screen.getByPlaceholder("输入密码").fill(credentials.user("ownerB").password);
  await screen.getByRole("button", "登 录").tap();
  await expect(browser).toHaveURL("/");
  await browser.goto("/settings");
  await expect(screen.getByLabel("姓名")).toHaveValue("");
  await screen.getByLabel("姓名").fill("SPEC40_B_PRIVATE_NAME");
  await browser.reload();
  await expect(screen.getByLabel("姓名")).toHaveValue("SPEC40_B_PRIVATE_NAME");
  const ownerReadback = await browser.evaluate(async () => {
    const response = await fetch("/api/users/me");
    return { status: response.status, id: (await response.json()).id };
  });
  expect(ownerReadback).toEqual({ status: 200, id: fixture.users.b.id });
  await screen.getByRole("main").getByRole("button", "退出登录").tap();
  await expect(browser).toHaveURL("/login");
  await screen.getByPlaceholder("输入用户名").fill(credentials.user("ownerA").username);
  await screen.getByPlaceholder("输入密码").fill(credentials.user("ownerA").password);
  await screen.getByRole("button", "登 录").tap();
  await expect(browser).toHaveURL("/");
  await browser.goto("/settings");
  await expect(screen.getByLabel("姓名")).toHaveValue("SPEC40_A_PRIVATE_NAME");
});

test("legacy CV dry-run and recovery preserve the quarantine and canonical server CV", async ({ app, screen, browser }) => {
  await app.open("/login");
  await browser.evaluate((cv) => { localStorage.setItem("zhiyuan-cv", JSON.stringify(cv)); return true; }, fixture.cv);
  await screen.getByPlaceholder("输入用户名").fill(credentials.user("ownerA").username);
  await screen.getByPlaceholder("输入密码").fill(credentials.user("ownerA").password);
  await screen.getByRole("button", "登 录").tap();
  await expect(browser).toHaveURL("/");
  await browser.goto("/settings");
  await screen.getByText("旧缓存隔离与恢复").tap();
  await screen.getByRole("button", "核验归属").tap();
  await expect(screen.getByRole("status")).toContainText("核验没有改动资料");
  const before = await browser.evaluate(async () => {
    const owner = JSON.parse(localStorage.getItem("zhiyuan:active-owner:v1")!).ownerId;
    const server = await (await fetch("/api/cv/data")).json();
    return { cache: localStorage.getItem("zhiyuan:owner:" + encodeURIComponent(owner) + ":zhiyuan-cv"), server: server.data };
  });
  expect(before.cache).toBeNull();
  expect(before.server).toEqual(fixture.cv);
  await screen.getByRole("button", "确认恢复到当前账号").tap();
  await expect(screen.getByRole("status")).toContainText("恢复完成并已读回核验");
  const recovered = await browser.evaluate(() => {
    const owner = JSON.parse(localStorage.getItem("zhiyuan:active-owner:v1")!).ownerId;
    return { value: JSON.parse(localStorage.getItem("zhiyuan:owner:" + encodeURIComponent(owner) + ":zhiyuan-cv")!),
      quarantine: Object.keys(localStorage).filter((key) => key.startsWith("zhiyuan:legacy-unowned:")).length };
  });
  expect(recovered).toEqual({ value: fixture.cv, quarantine: 1 });
  await browser.reload();
  await screen.getByText("旧缓存隔离与恢复").tap();
  await screen.getByRole("button", "撤销本次恢复").tap();
  await expect(screen.getByRole("status")).toContainText("本次恢复已撤销");
  const after = await browser.evaluate(async () => {
    const owner = JSON.parse(localStorage.getItem("zhiyuan:active-owner:v1")!).ownerId;
    return { cache: localStorage.getItem("zhiyuan:owner:" + encodeURIComponent(owner) + ":zhiyuan-cv"),
      server: (await (await fetch("/api/cv/data")).json()).data,
      quarantine: Object.keys(localStorage).filter((key) => key.startsWith("zhiyuan:legacy-unowned:")).length };
  });
  expect(after).toEqual({ cache: null, server: fixture.cv, quarantine: 1 });
});
