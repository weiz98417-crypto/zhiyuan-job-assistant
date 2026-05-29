/**
 * Compile-time scan: detect API routes that touch private tables without user_id filtering.
 * Usage: node scripts/check-isolation.mjs
 * Exit 0 = all clear, Exit 1 = violations found.
 *
 * Zero external dependencies — pure Node.js fs/path.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PRIVATE_TABLES = [
  'profiles',
  'profile_signals',
  'sessions',
  'stories',
  'cv_data',
  'applications',
  'agent_preferences',
  'session_memory',
  'optimization_preferences',
];

// Table references that are OK without user_id (e.g., in PRAGMA, CREATE TABLE, comments)
const SAFE_CONTEXTS = ['PRAGMA table_info', 'CREATE TABLE', 'ALTER TABLE', '--'];

function checkFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const violations = [];

  for (const table of PRIVATE_TABLES) {
    // Skip if the file doesn't reference this table at all
    if (!content.includes(table)) continue;

    // Check for user_id filtering
    const hasUserId = content.includes('user_id');
    // Check for auth helpers that imply user-scoped access
    const hasAuth = content.includes('getCurrentUser') || content.includes('scopedDb');

    // Skip if file has getCurrentUser or scopedDb (authenticated, userId passed to helpers)
    if (hasAuth) continue;

    // Only flag if the table appears in a query context (not CREATE TABLE/PRAGMA/comment)
    if (!hasUserId) {
      const lines = content.split('\n');
      let tableUsedInQuery = false;
      for (const line of lines) {
        if (line.includes(table) && !SAFE_CONTEXTS.some((ctx) => line.includes(ctx + ' ' + table) || line.includes(ctx + '(' + table))) {
          tableUsedInQuery = true;
          break;
        }
      }
      if (tableUsedInQuery) {
        violations.push({ table, missing: 'user_id filter or getCurrentUser' });
      }
    }
  }
  return violations;
}

function walk(dir) {
  const results = [];
  try {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        results.push(...walk(full));
      } else if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) {
        const violations = checkFile(full);
        if (violations.length > 0) {
          results.push({ file: full, violations });
        }
      }
    }
  } catch {
    // Skip inaccessible directories
  }
  return results;
}

const apiDir = path.join(__dirname, '..', 'src', 'app', 'api');
if (!fs.existsSync(apiDir)) {
  console.error('API directory not found:', apiDir);
  process.exit(1);
}

const results = walk(apiDir);

if (results.length > 0) {
  console.error('❌ 以下 API route 可能缺少 user_id 过滤:\n');
  for (const { file, violations } of results) {
    const relPath = path.relative(path.join(__dirname, '..'), file);
    console.error(`  ${relPath}:`);
    for (const v of violations) {
      console.error(`    ⚠  ${v.table} — 缺少 ${v.missing}`);
    }
    console.error();
  }
  process.exit(1);
}

console.log('✅ 所有 API route 的数据隔离检查通过');
