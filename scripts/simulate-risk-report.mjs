#!/usr/bin/env node
/**
 * simulate-risk-report.mjs — Demo: show risk detection output as it would appear in an evaluation report
 *
 * Usage:
 *   node scripts/simulate-risk-report.mjs --jd-text "<JD文本>"
 *   node scripts/simulate-risk-report.mjs --jd-file <path>
 */
import { execFileSync } from 'child_process';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { readFileSync, existsSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const SCAN_RISKS = resolve(ROOT, 'scripts', 'scan-risks.mjs');

const args = process.argv.slice(2);
const textIdx = args.indexOf('--jd-text');
const fileIdx = args.indexOf('--jd-file');

let jdText = '';
if (textIdx !== -1) {
  jdText = args[textIdx + 1] || '';
} else if (fileIdx !== -1) {
  const fp = resolve(args[fileIdx + 1] || '');
  jdText = existsSync(fp) ? readFileSync(fp, 'utf-8') : '';
}

if (!jdText) {
  console.log('Usage: node scripts/simulate-risk-report.mjs --jd-text "<JD>"');
  process.exit(1);
}

// Run literal scan
let signals;
try {
  const raw = execFileSync('node', [SCAN_RISKS, '--jd-text', jdText], { encoding: 'utf-8' });
  signals = JSON.parse(raw.trim());
} catch {
  console.log('Scan failed');
  process.exit(1);
}

if (signals.length === 0) {
  console.log('## 🛡️ 风险提示\n');
  console.log('**综合风险等级：🟢 低风险** — 未检测到已知风险信号。\n');
  console.log('> 正常评估，风险检测不影响本次评分。');
  process.exit(0);
}

// Weight mapping
const weights = { critical: 10, high: 4, medium: 2, low: 1 };
const levelIcons = { critical: '🔴 critical', high: '🔴 high', medium: '🟡 medium', low: '🟢 low' };

let totalWeight = 0;
let hasCritical = false;

// Build table
console.log('## 🛡️ 风险提示\n');
console.log('| 信号 | JD原文 | 权重 | 信号等级 | 说明 |');
console.log('|------|--------|------|----------|------|');

for (const s of signals) {
  const w = weights[s.severity] || 0;
  totalWeight += w;
  if (s.severity === 'critical') hasCritical = true;
  console.log(`| ${s.signal} | "${s.excerpt}" | ${w} (${s.severity}) | ${levelIcons[s.severity] || s.severity} | ${s.signal} |`);
}

// Determine tier
let tier, advice, scoreImpact;
if (hasCritical) {
  tier = '🔴 严重';
  advice = '⚠️ 建议放弃此岗位——检测到疑似诈骗/传销信号';
  scoreImpact = '匹配度总分强制设为 1.0/5';
} else if (totalWeight >= 6) {
  tier = '🔴 高风险';
  advice = '面试时务必追问具体工作安排、加班机制和薪酬结构';
  scoreImpact = '匹配度总分上限 min(原分, 2.5)/5';
} else if (totalWeight >= 2) {
  tier = '🟡 中风险';
  advice = '了解清楚再决定，面试时针对性提问';
  scoreImpact = '评分不变，但评估报告顶部加风险提示横幅';
} else {
  tier = '🟢 低风险';
  advice = '无重大风险信号';
  scoreImpact = '正常评估';
}

console.log();
console.log(`**风险总分：${totalWeight} → 综合风险等级：${tier}**`);
console.log(`**评分影响：** ${scoreImpact}`);
console.log(`**建议：** ${advice}`);
