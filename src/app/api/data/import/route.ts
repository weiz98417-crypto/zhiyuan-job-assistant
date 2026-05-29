import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import fs from "fs";
import path from "path";

const PROJECT_ROOT = path.join(process.cwd());

function parseApplications(content: string) {
  const apps: Record<string, unknown>[] = [];
  const lines = content.split("\n");

  for (const line of lines) {
    const match = line.match(/^\|\s*(\d+)\s*\|\s*(\S+)\s*\|\s*(.+?)\s*\|(.+?)\|(.+?)\|(.+?)\|(.+?)\|(.+?)\|(.+?)\|$/);
    if (match) {
      apps.push({
        num: parseInt(match[1]),
        date: match[2].trim(),
        company: match[3].trim(),
        role: match[4].trim(),
        score: match[5].trim(),
        status: match[6].trim(),
        pdf: match[7].trim(),
        report: match[8].trim(),
        notes: match[9].trim(),
      });
    }
  }

  return apps;
}

function parseReport(filename: string, content: string) {
  const header: Record<string, string> = {};
  const lines = content.split("\n");

  for (const line of lines) {
    const kvMatch = line.match(/^\*\*(.+?):\*\*\s*(.+)$/);
    if (kvMatch) {
      header[kvMatch[1].trim()] = kvMatch[2].trim();
    }
  }

  // Extract report number from filename (e.g., "012-company-2025-01-01.md")
  const numMatch = filename.match(/^(\d+)/);
  const reportNum = numMatch ? parseInt(numMatch[1]) : 0;

  return {
    filename,
    reportNum,
    header,
    rawContent: content.slice(0, 10000),
  };
}

function parseProfileYml(content: string): Record<string, unknown> {
  const profile: Record<string, unknown> = {};
  let currentKey = "";

  for (const line of content.split("\n")) {
    const topMatch = line.match(/^(\w[\w_]*):\s*(.*)$/);
    if (topMatch) {
      currentKey = topMatch[1];
      const val = topMatch[2].trim();
      if (val && val !== "''" && val !== '""') {
        profile[currentKey] = val.replace(/^['"]|['"]$/g, "");
      }
      continue;
    }

    if (currentKey) {
      const nestedMatch = line.match(/^\s{2}(\w[\w_]*):\s*(.*)$/);
      if (nestedMatch) {
        const nestedKey = nestedMatch[1];
        const nestedVal = nestedMatch[2].trim();
        if (nestedVal && nestedVal !== "''" && nestedVal !== '""') {
          if (!profile[currentKey] || typeof profile[currentKey] !== "object") {
            profile[currentKey] = {};
          }
          (profile[currentKey] as Record<string, unknown>)[nestedKey] = nestedVal.replace(/^['"]|['"]$/g, "");
        }
      }
    }
  }

  return profile;
}

export async function GET() {
  try {
    let user;
    try { user = await getCurrentUser(); } catch { return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 }); }

    // Read applications.md
    let applications: Record<string, unknown>[] = [];
    const appsPath = path.join(PROJECT_ROOT, "data", "applications.md");
    if (fs.existsSync(appsPath)) {
      applications = parseApplications(fs.readFileSync(appsPath, "utf-8"));
    }

    // Read reports/*.md
    const reports: Record<string, unknown>[] = [];
    const reportsDir = path.join(PROJECT_ROOT, "reports");
    if (fs.existsSync(reportsDir)) {
      const files = fs.readdirSync(reportsDir).filter((f) => f.endsWith(".md"));
      for (const file of files) {
        const content = fs.readFileSync(path.join(reportsDir, file), "utf-8");
        reports.push(parseReport(file, content));
      }
    }

    // Read config/profile.yml
    let profile: Record<string, unknown> = {};
    const profilePath = path.join(PROJECT_ROOT, "config", "profile.yml");
    if (fs.existsSync(profilePath)) {
      profile = parseProfileYml(fs.readFileSync(profilePath, "utf-8"));
    }

    // Read cv.md
    let cvContent = "";
    const cvPath = path.join(PROJECT_ROOT, "cv.md");
    if (fs.existsSync(cvPath)) {
      cvContent = fs.readFileSync(cvPath, "utf-8");
    }

    const hasData = applications.length > 0 || reports.length > 0 || Object.keys(profile).length > 0;

    return NextResponse.json({
      success: true,
      data: {
        applications,
        reports,
        profile,
        cv: cvContent || null,
        hasData,
        summary: `找到 ${applications.length} 条申请、${reports.length} 份报告、${Object.keys(profile).length} 个配置项`,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "未知错误";
    console.error("Data import API error:", message);
    return NextResponse.json(
      { success: false, error: `读取数据失败: ${message}` },
      { status: 500 },
    );
  }
}
