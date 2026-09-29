import { renderToStaticMarkup } from "react-dom/server";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import ChangelogPage from "@/app/changelog/page";
import { releaseNotes } from "@/app/changelog/release-notes";
import appPackage from "../../package.json";

async function renderChangelog(version?: string) {
  return renderToStaticMarkup(await ChangelogPage({
    searchParams: Promise.resolve(version ? { version } : {}),
  }));
}

describe("changelog history", () => {
  it("selects historical release details through a persistent version URL", async () => {
    const current = await renderChangelog();
    expect(current).toContain(`id="selected-version"`);
    expect(current).toContain(`V${appPackage.version}`);

    const previous = await renderChangelog("0.12.0");
    expect(previous).toContain('href="/changelog?version=0.12.0"');
    expect(new JSDOM(previous).window.document.querySelector('a[aria-current="page"]')?.getAttribute("href"))
      .toBe("/changelog?version=0.12.0");
    expect(previous).toContain("双面板工作台与 Agent 任务轨道");
    expect(previous).toContain("0.12.0 后续修复");
    expect(previous).not.toContain("统一 AI 模型与图片识别");
    expect(previous).toContain("历史生产版本");
    expect(previous).not.toContain("当前线上版本");

    const older = await renderChangelog("0.10.7");
    expect(older).toContain("JD 不匹配简历的明确要求");
    expect(older).not.toContain("0.12.0 后续修复");

    expect(await renderChangelog("0.12.0")).toBe(previous);
  });

  it("links every recorded version and labels unreleased development stages", async () => {
    const html = await renderChangelog();
    for (const release of releaseNotes) {
      expect(html).toContain(`href="/changelog?version=${release.version}"`);
    }

    const development = await renderChangelog("0.10.8");
    expect(development).toContain("开发整合阶段");
    expect(development).toContain("未作为独立生产版本发布");
    expect(await renderChangelog("0.10.6")).toContain("逐项更新记录尚未找到可靠来源");
  });

  it("falls back to the current version for an unknown URL", async () => {
    const html = await renderChangelog("999.0.0");
    expect(html).toContain("未找到该版本的更新记录，已显示当前版本。");
    expect(html).toContain(`<h2 id="selected-version" class="text-2xl font-semibold text-[var(--color-text)]">V${appPackage.version}</h2>`);
  });
});
