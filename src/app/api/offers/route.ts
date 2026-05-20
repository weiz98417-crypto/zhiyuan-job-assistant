import { NextResponse } from "next/server";
import { existsSync, readFileSync } from "fs";
import { resolve } from "path";
import { getDb } from "@/lib/server-db";

function ensureSchema() {
  const schemaPath = resolve(process.cwd(), "src", "lib", "server-schema.sql");
  if (!existsSync(schemaPath)) return;
  const db = getDb();
  try { db.exec("SELECT 1 FROM offers LIMIT 1"); } catch {
    const sql = readFileSync(schemaPath, "utf-8");
    db.exec(sql);
  }
  const cols = [
    "ALTER TABLE offers ADD COLUMN months_per_year INTEGER NOT NULL DEFAULT 12",
    "ALTER TABLE offers ADD COLUMN annual_bonus REAL DEFAULT 0",
    "ALTER TABLE offers ADD COLUMN has_social_insurance INTEGER NOT NULL DEFAULT 1",
    "ALTER TABLE offers ADD COLUMN housing_fund_rate INTEGER NOT NULL DEFAULT 7",
    "ALTER TABLE offers ADD COLUMN probation_months INTEGER NOT NULL DEFAULT 3",
    "ALTER TABLE offers ADD COLUMN start_date TEXT",
    "ALTER TABLE offers ADD COLUMN other_benefits TEXT",
  ];
  for (const sql of cols) {
    try { db.exec(sql); } catch { /* column already exists */ }
  }
}

export async function GET() {
  try {
    ensureSchema();
    const db = getDb();
    const rows = db.prepare("SELECT * FROM offers ORDER BY created_at DESC").all();
return NextResponse.json({ success: true, data: rows });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    ensureSchema();
    const body = await request.json();
    const {
      company, role,
      monthly_salary, months_per_year, annual_bonus,
      has_social_insurance, housing_fund_rate,
      options, probation_months, start_date, other_benefits,
      location, level, benefits, application_id,
    } = body;

    if (!company || !role) {
      return NextResponse.json({ success: false, error: "company and role are required" }, { status: 400 });
    }

    const db = getDb();

    // Upsert — auto-detect if offer already exists for this company+role
    const existing = db.prepare("SELECT id FROM offers WHERE company = ? AND role = ?").get(company, role) as { id: number } | undefined;

    if (existing) {
      db.prepare(`
        UPDATE offers SET
          monthly_salary = ?, months_per_year = ?, annual_bonus = ?,
          has_social_insurance = ?, housing_fund_rate = ?,
          options = ?, probation_months = ?, start_date = ?,
          other_benefits = ?, location = ?, level = ?,
          benefits_json = ?, application_id = ?
        WHERE id = ?
      `).run(
        monthly_salary ?? 0, months_per_year ?? 12, annual_bonus ?? 0,
        has_social_insurance !== false ? 1 : 0, housing_fund_rate ?? 7,
        options ?? null, probation_months ?? 3, start_date ?? null,
        other_benefits ?? null, location ?? null, level ?? null,
        JSON.stringify(benefits || {}), application_id ?? null,
        existing.id,
      );
    return NextResponse.json({ success: true, data: { id: existing.id, updated: true } }, { status: 200 });
    }

    const result = db.prepare(`
      INSERT INTO offers (
        company, role, monthly_salary, months_per_year, annual_bonus,
        has_social_insurance, housing_fund_rate, options, probation_months,
        start_date, other_benefits, location, level, benefits_json, application_id
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(
      company, role,
      monthly_salary ?? 0, months_per_year ?? 12, annual_bonus ?? 0,
      has_social_insurance !== false ? 1 : 0, housing_fund_rate ?? 7,
      options ?? null, probation_months ?? 3, start_date ?? null,
      other_benefits ?? null, location ?? null, level ?? null,
      JSON.stringify(benefits || {}), application_id ?? null,
    );
    const id = result.lastInsertRowid;
return NextResponse.json({ success: true, data: { id: Number(id), created: true } }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}
