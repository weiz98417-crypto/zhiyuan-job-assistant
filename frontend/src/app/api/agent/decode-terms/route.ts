import { NextResponse } from "next/server";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import yaml from "js-yaml";

function loadRiskIntel() {
  // Try multiple possible paths
  const candidates = [
    resolve(process.cwd(), "..", "modes", "zh", "risk-intel.md"),
    resolve(process.cwd(), "modes", "zh", "risk-intel.md"),
    resolve(process.cwd(), "..", "..", "modes", "zh", "risk-intel.md"),
    "D:/求职助手升级版/modes/zh/risk-intel.md",
  ];

  let raw: string | null = null;
  for (const path of candidates) {
    if (existsSync(path)) {
      raw = readFileSync(path, "utf-8");
      break;
    }
  }
  if (!raw) return null;

  try {
    // Extract YAML from markdown code fence (```yaml ... ```)
    const yamlMatch = raw.match(/```ya?ml\s*\n([\s\S]*?)```/);
    const yamlContent = yamlMatch ? yamlMatch[1] : raw;
    return yaml.load(yamlContent) as Record<string, unknown> | null;
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  const { phrase } = await request.json();
  if (!phrase || typeof phrase !== "string" || !phrase.trim()) {
    return NextResponse.json({ success: false, error: "请提供要解码的短语" }, { status: 400 });
  }

  const data = loadRiskIntel();
  if (!data?.terms || !Array.isArray(data.terms)) {
    return NextResponse.json({ success: false, error: "黑话词典加载失败" }, { status: 500 });
  }

  const terms = data.terms as Array<{ term: string; meaning: string; severity: string }>;
  const matches = terms.filter((t) => phrase.includes(t.term)).map((t) => ({
    term: t.term,
    meaning: t.meaning,
    severity: t.severity || "medium",
  }));

  return NextResponse.json({ success: true, data: matches });
}
