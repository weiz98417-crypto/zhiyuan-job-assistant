import { afterEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

type ServerDbModule = typeof import("@/lib/server-db");

const TEST_USER_ID = "user-offer-verified-write";

let dataDir: string | null = null;
let serverDb: ServerDbModule | null = null;

async function loadRouteHarness() {
  vi.resetModules();
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "zhiyuan-offer-verified-write-"));
  process.env.DATA_DIR = dataDir;
  process.env.DB_DRIVER = "sqlite";
  delete process.env.ALLOW_SQLITE_LEGACY;

  vi.doMock("@/lib/auth", () => ({
    getCurrentUser: async () => ({
      userId: TEST_USER_ID,
      username: "offer-verified-user",
      role: "member",
      tokenVersion: 0,
    }),
  }));

  serverDb = await import("@/lib/server-db");
  const offersRoute = await import("@/app/api/offers/route");
  const offerReportsRoute = await import("@/app/api/offer-reports/route");
  const db = serverDb.getDb();
  db.prepare(
    "INSERT INTO users (id, username, password_hash, display_name, role, status, token_version) VALUES (?, ?, ?, ?, ?, ?, 0)",
  ).run(TEST_USER_ID, "offer-verified-user", "hash", "Offer Verified User", "member", "active");
  return { db, offersRoute, offerReportsRoute };
}

afterEach(() => {
  vi.doUnmock("@/lib/auth");
  if (serverDb) {
    serverDb.getDb().close();
    serverDb = null;
  }
  vi.resetModules();
  if (dataDir) {
    fs.rmSync(dataDir, { recursive: true, force: true });
    dataDir = null;
  }
  delete process.env.DATA_DIR;
  delete process.env.DB_DRIVER;
  delete process.env.ALLOW_SQLITE_LEGACY;
});

describe("offer persistence verified writes", () => {
  it("preserves unknown terms separately from explicit zero and false through POST and GET", async () => {
    const { offersRoute } = await loadRouteHarness();
    const create = async (body: Record<string, unknown>) => {
      const response = await offersRoute.POST(new Request("http://localhost/api/offers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }));
      expect(response.status).toBe(201);
      expect((await response.json()).data.readBackVerified).toBe(true);
    };
    await create({ company: "Unknown Terms", role: "PM", monthly_salary: 20 });
    await create({ company: "Explicit Zero", role: "PM", monthly_salary: 20,
      has_social_insurance: false, housing_fund_rate: 0, probation_months: 0, annual_bonus: 0 });
    const json = await (await offersRoute.GET()).json();
    expect(json.data.find((row: Record<string, unknown>) => row.company === "Unknown Terms")).toMatchObject({
      has_social_insurance: null, housing_fund_rate: null, probation_months: null, annual_bonus: null,
    });
    expect(json.data.find((row: Record<string, unknown>) => row.company === "Explicit Zero")).toMatchObject({
      has_social_insurance: 0, housing_fund_rate: 0, probation_months: 0, annual_bonus: 0,
    });
  });

  it("persists parsed server-agent terms and binds the report to the same unknown or explicit facts", async () => {
    const { offersRoute, offerReportsRoute } = await loadRouteHarness();
    const { evaluateOfferForAgent } = await import("@/lib/server/offer-agent-service");
    const { getDataRepositories } = await import("@/lib/data-repositories");
    const adapters = {
      repositories: getDataRepositories(),
      inspectImages: async () => ({ offerText: "", structured: {}, errors: [] }),
      getMemoryContext: async () => ({ structuredFacts: [], semanticSnippets: [], warnings: [] }),
    };
    const unknown = await evaluateOfferForAgent({ userId: TEST_USER_ID }, {
      offerText: "公司：服务端未知\n岗位：产品经理\n月薪20K，12薪，年终奖4个月不保证",
    }, { adapters });
    const zero = await evaluateOfferForAgent({ userId: TEST_USER_ID }, {
      company: "服务端零值", role: "产品经理", monthlySalary: 20, annualBonus: 0,
      hasSocialInsurance: false, housingFundRate: 0, probationMonths: 0,
    }, { adapters });
    expect(unknown.offerSnapshot).toMatchObject({ hasSocialInsurance: null, housingFundRate: null,
      probationMonths: null, annualBonus: 4, bonusGuarantee: "uncertain" });
    expect(zero.offerSnapshot).toMatchObject({ hasSocialInsurance: false, housingFundRate: 0, probationMonths: 0, annualBonus: 0 });
    const offers = (await (await offersRoute.GET()).json()).data;
    expect(offers.find((row: Record<string, unknown>) => row.id === unknown.offerId)).toMatchObject({
      has_social_insurance: null, housing_fund_rate: null, probation_months: null,
      annual_bonus: 4, bonus_guarantee: "uncertain", latest_report_id: unknown.id,
    });
    const reports = (await (await offerReportsRoute.GET()).json()).data;
    const savedReport = reports.find((row: Record<string, unknown>) => row.id === unknown.id);
    expect(JSON.parse(savedReport.offer_snapshot_json)).toMatchObject({
      company: "服务端未知", monthlySalary: 20, monthsPerYear: 12, hasSocialInsurance: null,
      housingFundRate: null, probationMonths: null, annualBonus: 4, bonusGuarantee: "uncertain",
    });
    expect(JSON.parse(savedReport.modules_json).find((module: { id: string }) => module.id === "cash").evidence).toContain("确定年现金 240K");
  });

  it("retains known terms and benefits when only editable cash fields change", async () => {
    const { offersRoute } = await loadRouteHarness();
    const detailRoute = await import("@/app/api/offers/[id]/route");
    const created = await (await offersRoute.POST(new Request("http://localhost/api/offers", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ company: "保留条件", role: "PM", monthly_salary: 20,
        has_social_insurance: false, housing_fund_rate: 0, probation_months: 0,
        bonus_guarantee: "guaranteed", benefits: { meal: true } }),
    }))).json();
    const context = { params: Promise.resolve({ id: String(created.data.id) }) };
    const updated = await detailRoute.PUT(new Request("http://localhost/api/offers/1", {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ company: "保留条件", role: "PM", monthly_salary: 25 }),
    }), context);
    expect(updated.status).toBe(200);
    expect((await updated.json()).data.readBackVerified).toBe(true);
    const reread = await (await detailRoute.GET(new Request("http://localhost/api/offers/1"), context)).json();
    expect(reread.data).toMatchObject({ monthly_salary: 25, has_social_insurance: 0,
      housing_fund_rate: 0, probation_months: 0, bonus_guarantee: "guaranteed" });
    expect(JSON.parse(reread.data.benefits_json)).toEqual({ meal: true });
    const { evaluateOfferForAgent } = await import("@/lib/server/offer-agent-service");
    const { getDataRepositories } = await import("@/lib/data-repositories");
    const report = await evaluateOfferForAgent({ userId: TEST_USER_ID }, { offerId: created.data.id }, {
      adapters: {
        repositories: getDataRepositories(),
        inspectImages: async () => ({ offerText: "", structured: {}, errors: [] }),
        getMemoryContext: async () => ({ structuredFacts: [], semanticSnippets: [], warnings: [] }),
      },
    });
    expect(report.offerSnapshot).toMatchObject({ hasSocialInsurance: false, housingFundRate: 0, probationMonths: 0 });
    const afterEvaluation = await (await detailRoute.GET(new Request("http://localhost/api/offers/1"), context)).json();
    expect(JSON.parse(afterEvaluation.data.benefits_json)).toEqual({ meal: true });
  });

  it("verifies an offer by reading it back before returning success", async () => {
    const { db, offersRoute } = await loadRouteHarness();
    const offerBody = {
      company: "Acme AI",
      role: "AI Product Manager",
      monthly_salary: 32000,
      months_per_year: 14,
      annual_bonus: 2,
      has_social_insurance: true,
      housing_fund_rate: 12,
      options: "RSU refresh eligible",
      probation_months: 3,
      start_date: "2026-07-01",
      other_benefits: "meal allowance",
      location: "Shanghai",
      level: "P6",
      employment_form: "direct_hire",
      employer_name: "Acme AI",
      contract_months: 36,
      overtime_policy: "occasional",
      bonus_guarantee: "partial",
      equity_type: "RSU",
      equity_vesting: "4 years",
      commute_minutes: 35,
      city_cost_level: "high",
      job_nature: "core platform product",
      benefits: { meal: true },
    };

    const response = await offersRoute.POST(new Request("http://localhost/api/offers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(offerBody),
    }));
    const json = await response.json();

    expect(response.status).toBe(201);
    expect(json.success).toBe(true);
    expect(json.data.readBackVerified).toBe(true);
    expect(json.data.id).toBeGreaterThan(0);

    const row = db.prepare("SELECT * FROM offers WHERE id = ?").get(json.data.id) as Record<string, unknown> | undefined;
    expect(row).toMatchObject({
      user_id: TEST_USER_ID,
      company: "Acme AI",
      role: "AI Product Manager",
      monthly_salary: 32,
      months_per_year: 14,
      employment_form: "direct_hire",
    });
    expect(String(row?.benefits_json || "")).toContain("meal");
  });

  it("verifies an offer report and its linked offer latest_report_id before returning success", async () => {
    const { db, offersRoute, offerReportsRoute } = await loadRouteHarness();
    const offerResponse = await offersRoute.POST(new Request("http://localhost/api/offers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        company: "Beta AI",
        role: "AI Solutions PM",
        monthly_salary: 28,
        months_per_year: 15,
        has_social_insurance: true,
      }),
    }));
    const offerJson = await offerResponse.json();
    const offerId = Number(offerJson.data.id);
    const offerSnapshot = {
      offerId,
      company: "Beta AI",
      role: "AI Solutions PM",
      monthlySalary: 28,
      monthsPerYear: 15,
      hasSocialInsurance: true,
      housingFundRate: 7,
      probationMonths: 3,
    };

    const response = await offerReportsRoute.POST(new Request("http://localhost/api/offer-reports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "Beta AI Offer Report",
        report_type: "single",
        model_version: "test-offer-v1",
        offer_id: offerId,
        offer_snapshot: offerSnapshot,
        overall_score: 4.1,
        verdict: "accept_after_negotiation",
        summary: "Strong cash package with bonus uncertainty.",
        modules_json: [{ id: "cash", score: 4 }],
        red_flags_json: ["bonus not guaranteed"],
        missing_info_json: ["social insurance base"],
        negotiation_levers_json: ["confirm bonus guarantee"],
        hr_questions_json: ["Is bonus guaranteed in contract?"],
        assumptions_json: ["base salary is pre-tax"],
        take_home_json: { monthlyNetMin: 22, monthlyNetMax: 24 },
        offers_json: [offerSnapshot],
        report_markdown: "# Beta AI Offer Report\n\nStrong package.",
      }),
    }));
    const json = await response.json();

    expect(response.status).toBe(201);
    expect(json.success).toBe(true);
    expect(json.data.readBackVerified).toBe(true);
    expect(json.data.linkedOfferReadBackVerified).toBe(true);

    const report = db.prepare("SELECT * FROM offer_reports WHERE id = ?").get(json.data.id) as Record<string, unknown> | undefined;
    expect(report).toMatchObject({
      user_id: TEST_USER_ID,
      title: "Beta AI Offer Report",
      report_type: "single",
      model_version: "test-offer-v1",
      offer_id: offerId,
      overall_score: 4.1,
      verdict: "accept_after_negotiation",
    });
    expect(String(report?.offer_snapshot_json || "")).toContain("Beta AI");

    const offer = db.prepare("SELECT latest_report_id FROM offers WHERE id = ?").get(offerId) as { latest_report_id?: number } | undefined;
    expect(Number(offer?.latest_report_id)).toBe(Number(json.data.id));
  });
});
