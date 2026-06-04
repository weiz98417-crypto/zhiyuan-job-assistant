import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

function source(file: string): string {
  return readFileSync(path.join(process.cwd(), file), "utf-8");
}

describe("Discovery UI", () => {
  it("shows lightweight scan job state badges on discovery cards", () => {
    const page = source("src/app/discover/page.tsx");

    expect(page).toContain("DISCOVERY_VISIBLE_STATUSES");
    expect(page).toContain("DISCOVERY_JOB_STATUS_BADGES");
    expect(page).toContain("jobStatusBadge(job.status)");
    expect(page).toContain("新发现");
    expect(page).toContain("已查看");
    expect(page).toContain("已保存");
    expect(page).toContain("已评估");
    expect(page).toContain("已跳过");
    expect(page).toContain("status=${status}");
  });

  it("defaults discovery scanning toward Chinese AI/product roles and domestic companies", () => {
    const page = source("src/app/discover/page.tsx");
    const portals = source("portals.yml");

    expect(page).toContain("DEFAULT_DISCOVERY_TITLE_KEYWORDS");
    expect(page).toContain("AI产品经理,大模型产品经理,Agent产品经理,数据产品经理,AI运营");
    expect(page).toContain("useState(\"\")");
    expect(page).toContain("useState(100)");
    expect(portals).toContain("字节跳动");
    expect(portals).toContain("腾讯");
    expect(portals).toContain("阿里巴巴");
    expect(portals).toContain("华为");
    expect(portals).toContain("title_filter:");
    expect(portals).not.toContain("OpenAI");
    expect(portals).not.toContain("Anthropic");
  });
});
