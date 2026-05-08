import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const PROJECT_ROOT = path.join(process.cwd(), "..");

interface ScanSource {
  company: string;
  platform: string;
  enabled: boolean;
}

interface ScanResult {
  id: string;
  company: string;
  role: string;
  platform: string;
  url: string;
  foundAt: string;
  status: "new" | "evaluated" | "skipped";
  snippet?: string;
}

interface ScanHistoryEntry {
  date: string;
  resultsFound: number;
  newCount: number;
}

function parsePortalsYml(content: string): ScanSource[] {
  const sources: ScanSource[] = [];
  let currentCompany = "";

  for (const line of content.split("\n")) {
    const companyMatch = line.match(/^\s{2}(\S[^:]+):\s*$/);
    if (companyMatch) {
      currentCompany = companyMatch[1].trim();
      continue;
    }

    if (currentCompany) {
      const platformMatch = line.match(/^\s{4}(\S[^:]+):\s*$/);
      if (platformMatch) {
        let platform = platformMatch[1].trim();
        if (platform === "linkedin") platform = "LinkedIn";
        else if (platform === "greenhouse") platform = "Greenhouse";
        else if (platform === "lever") platform = "Lever";
        else if (platform === "ashby") platform = "Ashby";
        else if (platform === "zhipin") platform = "Boss直聘";
        else if (platform === "lagou") platform = "拉勾";
        else if (platform === "liepin") platform = "猎聘";
        else if (platform === "maimai") platform = "脉脉";

        sources.push({
          company: currentCompany,
          platform,
          enabled: true,
        });
      }
    }
  }

  return sources;
}

function parseTsv(content: string): ScanHistoryEntry[] {
  return content
    .split("\n")
    .filter(Boolean)
    .slice(1) // Skip header
    .map((line) => {
      const cols = line.split("\t");
      return {
        date: cols[0] || "",
        resultsFound: parseInt(cols[1]) || 0,
        newCount: parseInt(cols[2]) || 0,
      };
    })
    .filter((e) => e.date);
}

export async function GET() {
  try {
    // Read portals.yml → sources
    let sources: ScanSource[] = [];
    const portalsPath = path.join(PROJECT_ROOT, "portals.yml");
    if (fs.existsSync(portalsPath)) {
      sources = parsePortalsYml(fs.readFileSync(portalsPath, "utf-8"));
    }

    // Read pipeline.md → pending URLs
    let pipelineCount = 0;
    const pipelinePath = path.join(PROJECT_ROOT, "data", "pipeline.md");
    if (fs.existsSync(pipelinePath)) {
      const content = fs.readFileSync(pipelinePath, "utf-8");
      pipelineCount = (content.match(/^https?:\/\//gm) || []).length;
    }

    // Read scan-history.tsv → history
    let history: ScanHistoryEntry[] = [];
    const historyPath = path.join(PROJECT_ROOT, "data", "scan-history.tsv");
    if (fs.existsSync(historyPath)) {
      history = parseTsv(fs.readFileSync(historyPath, "utf-8"));
    }

    // Read applications.md for cross-reference (mark evaluated entries)
    const evaluatedCompanies = new Set<string>();
    const applicationsPath = path.join(PROJECT_ROOT, "data", "applications.md");
    if (fs.existsSync(applicationsPath)) {
      const content = fs.readFileSync(applicationsPath, "utf-8");
      for (const line of content.split("\n")) {
        const match = line.match(/^\|\s*\d+\s*\|/);
        if (match) {
          const cols = line.split("|").map((c) => c.trim());
          if (cols.length >= 3) {
            evaluatedCompanies.add(`${cols[2]}-${cols[3]}`);
          }
        }
      }
    }

    // Generate results from pipeline URLs (if no pipeline, return empty)
    const results: ScanResult[] = [];
    if (fs.existsSync(pipelinePath)) {
      const pipelineContent = fs.readFileSync(pipelinePath, "utf-8");
      const urlLines = pipelineContent.match(/^https?:\/\/.+$/gm) || [];
      urlLines.forEach((url, i) => {
        const key = `${url}`;
        results.push({
          id: String(i + 1),
          company: "待解析",
          role: "待解析",
          platform: "未知",
          url,
          foundAt: new Date().toISOString().split("T")[0],
          status: evaluatedCompanies.has(key) ? "evaluated" : "new",
        });
      });
    }

    const lastScanDate = history.length > 0 ? history[0].date : null;

    return NextResponse.json({
      success: true,
      data: {
        lastScanDate,
        sources,
        results,
        history,
        pipelineCount,
        hasData: sources.length > 0 || pipelineCount > 0 || history.length > 0,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "未知错误";
    console.error("Scan status API error:", message);
    return NextResponse.json(
      { success: false, error: `读取扫描状态失败: ${message}` },
      { status: 500 },
    );
  }
}
