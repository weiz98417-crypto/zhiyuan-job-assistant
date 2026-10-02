#!/usr/bin/env node
/**
 * Spec 25 护栏：prompt 构建路径环境混淆回归检查。
 * 服务端 prompt 构建代码中不允许再出现 localhost 自调用 fetch 或 localStorage 读取。
 * 白名单：测试文件、客户端组件目录（components/app）不扫描。
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const SCAN_DIRS = ["src/lib", "scripts"];
/** 双端共享或纯客户端模块——localStorage 在其中是合法的（Spec 25 只治理服务端 prompt 构建路径）。 */
const ALLOWLIST = [
  "src/lib/cv-storage.ts",
  "src/lib/useLockedFields.ts",
  "src/lib/agent/migrate.ts",
  "src/lib/agent/profile-sop.ts",
  "src/lib/agent/tools/action/optimize-resume-section.ts",
  "src/lib/agent/tools/query/detect-skill-gaps.ts",
  "scripts/check-prompt-hygiene.mjs",
];
const OFFENSES = [
  { pattern: /fetch\(\s*[`"']https?:\/\/(localhost|127\.0\.0\.1)/, reason: "prompt 构建路径 localhost 自调用 fetch" },
  { pattern: /localStorage\./, reason: "服务端代码读取 localStorage" },
];

function* walk(dir) {
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, item.name);
    if (item.isDirectory()) yield* walk(full);
    else if (/\.(ts|tsx|mjs)$/.test(item.name) && !/\.test\.|__tests__/.test(item.name)) yield full;
  }
}

const failures = [];
for (const dir of SCAN_DIRS) {
  const absolute = path.join(ROOT, dir);
  if (!fs.existsSync(absolute)) continue;
  for (const file of walk(absolute)) {
    const rel = path.relative(ROOT, file).replace(/\\/g, "/");
    if (ALLOWLIST.includes(rel)) continue;
    const text = fs.readFileSync(file, "utf8");
    for (const { pattern, reason } of OFFENSES) {
      if (pattern.test(text)) failures.push(`${rel} — ${reason}`);
    }
  }
}

if (failures.length > 0) {
  console.error("prompt 卫生检查失败：");
  for (const failure of failures) console.error(`  ✗ ${failure}`);
  process.exit(1);
}
console.log("prompt 卫生检查通过（无 localhost 自调用 / localStorage 读取）。");
