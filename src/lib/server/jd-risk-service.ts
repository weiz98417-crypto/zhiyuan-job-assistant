import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import yaml from "js-yaml";

export type JDRiskSeverity = "critical" | "high" | "medium" | "low";

export interface JDRiskSignal {
  signal: string;
  excerpt: string;
  severity: JDRiskSeverity;
  source: "regex" | "dictionary" | "pattern";
}

export interface DecodedJDRiskTerm {
  term: string;
  meaning: string;
  severity: JDRiskSeverity;
}

interface Trigger {
  pattern: string;
  signal: string;
  severity: JDRiskSeverity;
}

interface RiskTerm {
  term: string;
  meaning: string;
  severity: JDRiskSeverity;
}

interface RiskPattern {
  pattern: string;
  description: string;
  signals: string[];
  severity: JDRiskSeverity;
}

export function scanJDRisks(jdText: string): JDRiskSignal[] {
  if (jdText.trim().length < 50) return [];
  const intelligence = loadRiskIntelligence();
  return mergeSignals([
    ...scanTriggers(jdText, loadTriggers()),
    ...scanTerms(jdText, intelligence.terms),
    ...scanPatterns(jdText, intelligence.patterns),
  ]);
}

export function decodeJDRiskTerms(text: string): DecodedJDRiskTerm[] {
  const normalized = text.toLowerCase();
  return loadRiskIntelligence().terms
    .filter((term) => term.term.split("/").some((needle) => normalized.includes(needle.trim().toLowerCase())))
    .map(({ term, meaning, severity }) => ({ term, meaning, severity }));
}

function loadTriggers(): Trigger[] {
  const filePath = join(process.cwd(), "risk-intel-triggers.yml");
  if (!existsSync(filePath)) return [];
  try {
    const parsed = yaml.load(readFileSync(filePath, "utf8")) as { triggers?: unknown } | undefined;
    return recordArray(parsed?.triggers).flatMap((item) => {
      const pattern = stringValue(item.pattern);
      const signal = stringValue(item.signal);
      if (!pattern || !signal) return [];
      return [{ pattern, signal, severity: severityValue(item.severity) }];
    });
  } catch {
    return [];
  }
}

function loadRiskIntelligence(): { terms: RiskTerm[]; patterns: RiskPattern[] } {
  const filePath = join(process.cwd(), "modes", "zh", "risk-intel.md");
  if (!existsSync(filePath)) return { terms: [], patterns: [] };
  try {
    const markdown = readFileSync(filePath, "utf8");
    const block = markdown.match(/```yaml\s*([\s\S]*?)```/i)?.[1];
    if (!block) return { terms: [], patterns: [] };
    const parsed = yaml.load(block) as { terms?: unknown; patterns?: unknown } | undefined;
    return {
      terms: recordArray(parsed?.terms).flatMap((item) => {
        const term = stringValue(item.term);
        const meaning = stringValue(item.meaning);
        if (!term || !meaning) return [];
        return [{ term, meaning, severity: severityValue(item.severity) }];
      }),
      patterns: recordArray(parsed?.patterns).flatMap((item) => {
        const pattern = stringValue(item.pattern);
        const description = stringValue(item.description);
        const signals = stringArray(item.signals);
        if (!pattern || !description || signals.length === 0) return [];
        return [{ pattern, description, signals, severity: severityValue(item.severity) }];
      }),
    };
  } catch {
    return { terms: [], patterns: [] };
  }
}

function scanTriggers(text: string, triggers: Trigger[]): JDRiskSignal[] {
  const results: JDRiskSignal[] = [];
  for (const trigger of triggers) {
    try {
      const expression = new RegExp(trigger.pattern, "gi");
      let match: RegExpExecArray | null;
      while ((match = expression.exec(text)) !== null) {
        results.push({
          signal: trigger.signal,
          excerpt: match[0].trim(),
          severity: trigger.severity,
          source: "regex",
        });
        if (match.index === expression.lastIndex) expression.lastIndex += 1;
      }
    } catch {
      continue;
    }
  }
  return results;
}

function scanTerms(text: string, terms: RiskTerm[]): JDRiskSignal[] {
  const lowerText = text.toLowerCase();
  const results: JDRiskSignal[] = [];
  for (const term of terms) {
    const needles = term.term.split("/").map((value) => value.trim()).filter((value) => value.length >= 2);
    const matched = needles.find((needle) => lowerText.includes(needle.toLowerCase()));
    if (!matched) continue;
    const index = lowerText.indexOf(matched.toLowerCase());
    const start = Math.max(0, index - 20);
    const end = Math.min(text.length, index + matched.length + 20);
    results.push({
      signal: `"${term.term}" — ${term.meaning}`,
      excerpt: `${start > 0 ? "…" : ""}${text.slice(start, end).trim()}${end < text.length ? "…" : ""}`,
      severity: term.severity,
      source: "dictionary",
    });
  }
  return results;
}

function scanPatterns(text: string, patterns: RiskPattern[]): JDRiskSignal[] {
  const lowerText = text.toLowerCase();
  return patterns.flatMap((pattern) => {
    const matched = pattern.signals.filter((signal) => lowerText.includes(signal.toLowerCase()));
    return matched.length >= 2
      ? [{
          signal: `[模式] ${pattern.pattern}: ${pattern.description}`,
          excerpt: `匹配: ${matched.join("、")}`,
          severity: pattern.severity,
          source: "pattern" as const,
        }]
      : [];
  });
}

function mergeSignals(signals: JDRiskSignal[]): JDRiskSignal[] {
  const merged = new Map<string, JDRiskSignal>();
  for (const signal of signals) {
    const key = `${signal.severity}:${signal.signal.replace(/\s+/g, " ").trim()}`;
    const existing = merged.get(key);
    if (!existing || sourceRank(signal.source) > sourceRank(existing.source) || signal.excerpt.length > existing.excerpt.length) {
      merged.set(key, signal);
    }
  }
  return Array.from(merged.values());
}

function sourceRank(source: JDRiskSignal["source"]): number {
  return source === "pattern" ? 3 : source === "dictionary" ? 2 : 1;
}

function recordArray(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item))
    : [];
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function severityValue(value: unknown): JDRiskSeverity {
  return value === "critical" || value === "high" || value === "medium" ? value : "low";
}
