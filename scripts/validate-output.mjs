#!/usr/bin/env node
/**
 * validate-output.mjs — LLM output validation before persistence
 *
 * Usage:
 *   node scripts/validate-output.mjs --data '{"overall_score":3.8,"date":"2026-05-08","status":"Applied","report_path":"reports/042-bytedance-2026-05-08.md"}'
 *
 * Exit 0 = valid, 1 = invalid (errors found).
 * Warnings (auto-corrected) don't cause non-zero exit.
 */
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

// Load canonical states from states.yml (degrade gracefully if missing)
const statesPath = resolve(ROOT, 'templates', 'states.yml');
const stateLabels = [];
const stateAliases = new Map();
let statesLoaded = false;

try {
  const statesYaml = readFileSync(statesPath, 'utf-8');
  for (const line of statesYaml.split('\n')) {
    const labelMatch = line.match(/^\s*label:\s*(.+)/);
    if (labelMatch) stateLabels.push(labelMatch[1]);
    const aliasMatch = line.match(/^\s*aliases:\s*\[(.+)\]/);
    if (aliasMatch) {
      for (const a of aliasMatch[1].split(',')) {
        const clean = a.trim().replace(/['"]/g, '');
        stateAliases.set(clean.toLowerCase(), stateLabels[stateLabels.length - 1]);
      }
    }
  }
  statesLoaded = true;
} catch (e) {
  // states.yml missing or unreadable — status validation will be skipped
  stateLabels.push('Evaluated', 'Applied', 'Responded', 'Interview', 'Offer', 'Rejected', 'Discarded', 'SKIP');
}

function validateScore(score) {
  const n = Number(score);
  if (isNaN(n)) return { valid: false, error: `score must be a number, got "${score}"` };
  if (n < 1.0 || n > 5.0) return { valid: false, error: `score must be between 1.0 and 5.0, got ${n}` };
  return { valid: true };
}

function validateDate(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { valid: false, error: `date must be YYYY-MM-DD format, got "${date}"` };
  const d = new Date(date);
  if (isNaN(d.getTime())) return { valid: false, error: `date "${date}" is not a valid calendar date` };
  return { valid: true };
}

function validateStatus(status) {
  const clean = status.replace(/\*\*/g, '').trim();
  // Exact match
  for (const label of stateLabels) {
    if (label.toLowerCase() === clean.toLowerCase()) return { valid: true, value: label };
  }
  // Alias match (auto-correct)
  const lower = clean.toLowerCase();
  if (stateAliases.has(lower)) {
    const canonical = stateAliases.get(lower);
    return { valid: true, value: canonical, warning: `status "${status}" auto-corrected to "${canonical}"` };
  }
  // If states.yml was not loaded, accept unknown statuses with a warning
  if (!statesLoaded) {
    return { valid: true, warning: `states.yml unavailable — accepted status "${status}" without validation` };
  }
  return { valid: false, error: `unknown status "${status}". Valid values: [${stateLabels.join(', ')}]` };
}

function validateReportPath(path) {
  if (/^reports\/\d{3}-[a-z0-9-]+-\d{4}-\d{2}-\d{2}\.md$/.test(path)) return { valid: true };
  return { valid: false, error: `report_path must match "reports/NNN-slug-YYYY-MM-DD.md", got "${path}"` };
}

// ── CLI ──────────────────────────────────────────────
const args = process.argv.slice(2);
const dataIdx = args.indexOf('--data');

if (dataIdx === -1) {
  console.error(JSON.stringify({ valid: false, error: 'Usage: node validate-output.mjs --data \'<json>\'' }));
  process.exit(1);
}

let data;
try { data = JSON.parse(args[dataIdx + 1]); } catch {
  console.error(JSON.stringify({ valid: false, error: '--data must be valid JSON' }));
  process.exit(1);
}

const results = { valid: true, checks: {}, errors: [], warnings: [] };

for (const [field, validator] of Object.entries({
  overall_score: validateScore,
  date: validateDate,
  status: v => validateStatus(v),
  report_path: validateReportPath,
})) {
  if (data[field] === undefined) continue;
  const r = validator(data[field]);
  results.checks[field] = r;
  if (!r.valid) {
    results.valid = false;
    results.errors.push(r.error);
  }
  if (r.warning) results.warnings.push(r.warning);
  if (r.value !== undefined) data[field] = r.value; // apply auto-correction
}

console.log(JSON.stringify(results));
process.exit(results.valid ? 0 : 1);
