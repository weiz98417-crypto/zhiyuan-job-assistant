import { NextResponse } from "next/server";
import { loadModeDocument } from "@/lib/agent/knowledge/registry/loader";
import yaml from "js-yaml";

function loadRiskIntel() {
  // Spec 25：modes 统一经注册表加载器读取
  const raw = loadModeDocument("zh", "risk-intel");
  if (raw === null) return null;

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
  const body = await request.json();
  const text = [body.text, body.phrase, body.jd_text]
    .find((value) => typeof value === "string" && value.trim()) as string | undefined;
  if (!text || !text.trim()) {
    return NextResponse.json({ success: false, error: "请提供要解码的短语或 JD 文本" }, { status: 400 });
  }

  const data = loadRiskIntel();
  if (!data?.terms || !Array.isArray(data.terms)) {
    return NextResponse.json({ success: false, error: "黑话词典加载失败" }, { status: 500 });
  }

  const terms = data.terms as Array<{ term: string; meaning: string; severity: string }>;
  const matches = terms.filter((t) => text.includes(t.term)).map((t) => ({
    term: t.term,
    meaning: t.meaning,
    severity: t.severity || "medium",
  }));

  return NextResponse.json({ success: true, data: matches });
}
