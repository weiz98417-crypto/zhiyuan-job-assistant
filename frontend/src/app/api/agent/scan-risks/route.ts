import { NextResponse } from "next/server";
import { spawn } from "child_process";
import { resolve } from "path";

export async function POST(request: Request) {
  const { jd_text } = await request.json();
  if (!jd_text || typeof jd_text !== "string") {
    return NextResponse.json({ success: false, error: "缺少 jd_text" }, { status: 400 });
  }

  const scriptPath = resolve(process.cwd(), "..", "scripts", "scan-risks.mjs");

  return new Promise<Response>((resolvePromise) => {
    const proc = spawn("node", [scriptPath, "--jd-text", jd_text], {
      timeout: 10000,
    });
    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (d: Buffer) => { stdout += d.toString(); });
    proc.stderr.on("data", (d: Buffer) => { stderr += d.toString(); });

    proc.on("error", () => {
      resolvePromise(NextResponse.json({ success: true, data: [] }));
    });

    proc.on("close", () => {
      try {
        const signals = JSON.parse(stdout);
        resolvePromise(NextResponse.json({ success: true, data: signals }));
      } catch {
        resolvePromise(NextResponse.json({ success: true, data: [], warning: stderr?.slice(0, 200) || undefined }));
      }
    });
  });
}
