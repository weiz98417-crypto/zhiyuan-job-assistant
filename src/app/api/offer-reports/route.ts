import { NextResponse } from "next/server";
import { existsSync, readFileSync } from "fs";
import { resolve } from "path";
import { getDb } from "@/lib/server-db";
import { evaluateOfferSnapshot } from "@/lib/offer-evaluation";

function ensureSchema() {
  const db = getDb();
  const schemaPath = resolve(process.cwd(), "src", "lib", "server-schema.sql");
  if (existsSync(schemaPath)) {
    try {
      const schema = readFileSync(schemaPath, "utf-8");
      db.exec(schema);
    } catch { /* schema already initialized */ }
  }
  const cols = [
    "ALTER TABLE offer_reports ADD COLUMN report_type TEXT NOT NULL DEFAULT 'comparison'",
    "ALTER TABLE offer_reports ADD COLUMN model_version TEXT NOT NULL DEFAULT ''",
    "ALTER TABLE offer_reports ADD COLUMN offer_id INTEGER REFERENCES offers(id)",
    "ALTER TABLE offer_reports ADD COLUMN overall_score REAL NOT NULL DEFAULT 0",
    "ALTER TABLE offer_reports ADD COLUMN verdict TEXT NOT NULL DEFAULT ''",
    "ALTER TABLE offer_reports ADD COLUMN summary TEXT NOT NULL DEFAULT ''",
    "ALTER TABLE offer_reports ADD COLUMN offer_snapshot_json TEXT NOT NULL DEFAULT '{}'",
    "ALTER TABLE offer_reports ADD COLUMN modules_json TEXT NOT NULL DEFAULT '[]'",
    "ALTER TABLE offer_reports ADD COLUMN red_flags_json TEXT NOT NULL DEFAULT '[]'",
    "ALTER TABLE offer_reports ADD COLUMN missing_info_json TEXT NOT NULL DEFAULT '[]'",
    "ALTER TABLE offer_reports ADD COLUMN negotiation_levers_json TEXT NOT NULL DEFAULT '[]'",
    "ALTER TABLE offer_reports ADD COLUMN hr_questions_json TEXT NOT NULL DEFAULT '[]'",
    "ALTER TABLE offer_reports ADD COLUMN assumptions_json TEXT NOT NULL DEFAULT '[]'",
    "ALTER TABLE offer_reports ADD COLUMN take_home_json TEXT NOT NULL DEFAULT '{}'",
    "ALTER TABLE offer_reports ADD COLUMN offers_json TEXT NOT NULL DEFAULT '[]'",
    "ALTER TABLE offer_reports ADD COLUMN report_markdown TEXT NOT NULL DEFAULT ''",
    "ALTER TABLE offer_reports ADD COLUMN num_offers INTEGER NOT NULL DEFAULT 0",
  ];
  for (const sql of cols) {
    try { db.exec(sql); } catch { /* column already exists */ }
  }
}

function jsonString(value: unknown, fallback: unknown): string {
  if (value === undefined || value === null) return JSON.stringify(fallback);
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

export async function POST(request: Request) {
  try {
    ensureSchema();
    const body = await request.json();
    const {
      title,
      offers_json,
      report_markdown,
      report_type,
      model_version,
      offer_id,
      offer_snapshot,
      overall_score,
      verdict,
      summary,
      modules_json,
      red_flags_json,
      missing_info_json,
      negotiation_levers_json,
      hr_questions_json,
      assumptions_json,
      take_home_json,
    } = body;

    if (!report_markdown || typeof report_markdown !== "string") {
      return NextResponse.json({ success: false, error: "report_markdown is required" }, { status: 400 });
    }

    const offersArr = Array.isArray(offers_json) ? offers_json : JSON.parse(offers_json || "[]");
    const numOffers = offersArr.length;
    const snapshot = offer_snapshot || (offersArr.length === 1 ? offersArr[0] : {});
    const evaluated = snapshot?.company && snapshot?.role ? evaluateOfferSnapshot(snapshot) : null;
    const titleStr = title || (evaluated ? `${evaluated.company} Offer 评估报告` : "Offer report");

    const db = getDb();
    const result = db.prepare(`
      INSERT INTO offer_reports (
        title, report_type, model_version, offer_id, overall_score, verdict, summary,
        offer_snapshot_json, modules_json, red_flags_json, missing_info_json,
        negotiation_levers_json, hr_questions_json, assumptions_json, take_home_json,
        offers_json, report_markdown, num_offers
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(
      titleStr,
      report_type || (numOffers > 1 ? "comparison" : "single"),
      model_version || evaluated?.modelVersion || "",
      offer_id ?? evaluated?.offerId ?? null,
      overall_score ?? evaluated?.overallScore ?? 0,
      verdict ?? evaluated?.verdict ?? "",
      summary ?? evaluated?.summary ?? "",
      JSON.stringify(snapshot || evaluated?.offerSnapshot || {}),
      jsonString(modules_json, evaluated?.modules || []),
      jsonString(red_flags_json, evaluated?.redFlags || []),
      jsonString(missing_info_json, evaluated?.missingInfo || []),
      jsonString(negotiation_levers_json, evaluated?.negotiationLevers || []),
      jsonString(hr_questions_json, evaluated?.hrQuestions || []),
      jsonString(assumptions_json, evaluated?.assumptions || []),
      jsonString(take_home_json, evaluated?.takeHomeEstimate || {}),
      JSON.stringify(offersArr),
      report_markdown,
      numOffers,
    );

    const id = Number(result.lastInsertRowid);
    const reportOfferId = offer_id ?? evaluated?.offerId;
    if (reportOfferId) {
      try {
        db.prepare("UPDATE offers SET latest_report_id = ? WHERE id = ?").run(id, reportOfferId);
      } catch { /* non-fatal */ }
    }

    return NextResponse.json({ success: true, data: { id } }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}

export async function GET() {
  try {
    ensureSchema();
    const rows = getDb().prepare(`
      SELECT id, title, report_type, offer_id, overall_score, verdict, summary,
             offer_snapshot_json, modules_json, red_flags_json, missing_info_json,
             negotiation_levers_json, hr_questions_json, assumptions_json, take_home_json,
             report_markdown, num_offers, created_at
      FROM offer_reports
      ORDER BY created_at DESC
      LIMIT 20
    `).all();
    return NextResponse.json({ success: true, data: rows });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}
