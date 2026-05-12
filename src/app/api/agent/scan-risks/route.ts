import { NextResponse } from "next/server";
import { readFileSync, existsSync } from "fs";
import { resolve, join } from "path";

const ROOT = process.cwd();

/* ── Helper: extract value after first colon ── */

function afterColon(line: string): string {
  const idx = line.indexOf(":");
  return idx === -1 ? "" : line.slice(idx + 1).trim().replace(/^['"]|['"]$/g, "");
}

/* ── Simple YAML line parser ── */

function loadTriggers(): Trigger[] {
  const path = resolve(ROOT, "risk-intel-triggers.yml");
  if (!existsSync(path)) return [];
  try {
    const raw = readFileSync(path, "utf-8");
    const triggers: Trigger[] = [];
    let current: Partial<Trigger> = {};
    for (const line of raw.split("\n")) {
      if (/^\s{2}-\s+pattern:/.test(line)) {
        if (current.pattern) triggers.push({ pattern: current.pattern, signal: current.signal || "", severity: current.severity || "low" });
        current = { pattern: afterColon(line) };
      } else if (/^\s{4,}signal:/.test(line) && current.pattern) {
        current.signal = afterColon(line);
      } else if (/^\s{4,}severity:/.test(line) && current.pattern) {
        current.severity = afterColon(line);
      }
    }
    if (current.pattern) triggers.push({ pattern: current.pattern, signal: current.signal || "", severity: current.severity || "low" });
    return triggers;
  } catch { return []; }
}

function loadIntelTerms(): Term[] {
  const path = join(ROOT, "modes", "zh", "risk-intel.md");
  if (!existsSync(path)) return [];
  try {
    const raw = readFileSync(path, "utf-8");
    const terms: Term[] = [];
    const yamlBlock = raw.match(/```yaml\n([\s\S]*?)\n```/);
    if (!yamlBlock) return [];
    const lines = yamlBlock[1].split("\n");
    let inTerms = false;
    let current: Partial<Term> = {};
    for (const line of lines) {
      if (line.trim() === "terms:") { inTerms = true; continue; }
      if (line.trim() === "patterns:" || line.trim() === "employment_types:" || line.startsWith("salary")) { inTerms = false; }
      if (!inTerms) continue;
      if (/^\s{2}-\s*term:/.test(line)) {
        if (current.term) terms.push({ term: current.term, meaning: current.meaning || "", severity: current.severity || "low" });
        current = { term: afterColon(line) };
      } else if (/^\s{4,}meaning:/.test(line) && current.term) {
        current.meaning = afterColon(line);
      } else if (/^\s{4,}severity:/.test(line) && current.term) {
        current.severity = afterColon(line);
      }
    }
    if (current.term) terms.push({ term: current.term, meaning: current.meaning || "", severity: current.severity || "low" });
    return terms;
  } catch { return []; }
}

function loadIntelPatterns(): Pattern[] {
  const path = join(ROOT, "modes", "zh", "risk-intel.md");
  if (!existsSync(path)) return [];
  try {
    const raw = readFileSync(path, "utf-8");
    const patterns: Pattern[] = [];
    const yamlBlock = raw.match(/```yaml\n([\s\S]*?)\n```/);
    if (!yamlBlock) return [];
    const lines = yamlBlock[1].split("\n");
    let inPatterns = false;
    let current: Partial<Pattern> = { signals: [] };
    for (const line of lines) {
      if (line.trim() === "patterns:") { inPatterns = true; continue; }
      if (line.trim() === "employment_types:" || line.startsWith("salary")) { inPatterns = false; }
      if (!inPatterns) continue;
      if (/^\s{2}-\s*pattern:/.test(line)) {
        if (current.pattern) patterns.push({ pattern: current.pattern, description: current.description || "", signals: current.signals || [], severity: current.severity || "low" });
        current = { pattern: afterColon(line), signals: [] };
      } else if (/^\s{4,}description:/.test(line) && current.pattern) {
        current.description = afterColon(line);
      } else if (/^\s{4,}severity:/.test(line) && current.pattern) {
        current.severity = afterColon(line);
      } else if (/^\s{4,}signals:/.test(line) && current.pattern) {
        const arrMatch = line.match(/\[([^\]]*)\]/);
        if (arrMatch) current.signals = arrMatch[1].split(",").map((s: string) => s.trim().replace(/^['"]|['"]$/g, ""));
      }
    }
    if (current.pattern) patterns.push({ pattern: current.pattern, description: current.description || "", signals: current.signals || [], severity: current.severity || "low" });
    return patterns;
  } catch { return []; }
}

/* ── Layer 1: Regex ── */

function scanRegex(text: string, triggers: Trigger[]) {
  const results: Array<{ signal: string; excerpt: string; severity: string; source: string }> = [];
  const seen = new Map<string, { signal: string; excerpt: string; severity: string; source: string }>();
  for (const t of triggers) {
    try {
      const re = new RegExp(t.pattern, "gi");
      let match;
      while ((match = re.exec(text)) !== null) {
        const excerpt = match[0].trim();
        const key = `${t.severity}:${t.signal}`;
        const existing = seen.get(key);
        if (!existing || excerpt.length > existing.excerpt.length) {
          seen.set(key, { signal: t.signal, excerpt, severity: t.severity, source: "regex" });
        }
        if (match.index === re.lastIndex) re.lastIndex++;
      }
    } catch { /* skip */ }
  }
  for (const v of seen.values()) results.push(v);
  return results;
}

/* ── Layer 2: Terms ── */

function scanTerms(text: string, terms: Term[]) {
  const results: Array<{ signal: string; excerpt: string; severity: string; source: string }> = [];
  const seen = new Set<string>();
  const lower = text.toLowerCase();
  for (const t of terms) {
    if (!t.term || t.term.length < 2) continue;
    const needles = t.term.includes("/") ? t.term.split("/").map((s: string) => s.trim()).filter(s => s.length >= 2) : [t.term];
    for (const needle of needles) {
      const n = needle.toLowerCase();
      if (lower.includes(n)) {
        const idx = lower.indexOf(n);
        const start = Math.max(0, idx - 20);
        const end = Math.min(text.length, idx + n.length + 20);
        const excerpt = (start > 0 ? "…" : "") + text.slice(start, end).trim() + (end < text.length ? "…" : "");
        const key = `${t.severity}:${t.meaning}`;
        if (!seen.has(key)) {
          seen.add(key);
          results.push({ signal: `"${t.term}" — ${t.meaning}`, excerpt, severity: t.severity, source: "dictionary" });
        }
      }
    }
  }
  return results;
}

/* ── Layer 3: Patterns ── */

function scanPatterns(text: string, patterns: Pattern[]) {
  const results: Array<{ signal: string; excerpt: string; severity: string; source: string }> = [];
  const lower = text.toLowerCase();
  for (const p of patterns) {
    const matched = (p.signals || []).filter((s: string) => lower.includes(s.toLowerCase()));
    if (matched.length >= 2) {
      results.push({ signal: `[模式] ${p.pattern}: ${p.description}`, excerpt: `匹配: ${matched.join(", ")}`, severity: p.severity, source: "pattern" });
    }
  }
  return results;
}

/* ── Merge ── */

function mergeResults(
  layer1: Array<{ signal: string; excerpt: string; severity: string; source: string }>,
  layer2: Array<{ signal: string; excerpt: string; severity: string; source: string }>,
  layer3: Array<{ signal: string; excerpt: string; severity: string; source: string }>,
) {
  const all = [...layer1, ...layer2, ...layer3];
  const seen = new Map<string, { signal: string; excerpt: string; severity: string; source: string }>();
  for (const r of all) {
    const key = `${r.severity}:${r.signal.replace(/\s+/g, " ").trim()}`;
    const existing = seen.get(key);
    if (!existing) seen.set(key, r);
    else if (r.source === "dictionary" && existing.source === "regex") seen.set(key, r);
    else if (r.source === "pattern") seen.set(key, r);
  }
  return Array.from(seen.values());
}

/* ── Route handler ── */

export async function POST(request: Request) {
  const { jd_text } = await request.json();
  if (!jd_text || typeof jd_text !== "string") {
    return NextResponse.json({ success: false, error: "缺少 jd_text" }, { status: 400 });
  }

  if (jd_text.trim().length < 50) {
    return NextResponse.json({ success: true, data: [] });
  }

  const triggers = loadTriggers();
  const terms = loadIntelTerms();
  const patterns = loadIntelPatterns();

  const results = mergeResults(
    scanRegex(jd_text, triggers),
    scanTerms(jd_text, terms),
    scanPatterns(jd_text, patterns),
  );

  return NextResponse.json({ success: true, data: results });
}
