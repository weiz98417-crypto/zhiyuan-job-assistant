import { NextResponse } from "next/server";
import { existsSync, readFileSync } from "fs";
import { getDb } from "@/lib/server-db";

// POST — save an offer comparison report
export async function POST(request: Request) {
  try {
    const { title, offers_json, report_markdown } = await request.json();

    if (!report_markdown || typeof report_markdown !== "string") {
      return NextResponse.json({ success: false, error: "report_markdown is required" }, { status: 400 });
    }

    const offersArr = Array.isArray(offers_json) ? offers_json : JSON.parse(offers_json || "[]");
    const numOffers = offersArr.length;
    const titleStr = title || "Offer 对比报告";

    const db = getDb();
    // Ensure schema
    const schemaPath = resolve(process.cwd(), "src", "lib", "server-schema.sql");
    if (existsSync(schemaPath)) {
      try {
        const schema = readFileSync(schemaPath, "utf-8");
        db.exec(schema);
      } catch { /* schema already initialized */ }
    }

    const result = db.prepare(
      "INSERT INTO offer_reports (title, offers_json, report_markdown, num_offers) VALUES (?,?,?,?)"
    ).run(titleStr, JSON.stringify(offersArr), report_markdown, numOffers);

    const id = Number(result.lastInsertRowid);
    return NextResponse.json({ success: true, data: { id } }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}

// GET — list recent offer reports
export async function GET() {
  try {
    const db = getDb();
    const rows = db.prepare(
      "SELECT id, title, num_offers, created_at FROM offer_reports ORDER BY created_at DESC LIMIT 20"
    ).all();
return NextResponse.json({ success: true, data: rows });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}
