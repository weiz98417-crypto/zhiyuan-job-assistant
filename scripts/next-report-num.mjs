#!/usr/bin/env node
/**
 * next-report-num.mjs — Atomic report number allocation
 *
 * Uses mkdirSync as a filesystem-level atomic lock to prevent
 * duplicate report numbers from concurrent agents.
 *
 * Usage: node scripts/next-report-num.mjs
 * Output: a single integer on stdout (e.g. "042")
 */
import { readdirSync, mkdirSync, statSync, rmdirSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const REPORTS_DIR = resolve(ROOT, 'reports');
const LOCKS_DIR = resolve(REPORTS_DIR, '.locks');

// Ensure directories exist
if (!existsSync(REPORTS_DIR)) mkdirSync(REPORTS_DIR, { recursive: true });
if (!existsSync(LOCKS_DIR)) mkdirSync(LOCKS_DIR, { recursive: true });

// ── Stale lock cleanup ──────────────────────────────
const ONE_HOUR = 60 * 60 * 1000;
const now = Date.now();
try {
  for (const entry of readdirSync(LOCKS_DIR)) {
    const lockPath = resolve(LOCKS_DIR, entry);
    try {
      const stat = statSync(lockPath);
      if (now - stat.mtimeMs > ONE_HOUR) {
        rmdirSync(lockPath, { recursive: true });
      }
    } catch { /* stale entry, ignore */ }
  }
} catch { /* dir may not exist yet */ }

// ── Find next available number ──────────────────────
const existingFiles = readdirSync(REPORTS_DIR)
  .filter(f => /^\d{3}-/.test(f));

let max = 0;
for (const f of existingFiles) {
  const n = parseInt(f.substring(0, 3));
  if (n > max) max = n;
}

let num = max + 1;
while (true) {
  const padded = String(num).padStart(3, '0');
  const lockDir = resolve(LOCKS_DIR, padded);
  try {
    mkdirSync(lockDir);
    // Got the lock — this number is ours
    console.log(String(num));
    process.exit(0);
  } catch (e) {
    if (e.code === 'EEXIST') {
      // Someone else has this number, try next
      num++;
      continue;
    }
    console.error('Failed to allocate report number:', e.message);
    process.exit(1);
  }
}
