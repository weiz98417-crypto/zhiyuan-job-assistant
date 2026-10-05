#!/usr/bin/env node
/**
 * Spec 25：英文镜像生成器。
 *
 * 中文（modes/zh/*.md）是唯一事实源；英文镜像文件在 modes/ 顶层。
 * 中英文件名不对称（如 zh/jianzhi.md ↔ oferta.md），映射表见 FILE_MAP。
 *
 * 用法：
 *   node scripts/gen-en-modes.mjs                # 以当前英文文件内容登记基线 manifest
 *   node scripts/gen-en-modes.mjs --translate    # 中文变更后，调 DeepSeek 重新生成英文镜像并更新 manifest
 *
 * 生成后必须人工过目 diff 再提交。scripts/check-knowledge-drift.mjs 会校验
 * 英文文件与 manifest 的 sha256 一致——直接手改英文镜像会被 CI 拦下。
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const ROOT = path.join(process.cwd());
const ZH_DIR = path.join(ROOT, "modes", "zh");
const EN_DIR = path.join(ROOT, "modes");
const MANIFEST_PATH = path.join(ROOT, "scripts", ".gen-en-modes.manifest.json");

/** zh 文件名 → en 文件名。无对应关系的 zh 文件（dingwei/jianzhi-risk/risk-intel/_profile）不生成英文。 */
const FILE_MAP = {
  "_shared.md": "_shared.md",
  "apply.md": "apply.md",
  "auto-pipeline.md": "auto-pipeline.md",
  "deep.md": "deep.md",
  "followup.md": "followup.md",
  "interview-prep.md": "interview-prep.md",
  "jianzhi.md": "oferta.md",
  "ofertas.md": "ofertas.md",
  "pdf.md": "pdf.md",
  "pipeline.md": "pipeline.md",
  "scan.md": "scan.md",
  "tracker.md": "tracker.md",
};

/** 英文独有存量文件：登记为 legacy，只记录基线、不翻译、不受 drift 约束。 */
const LEGACY_EN_ONLY = ["batch.md", "patterns.md", "project.md", "training.md"];

const DEEPSEEK_URL = "https://api.deepseek.com/chat/completions";

// 与 check-knowledge-drift.mjs 同规则:哈希前去 BOM + CRLF→LF,登记跨平台稳定的基线。
function sha256(text) {
  return crypto.createHash("sha256")
    .update(text.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n"), "utf8")
    .digest("hex");
}

function readManifest() {
  if (fs.existsSync(MANIFEST_PATH)) return JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
  return { generatedAt: null, files: {}, legacy: {} };
}

function writeManifest(manifest) {
  manifest.generatedAt = new Date().toISOString();
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + "\n");
}

async function translate(zhText, enFileName) {
  const apiKey = process.env.DEEPSEEK_API_KEY?.trim();
  if (!apiKey) throw new Error("未配置 DEEPSEEK_API_KEY，无法 --translate");
  const response = await fetch(DEEPSEEK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: "deepseek-flash",
      temperature: 0.2,
      max_tokens: 12000,
      messages: [
        {
          role: "system",
          content:
            "You are a professional localizer for an AI job-search assistant's prompt library. Translate the Chinese prompt document into English, preserving ALL markdown structure, YAML/JSON snippets, field names, weights, and scoring rules exactly. Keep product-specific proper nouns (纸鸢, Zhiyuan, P5/P6 levels) as-is or transliterated naturally. Output only the translated document.",
        },
        { role: "user", content: `Target file: ${enFileName}\n\n${zhText}` },
      ],
    }),
  });
  if (!response.ok) throw new Error(`DeepSeek 翻译失败 (${response.status})`);
  const payload = await response.json();
  const content = payload.choices?.[0]?.message?.content;
  if (!content) throw new Error("DeepSeek 翻译返回为空");
  return content;
}

async function main() {
  const doTranslate = process.argv.includes("--translate");
  const manifest = readManifest();
  let changed = 0;

  for (const [zhName, enName] of Object.entries(FILE_MAP)) {
    const zhPath = path.join(ZH_DIR, zhName);
    const enPath = path.join(EN_DIR, enName);
    if (!fs.existsSync(zhPath)) {
      console.warn(`[skip] 中文源缺失: ${zhName}`);
      continue;
    }
    const zhText = fs.readFileSync(zhPath, "utf8");
    const zhHash = sha256(zhText);
    const recorded = manifest.files[enName];
    if (!doTranslate) {
      // 基线模式：以当前英文文件（或空）登记
      const enText = fs.existsSync(enPath) ? fs.readFileSync(enPath, "utf8") : "";
      manifest.files[enName] = { zhSource: `modes/zh/${zhName}`, zhHash, enHash: sha256(enText) };
      changed += 1;
      continue;
    }
    if (recorded && recorded.zhHash === zhHash && fs.existsSync(enPath)) {
      console.log(`[up-to-date] ${enName}`);
      continue;
    }
    const translated = await translate(zhText, enName);
    fs.writeFileSync(enPath, translated);
    manifest.files[enName] = { zhSource: `modes/zh/${zhName}`, zhHash, enHash: sha256(translated) };
    changed += 1;
    console.log(`[translated] modes/zh/${zhName} → modes/${enName}`);
  }

  for (const legacy of LEGACY_EN_ONLY) {
    const enPath = path.join(EN_DIR, legacy);
    if (fs.existsSync(enPath)) {
      manifest.legacy[legacy] = { enHash: sha256(fs.readFileSync(enPath, "utf8")), note: "legacy_en_only" };
    }
  }

  writeManifest(manifest);
  console.log(`\n完成：${changed} 个文件登记${doTranslate ? "并翻译" : "基线"}。manifest → scripts/.gen-en-modes.manifest.json`);
  if (doTranslate) console.log("请人工过目英文 diff 后再提交。");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
