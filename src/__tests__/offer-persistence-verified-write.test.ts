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
