import { describe, expect, it } from "vitest";
import { applyDomesticLocationGuard } from "../../lib/scan/orchestrator.mjs";

describe("scan domestic location guard", () => {
  it("keeps domestic and unknown-location jobs while rejecting explicit overseas or remote jobs", () => {
    const jobs = [
      { title: "AI产品经理", company: "国内科技", location: "北京" },
      { title: "数据产品经理", company: "上海样例", location: "Shanghai" },
      { title: "Agent产品经理", company: "未知地点公司", location: "" },
      { title: "AI Product Manager", company: "US Lab", location: "United States Remote" },
      { title: "大模型产品经理", company: "海外业务", location: "新加坡" },
      { title: "AI运营 Remote", company: "远程团队", location: "Remote" },
    ];

    const kept = applyDomesticLocationGuard(jobs as never);

    expect(kept.map((job) => job.company)).toEqual(["国内科技", "上海样例", "未知地点公司"]);
  });

  it("allows domestic text even when a company describes China-wide remote collaboration", () => {
    const kept = applyDomesticLocationGuard([
      { title: "AI产品经理", company: "中国团队", location: "中国大陆远程协作" },
    ] as never);

    expect(kept).toHaveLength(1);
  });
});
