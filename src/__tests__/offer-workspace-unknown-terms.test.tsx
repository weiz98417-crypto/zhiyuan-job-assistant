// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import OfferComparePage from "@/app/compare/page";

vi.mock("@/lib/agent/sessions", () => ({ createSession: vi.fn() }));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Offer workspace fact and estimate projections", () => {
  it("displays unknown and explicit zero terms distinctly and separates uncertain bonus from cash", async () => {
    const rows = [
      { id: 1, company: "未知条件公司", role: "PM", monthly_salary: 20, months_per_year: 12,
        annual_bonus: 4, bonus_guarantee: "uncertain", has_social_insurance: null,
        housing_fund_rate: null, probation_months: null, latest_report_id: 11 },
      { id: 2, company: "明确零值公司", role: "PM", monthly_salary: 20, months_per_year: 12,
        annual_bonus: 0, has_social_insurance: 0, housing_fund_rate: 0, probation_months: 0 },
    ];
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => new Response(JSON.stringify({
      success: true,
      data: String(input).includes("offer-reports") ? [{ id: 11, offer_id: 1, report_type: "single",
        title: "未知条件公司 Offer", offer_snapshot_json: JSON.stringify({ company: "未知条件公司" }),
        take_home_json: JSON.stringify({ monthlyNetMin: 15, monthlyNetMax: 16, annualNetMin: 180,
          annualNetMax: 190, assumptions: ["假设公积金个人比例 7%；录用材料未确认"] }) }] : rows,
    }), { status: 200 })));
    render(<OfferComparePage />);
    fireEvent.click(await screen.findByRole("button", { name: /未知条件公司/ }));
    expect(screen.getByText("社保：未明确")).toBeTruthy();
    expect(screen.getByText("公积金：未明确")).toBeTruthy();
    expect(screen.getByText("试用期：未明确")).toBeTruthy();
    expect(screen.getByText("确定年现金：240K")).toBeTruthy();
    expect(screen.getByText("非保证奖金：80K")).toBeTruthy();
    expect(screen.getByText("税后估算与计算假设")).toBeTruthy();
    expect(screen.getByText("假设公积金个人比例 7%；录用材料未确认")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /明确零值公司/ }));
    expect(screen.getByText("社保：无")).toBeTruthy();
    expect(screen.getByText("公积金：0%")).toBeTruthy();
    expect(screen.getByText("试用期：0 个月")).toBeTruthy();
    expect(screen.getByText("年终奖：0 个月")).toBeTruthy();
  });
});
