import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { createScanEntryForUser } from "@/lib/scan-data";
import { loadPortals } from "../../../../lib/scan/orchestrator.mjs";
import { spawn } from "child_process";
import path from "path";

let workerStartedAt = 0;

function kickScanWorker() {
  const now = Date.now();
  if (now - workerStartedAt < 3000) return;
  workerStartedAt = now;

  const child = spawn(
    process.execPath,
    [path.join(process.cwd(), "scripts", "scan-worker.mjs"), "--once"],
    {
      cwd: process.cwd(),
      detached: true,
      stdio: "ignore",
      windowsHide: true,
      env: process.env,
    },
  );
  child.unref();
}

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    let companyFilter: string[] | undefined;
    let titlePositive: string[] = [];
    let titleNegative: string[] = [];
    let location = "";
    let maxResults = 50;
    try {
      const body = await request.json();
      if (body?.companies && Array.isArray(body.companies)) {
        companyFilter = body.companies;
      }
      if (Array.isArray(body?.titleKeywords)) {
        titlePositive = body.titleKeywords.map((item: unknown) => String(item).trim()).filter(Boolean);
      } else if (typeof body?.titleKeyword === "string") {
        titlePositive = body.titleKeyword.split(/[,，\s]+/).map((item: string) => item.trim()).filter(Boolean);
      }
      if (Array.isArray(body?.excludeKeywords)) {
        titleNegative = body.excludeKeywords.map((item: unknown) => String(item).trim()).filter(Boolean);
      } else if (typeof body?.excludeKeyword === "string") {
        titleNegative = body.excludeKeyword.split(/[,，\s]+/).map((item: string) => item.trim()).filter(Boolean);
      }
      if (typeof body?.location === "string") {
        location = body.location.trim();
      }
      if (body?.maxResults !== undefined) {
        const parsed = Number(body.maxResults);
        if (Number.isFinite(parsed)) {
          maxResults = Math.min(Math.max(Math.floor(parsed), 1), 200);
        }
      }
    } catch {
      // empty body
    }

    if (titlePositive.length === 0) {
      return NextResponse.json(
        { error: "missing_title_keywords", message: "请先填写岗位名称或关键词，再开始扫描。" },
        { status: 400 },
      );
    }

    const companies = await loadPortals();
    const { scanId, conflict, companiesTotal } = await createScanEntryForUser(String(user.userId), companies, companyFilter, {
      positive: titlePositive,
      negative: titleNegative,
    }, {
      location,
      maxResults,
    });

    if (conflict) {
      return NextResponse.json(
        { error: "scan_already_running", existingScanId: scanId },
        { status: 409 }
      );
    }

    kickScanWorker();

    return NextResponse.json({ scanId, companiesTotal }, { status: 201 });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "未知错误";
    console.error("POST /api/scan error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
