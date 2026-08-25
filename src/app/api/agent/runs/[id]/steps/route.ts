import { NextResponse } from "next/server";

export async function POST(
  _request?: Request,
  _context?: { params: Promise<{ id: string }> },
) {
  return NextResponse.json(
    { success: false, error: "Run Evidence is projected from durable events" },
    { status: 405 },
  );
}
