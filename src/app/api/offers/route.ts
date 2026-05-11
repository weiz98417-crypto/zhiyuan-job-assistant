import { NextResponse } from "next/server";
import Database from "better-sqlite3";
import { resolve } from "path";

function getDb() { return new Database(resolve(process.cwd(), "data", "zhiyuan.db")); }

export async function GET() {
  try {
    const db = getDb();
    const rows = db.prepare("SELECT * FROM offers ORDER BY created_at DESC").all();
    db.close();
    return NextResponse.json({ success: true, data: rows });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { company, role, monthly_salary, bonus, equity, location, level, benefits, application_id } = await request.json();
    const db = getDb();
    const result = db.prepare(
      "INSERT INTO offers (company, role, monthly_salary, bonus, equity, location, level, benefits_json, application_id) VALUES (?,?,?,?,?,?,?,?,?)"
    ).run(company, role, monthly_salary || null, bonus || null, equity || null, location || null, level || null, JSON.stringify(benefits || {}), application_id || null);
    const id = result.lastInsertRowid;
    db.close();
    return NextResponse.json({ success: true, data: { id: Number(id) } }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}
