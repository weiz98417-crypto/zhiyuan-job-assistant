#!/usr/bin/env node
/**
 * Spec 25 护栏：知识 drift 检测。
 * 1) modes 顶层英文镜像与 scripts/.gen-en-modes.manifest.json 的 sha256 一致；
 *    manifest 里登记的 zhHash 与当前中文源一致（中文改了必须重跑 gen:en-modes）。
 * 2) 知识注册表（src/lib/agent/knowledge/registry/manifest.json）每个条目的文件存在，
 *    prompt 条目 frontmatter 含 id 与 version。
 * 任一失败即 exit 1。首次使用先跑 `npm run gen:en-modes` 登记基线。
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const ROOT = process.cwd();
const MANIFEST_PATH = path.join(ROOT, "scripts", ".gen-en-modes.manifest.json");
const REGISTRY_PATH = path.join(ROOT, "src", "lib", "agent", "knowledge", "registry", "manifest.json");

function sha256(text) {
  return crypto.createHash("sha256").update(text, "utf8").digest("hex");
}

const failures = [];

// ── 1. 英文镜像 drift ──
if (!fs.existsSync(MANIFEST_PATH)) {
  failures.push("缺少 scripts/.gen-en-modes.manifest.json —— 先运行 `npm run gen:en-modes` 登记基线");
} else {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
  for (const [enName, record] of Object.entries(manifest.files || {})) {
    const enPath = path.join(ROOT, "modes", enName);
    const zhPath = path.join(ROOT, record.zhSource);
    if (!fs.existsSync(enPath)) {
      failures.push(`英文镜像缺失: modes/${enName}`);
      continue;
    }
    const enHash = sha256(fs.readFileSync(enPath, "utf8"));
    if (enHash !== record.enHash) {
      failures.push(`英文镜像被手改（须走 gen:en-modes 生成）: modes/${enName}`);
    }
    if (fs.existsSync(zhPath) && sha256(fs.readFileSync(zhPath, "utf8")) !== record.zhHash) {
      failures.push(`中文源已变更、英文镜像未重生成: ${record.zhSource} → npm run gen:en-modes:translate`);
    }
  }
}

// ── 2. 注册表完整性 ──
const registry = JSON.parse(fs.readFileSync(REGISTRY_PATH, "utf8"));
for (const entry of registry.entries || []) {
  const absolute = path.join(ROOT, entry.path);
  if (!fs.existsSync(absolute)) {
    failures.push(`注册表条目文件缺失: ${entry.id} → ${entry.path}`);
    continue;
  }
  if (entry.kind === "prompt") {
    const raw = fs.readFileSync(absolute, "utf8").replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
    const frontmatter = raw.match(/^---\n([\s\S]*?)\n---/)?.[1] || "";
    if (!/^id:\s*\S+/m.test(frontmatter)) failures.push(`frontmatter 缺 id: ${entry.path}`);
    if (!/^version:\s*\S+/m.test(frontmatter)) failures.push(`frontmatter 缺 version: ${entry.path}`);
  }
}

if (failures.length > 0) {
  console.error("知识 drift 检查失败：");
  for (const failure of failures) console.error(`  ✗ ${failure}`);
  process.exit(1);
}
console.log(`知识 drift 检查通过（${(registry.entries || []).length} 条注册条目，${Object.keys((JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"))?.files) || {}).length} 个英文镜像）。`);
