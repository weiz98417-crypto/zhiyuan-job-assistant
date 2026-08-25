import { beforeEach, describe, expect, it, vi } from "vitest";

const boundaries = vi.hoisted(() => ({
  searchWeb: vi.fn(),
  getWeatherForecast: vi.fn(),
  searchPlaceInformation: vi.fn(),
  getTravelDirections: vi.fn(),
  searchJobLeads: vi.fn(),
}));

vi.mock("@/lib/server/external-agent-service", () => ({
  searchWeb: boundaries.searchWeb,
  getWeatherForecast: boundaries.getWeatherForecast,
  searchPlaceInformation: boundaries.searchPlaceInformation,
  getTravelDirections: boundaries.getTravelDirections,
  searchJobLeads: boundaries.searchJobLeads,
}));

import { webSearch } from "@/lib/agent/tools/mcp/web-search";
import { getDirections, getWeather, searchPlace } from "@/lib/agent/tools/mcp/baidu-map";
import { searchJobs } from "@/lib/agent/tools/mcp/job-search";

describe("server Agent external tools", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("relative HTTP must not be used"));
  });

  it("runs web search in-process and forwards cancellation", async () => {
    const controller = new AbortController();
    boundaries.searchWeb.mockResolvedValue({
      text: "甲公司成立于 2020 年",
      sources: ["AI知识库"],
    });

    const result = await webSearch.handler(
      { query: "甲公司" },
      {
        principal: { userId: "user-1" },
        runId: "run-1",
        allowlist: ["web_search"],
        signal: controller.signal,
      },
    );

    expect(result).toMatchObject({
      success: true,
      data: "甲公司成立于 2020 年",
      errorCategory: "ok",
    });
    expect(boundaries.searchWeb).toHaveBeenCalledWith("甲公司", controller.signal);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("runs weather lookup in-process and forwards cancellation", async () => {
    const controller = new AbortController();
    boundaries.getWeatherForecast.mockResolvedValue("北京当前晴，25°C");

    const result = await getWeather.handler(
      { city: "北京" },
      {
        principal: { userId: "user-1" },
        runId: "run-1",
        allowlist: ["get_weather"],
        signal: controller.signal,
      },
    );

    expect(result).toMatchObject({ success: true, data: "北京当前晴，25°C", errorCategory: "ok" });
    expect(boundaries.getWeatherForecast).toHaveBeenCalledWith("北京", controller.signal);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("runs place search in-process and forwards cancellation", async () => {
    const controller = new AbortController();
    boundaries.searchPlaceInformation.mockResolvedValue("甲公司位于北京市海淀区");

    const result = await searchPlace.handler(
      { keyword: "甲公司", city: "北京" },
      {
        principal: { userId: "user-1" },
        runId: "run-1",
        allowlist: ["search_place"],
        signal: controller.signal,
      },
    );

    expect(result).toMatchObject({ success: true, data: "甲公司位于北京市海淀区", errorCategory: "ok" });
    expect(boundaries.searchPlaceInformation).toHaveBeenCalledWith("甲公司", "北京", controller.signal);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("runs directions lookup in-process and forwards cancellation", async () => {
    const controller = new AbortController();
    boundaries.getTravelDirections.mockResolvedValue("乘地铁 10 号线约 35 分钟");

    const result = await getDirections.handler(
      { origin: "中关村", destination: "国贸", mode: "transit" },
      {
        principal: { userId: "user-1" },
        runId: "run-1",
        allowlist: ["get_directions"],
        signal: controller.signal,
      },
    );

    expect(result).toMatchObject({ success: true, data: "乘地铁 10 号线约 35 分钟", errorCategory: "ok" });
    expect(boundaries.getTravelDirections).toHaveBeenCalledWith("中关村", "国贸", "transit", controller.signal);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("runs job discovery in-process and forwards cancellation", async () => {
    const controller = new AbortController();
    boundaries.searchJobLeads.mockResolvedValue("- 北京 AI 产品经理招聘线索");

    const result = await searchJobs.handler(
      { keyword: "AI 产品经理", city: "北京" },
      {
        principal: { userId: "user-1" },
        runId: "run-1",
        allowlist: ["search_jobs"],
        signal: controller.signal,
      },
    );

    expect(result).toMatchObject({ success: true, data: "- 北京 AI 产品经理招聘线索", errorCategory: "ok" });
    expect(boundaries.searchJobLeads).toHaveBeenCalledWith("AI 产品经理", "北京", controller.signal);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});
