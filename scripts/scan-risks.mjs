#!/usr/bin/env node
/**
 * scan-risks.mjs — Deterministic risk signal scanner
 *
 * Three-layer detection, zero LLM dependency:
 *   1. Regex patterns (risk-intel-triggers.yml) — covers common phrasings
 *   2. Literal term matching (modes/zh/risk-intel.md) — 30-term blacklist dictionary
 *   3. Pattern signal matching (risk-intel.md patterns) — 骗术模式库 multi-signal detection
 *
 * Layer 4 (LLM semantic) runs separately via the evaluate pipeline.
 *
 * Usage:
 *   node scripts/scan-risks.mjs --jd-text "JD plain text..."
 *   node scripts/scan-risks.mjs --jd-file ./jds/001-bytedance.md
 */
import { readFileSync, existsSync } from 'fs';
import yaml from 'js-yaml';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const TRIGGERS_PATH = resolve(ROOT, 'risk-intel-triggers.yml');
const INTEL_PATH = resolve(ROOT, 'modes', 'zh', 'risk-intel.md');

// ── Layer 1: Regex triggers ──────────────────────────

function loadTriggers() {
  if (!existsSync(TRIGGERS_PATH)) return [];
  try {
    const raw = readFileSync(TRIGGERS_PATH, 'utf-8');
    const data = yaml.load(raw);
    return data.triggers || [];
  } catch {
    console.error('Warning: risk-intel-triggers.yml parse failed. Skipping regex layer.');
    return [];
  }
}

function scanRegex(text, triggers) {
  const results = [];
  const seen = new Map();
  for (const t of triggers) {
    try {
      const re = new RegExp(t.pattern, 'gi');
      let match;
      while ((match = re.exec(text)) !== null) {
        const excerpt = match[0].trim();
        const key = `${t.severity}:${t.signal}`;
        const existing = seen.get(key);
        if (!existing || excerpt.length > existing.excerpt.length) {
          seen.set(key, { signal: t.signal, excerpt, severity: t.severity, source: 'regex' });
        }
        if (match.index === re.lastIndex) re.lastIndex++;
      }
    } catch (e) {
      console.error(`Warning: invalid regex "${t.pattern}": ${e.message}`);
    }
  }
  for (const v of seen.values()) results.push(v);
  return results;
}

// ── Layer 2+3: Full risk-intel dictionary ─────────────

function loadIntelDictionary() {
  if (!existsSync(INTEL_PATH)) return { terms: [], patterns: [] };
  try {
    const raw = readFileSync(INTEL_PATH, 'utf-8');
    // Extract YAML block from markdown
    const yamlMatch = raw.match(/```yaml\n([\s\S]*?)\n```/);
    if (!yamlMatch) {
      console.error('Warning: risk-intel.md has no YAML block. Skipping dictionary layer.');
      return { terms: [], patterns: [] };
    }
    const data = yaml.load(yamlMatch[1]);
    return {
      terms: data.terms || [],
      patterns: data.patterns || [],
      employmentTypes: data.employment_types || [],
    };
  } catch (e) {
    console.error(`Warning: risk-intel.md parse failed: ${e.message}. Skipping dictionary layer.`);
    return { terms: [], patterns: [] };
  }
}

/** Literal substring match for each term in the dictionary.
 *  Handles compound terms (e.g. "试岗期/见习期" → check both "试岗期" and "见习期"). */
function scanTerms(text, terms) {
  const results = [];
  const seen = new Set();
  const lower = text.toLowerCase();
  for (const t of terms) {
    const termRaw = (t.term || '').trim();
    if (!termRaw || termRaw.length < 2) continue;
    // Split compound terms: "试岗期/见习期" → ["试岗期", "见习期"]
    const needles = termRaw.includes('/')
      ? termRaw.split('/').map(s => s.trim()).filter(s => s.length >= 2)
      : [termRaw];
    for (const needle of needles) {
      const n = needle.toLowerCase();
      if (lower.includes(n)) {
        const idx = lower.indexOf(n);
        const start = Math.max(0, idx - 20);
        const end = Math.min(text.length, idx + n.length + 20);
        const excerpt = (start > 0 ? '…' : '') + text.slice(start, end).trim() + (end < text.length ? '…' : '');
        const key = `${t.severity}:${t.meaning}`;
        if (!seen.has(key)) {
          seen.add(key);
          results.push({ signal: `"${t.term}" — ${t.meaning}`, excerpt, severity: t.severity, source: 'dictionary' });
        }
      }
    }
  }
  return results;
}

/** Multi-signal pattern detection: if 2+ signals match → pattern triggered */
function scanPatterns(text, patterns) {
  const results = [];
  const lower = text.toLowerCase();
  for (const p of patterns) {
    const signals = p.signals || [];
    const matched = signals.filter((s) => lower.includes(s.toLowerCase()));
    if (matched.length >= 2) {
      results.push({
        signal: `[骗术模式] ${p.pattern}: ${p.description}`,
        excerpt: `匹配信号: ${matched.join(', ')}`,
        severity: p.severity,
        source: 'pattern',
      });
    }
  }
  return results;
}

// ── Merge & deduplicate across layers ─────────────────

function mergeResults(layer1, layer2, layer3) {
  const all = [...layer1, ...layer2, ...layer3];
  const seen = new Map();

  for (const r of all) {
    const key = `${r.severity}:${r.signal.replace(/\s+/g, ' ').trim()}`;
    const existing = seen.get(key);

    if (!existing) {
      seen.set(key, r);
    } else if (r.source === 'dictionary' && existing.source === 'regex') {
      // Dictionary has richer meaning — replace regex
      seen.set(key, r);
    } else if (r.source === 'pattern') {
      // Pattern matches always take priority (they're multi-signal confirmed)
      seen.set(key, r);
    }
  }

  return Array.from(seen.values());
}

// ── CLI ──────────────────────────────────────────────
const args = process.argv.slice(2);
const textIdx = args.indexOf('--jd-text');
const fileIdx = args.indexOf('--jd-file');

let jdText = '';

if (textIdx !== -1) {
  jdText = args[textIdx + 1] || '';
} else if (fileIdx !== -1) {
  const filePath = resolve(args[fileIdx + 1] || '');
  if (existsSync(filePath)) {
    jdText = readFileSync(filePath, 'utf-8');
  } else {
    console.error(JSON.stringify({ error: `File not found: ${filePath}` }));
    process.exit(1);
  }
} else {
  try {
    jdText = readFileSync(0, 'utf-8');
  } catch {
    console.error(JSON.stringify({ error: 'Usage: node scan-risks.mjs --jd-text "<text>" or --jd-file <path>' }));
    process.exit(1);
  }
}

if (!jdText || jdText.trim().length < 50) {
  console.log(JSON.stringify([]));
  process.exit(0);
}

// Run all 3 layers
const triggers = loadTriggers();
const { terms, patterns } = loadIntelDictionary();

const layer1 = scanRegex(jdText, triggers);
const layer2 = scanTerms(jdText, terms);
const layer3 = scanPatterns(jdText, patterns);

const results = mergeResults(layer1, layer2, layer3);
console.log(JSON.stringify(results));
