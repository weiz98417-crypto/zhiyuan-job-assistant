#!/usr/bin/env node
/**
 * check-onboarding.mjs — Verify user data is real before allowing evaluations
 *
 * Checks:
 *   - cv.md: exists, > 50 meaningful chars, no placeholder markers
 *   - config/profile.yml: exists, name is not template example
 *   - modes/_profile.md: exists
 *
 * Exit 0 = all checks pass. Exit 1 = at least one check failed.
 */
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const PLACEHOLDER_MARKERS = [
  '请在此处填写', '在此输入', '请在此填写', '在这里写', '填写你的',
  'TODO: fill', 'Your experience here', 'Paste your CV', 'Insert your',
  'Hier einfügen', 'ここに入力', '여기에 입력',
];
const EXAMPLE_NAMES = ['张三', '李四', '王五', 'Your Name', '姓名', 'name', 'Max Mustermann', '山田太郎'];

let failed = false;

function fail(msg) {
  console.error(`[FAIL] ${msg}`);
  failed = true;
}

// 1. Check cv.md
const cvPath = resolve(ROOT, 'cv.md');
if (!existsSync(cvPath)) {
  fail('cv.md not found. Create it with your real CV.');
} else {
  const cvContent = readFileSync(cvPath, 'utf-8');
  // Remove markdown syntax and whitespace for checking
  const meaningful = cvContent.replace(/[#*>\-\|\s]/g, '').trim();
  if (meaningful.length < 50) {
    fail('cv.md is too short (< 50 meaningful characters). Please fill in your real experience.');
  }
  const lower = cvContent.toLowerCase();
  for (const marker of PLACEHOLDER_MARKERS) {
    if (lower.includes(marker.toLowerCase())) {
      fail(`cv.md contains placeholder text: "${marker}". Replace with real content.`);
      break;
    }
  }
}

// 2. Check config/profile.yml
const profilePath = resolve(ROOT, 'config', 'profile.yml');
if (!existsSync(profilePath)) {
  fail('config/profile.yml not found. Copy from config/profile.example.zh.yml and fill in your info.');
} else {
  const profileContent = readFileSync(profilePath, 'utf-8');
  const nameMatch = profileContent.match(/^\s*name:\s*["']?(.+?)["']?\s*$/m);
  if (!nameMatch) {
    fail('config/profile.yml: "name" field not found. Add your real name.');
  } else {
    const name = nameMatch[1].trim();
    for (const ex of EXAMPLE_NAMES) {
      if (name.toLowerCase() === ex.toLowerCase()) {
        fail(`config/profile.yml: name is template value "${name}". Replace with your real name.`);
        break;
      }
    }
  }
}

// 3. Check modes/_profile.md
const profileMdPath = resolve(ROOT, 'modes', '_profile.md');
if (!existsSync(profileMdPath)) {
  fail('modes/_profile.md not found. Create it with your archetypes and narrative.');
}

if (failed) {
  console.error('\nOnboarding check FAILED. Please fix the issues above before running evaluations.');
  process.exit(1);
}

console.log('Onboarding check passed — all user data appears real.');
process.exit(0);
