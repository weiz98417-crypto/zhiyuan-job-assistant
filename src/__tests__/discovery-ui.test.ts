import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

function source(file: string): string {
  return readFileSync(path.join(process.cwd(), file), "utf-8");
}

describe("Discovery UI", () => {
  it("uses job discovery workbench product language", () => {
    const page = source("src/app/discover/page.tsx");
    const shell = source("src/components/shell/AppShell.tsx");
    const toolDisplay = source("src/lib/agent/tool-display-names.ts");
    const toolGovernance = source("src/lib/agent/tool-governance.ts");

    expect(page).toContain("岗位发现工作台");
    expect(page).toContain("开始岗位发现");
    expect(shell).toContain("岗位发现工作台");
    expect(toolDisplay).toContain("开始岗位发现");
    expect(toolGovernance).toContain("开始岗位发现");
    expect(page).not.toContain(">职位发现<");
    expect(page).not.toContain(">开始扫描<");
  });

  it("shows lightweight scan job state badges on discovery cards", () => {
    const page = source("src/app/discover/page.tsx");
    const helper = source("src/lib/job-discovery.ts");

    expect(page).toContain("DISCOVERY_VISIBLE_STATUSES");
    expect(helper).toContain("DISCOVERY_JOB_STATUS_BADGES");
    expect(page).toContain("jobStatusBadge(job.status)");
    expect(helper).toContain("新发现");
    expect(helper).toContain("已查看");
    expect(helper).toContain("已保存");
    expect(helper).toContain("已评估");
    expect(helper).toContain("已跳过");
    expect(page).toContain("status=${status}");
  });

  it("keeps dismissed jobs out of the default list but available through a filter", () => {
    const page = source("src/app/discover/page.tsx");
    const helper = source("src/lib/job-discovery.ts");

    expect(helper).toContain('["new", "viewed", "saved", "evaluating", "evaluated"]');
    expect(page).toContain("showDismissed ? [\"dismissed\"] : DISCOVERY_VISIBLE_STATUSES");
    expect(page).toContain("setShowDismissed(true)");
    expect(page).toContain("已跳过");
    expect(page).toContain("undoDismiss(job.id)");
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

  it("only shows JD management affordance after a discovery job is saved", () => {
    const page = source("src/app/discover/page.tsx");

    expect(page).toContain("const goToJDManagement");
    expect(page).toContain('router.push("/evaluate/jds")');
    expect(page).toContain("{job.jd_id ? (");
    expect(page).toContain("{evalJob.jd_id ? (");
    expect(page).toContain("setEvalJob((prev) => prev && prev.id === jobId");
    expect(page).toContain("setJobs((prev) => prev.map((job) => job.id === jobId");
    expect(page).toContain("去 JD 管理");
  });
});
