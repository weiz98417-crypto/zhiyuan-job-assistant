#!/usr/bin/env node
/**
 * 简历视觉反测门禁(spec 38):渲染(cv-pdf-html)→ Playwright 截图 → DeepSeek 视觉
 * 四维批评(排版层级/密度/对齐/颜色,0-10 分)→ 阈值门禁 + 基线冻结。
 *
 * - 评审 prompt 是注册表资产:src/lib/agent/knowledge/registry/prompts/resume-visual-review.md
 * - 基线:scripts/.visual-review-baseline.json(内容哈希归一化后 sha256,沿用 knowledge-drift 教训)
 * - 退出码:0 通过;1 观感门禁红(真实问题);2 基建失败(网络/服务/解析,不应掩盖观感问题)
 * - 只在本地/手动触发,不进 capability-evals(视觉分数有概率性,先攒校准数据)
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { createRequire } from "node:module";
import { chromium } from "playwright";
import { SAMPLE_RESUMES } from "./visual-review-fixtures.mjs";
import { REQUIRED_DIMS, THRESHOLD, REGRESSION_DROP, validateCritique, evaluateGates, normalizeHash } from "./visual-review-core.mjs";

const require = createRequire(import.meta.url);
const esbuild = require("esbuild");

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, "screenshots", "visual-review");
const BASELINE_PATH = path.join(ROOT, "scripts", ".visual-review-baseline.json");
const PROMPT_PATH = path.join(ROOT, "src", "lib", "agent", "knowledge", "registry", "prompts", "resume-visual-review.md");
const BUNDLE_PATH = path.join(ROOT, "scripts", ".visual-build", "renderer.cjs");

/* ── .env 宽松加载(缺 key 时给清晰报错,不炸 CI) ── */
if (!process.env.DEEPSEEK_API_KEY) {
  const envPath = path.join(ROOT, ".env");
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
      const match = line.match(/^([A-Z_]+)=(.*)$/);
      if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
    }
  }
}
if (!process.env.DEEPSEEK_API_KEY) {
  console.error("缺少 DEEPSEEK_API_KEY(本地 .env 或环境变量)。视觉评审不可用。");
  process.exit(2);
}

/* ── 渲染器打包:cv-pdf-html.ts + llm-json.ts → CJS(esbuild,与红队管道同法) ── */
fs.mkdirSync(path.dirname(BUNDLE_PATH), { recursive: true });
await esbuild.build({
  stdin: {
    contents: `
      export { buildCvHtml } from "${path.join(ROOT, "src/lib/server/cv-pdf-html.ts").replace(/\\/g, "/")}";
      export { parseLlmJsonObject } from "${path.join(ROOT, "src/lib/llm-json.ts").replace(/\\/g, "/")}";
    `,
    resolveDir: ROOT,
    sourcefile: "visual-entry.ts",
  },
  bundle: true,
  platform: "node",
  format: "cjs",
  outfile: BUNDLE_PATH,
  logLevel: "silent",
});
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { buildCvHtml, parseLlmJsonObject } = require(BUNDLE_PATH);


function loadBaseline() {
  try { return JSON.parse(fs.readFileSync(BASELINE_PATH, "utf8")); } catch { return {}; }
}
function saveBaseline(baseline) {
  fs.writeFileSync(BASELINE_PATH, JSON.stringify(baseline, null, 2) + "\n");
}

/* ── 截图 ── */
async function screenshot(html, outFile) {
  const browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-gpu"] });
  try {
    const page = await browser.newPage({ viewport: { width: 794, height: 1123 } }); // A4 @96dpi
    await page.setContent(html, { waitUntil: "load", timeout: 30_000 });
    await Promise.race([page.evaluate(() => document.fonts.ready), new Promise((r) => setTimeout(r, 5_000))]);
    await page.screenshot({ path: outFile, fullPage: true, type: "png" });
  } finally {
    await browser.close();
  }
}

/* ── DeepSeek 视觉评审(重试一次;基建失败抛错由上层转 exit 2) ── */
async function judgeScreenshot(pngPath, prompt, signal) {
  const imageBase64 = fs.readFileSync(pngPath).toString("base64");
  const call = async () => {
    const response = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}` },
      body: JSON.stringify({
        model: process.env.DEEPSEEK_VISION_MODEL || "deepseek-flash",
        messages: [{
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: `data:image/png;base64,${imageBase64}` } },
          ],
        }],
        temperature: 0,
        max_tokens: 4000,
        thinking: { type: "disabled" },
        response_format: { type: "json_object" },
      }),
      signal,
    });
    if (!response.ok) throw new Error(`DeepSeek API ${response.status}: ${(await response.text()).slice(0, 200)}`);
    const payload = await response.json();
    const message = payload.choices?.[0]?.message || {};
    if (!message.content) {
      console.error(`[visual-review][debug] 空响应: finish_reason=${payload.choices?.[0]?.finish_reason} usage=${JSON.stringify(payload.usage || {})} message-keys=${Object.keys(message).join(",")}`);
    }
    return String(message.content || "");
  };
  // 失败重试一次(spec 38):解析失败与网络/HTTP 错误都重试,两次仍败才抛(基建类 exit 2)
  let lastError = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const text = await call();
      const parsed = parseLlmJsonObject(text);
      if (validateCritique(parsed)) return parsed;
      lastError = new Error(`视觉评审输出不可解析: ${text.slice(0, 200)}`);
      try { fs.writeFileSync(path.join(OUT_DIR, "last-unparsed.txt"), text); } catch { /* 诊断辅助 */ }
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

/* ── 主流程 ── */
const prompt = fs.readFileSync(PROMPT_PATH, "utf8").replace(/^---[\s\S]*?---\n/, "");
fs.mkdirSync(OUT_DIR, { recursive: true });
const baseline = loadBaseline();
const nextBaseline = { ...(baseline.samples || {}) };
const failures = [];
const infraFailure = (error) => {
  console.error(`[visual-review] 基建失败(exit 2): ${error instanceof Error ? error.message : error}`);
  process.exit(2);
};

try {
  for (const sample of SAMPLE_RESUMES) {
    const html = buildCvHtml({ sections: sample.sections, template: sample.template, profile: sample.profile });
    const htmlHash = normalizeHash(html);
    const pngPath = path.join(OUT_DIR, `${sample.name}.png`);
    process.stdout.write(`[visual-review] ${sample.name}(${sample.note}) 截图中…\n`);
    await screenshot(html, pngPath);
    const critique = await judgeScreenshot(pngPath, prompt);

    const dims = REQUIRED_DIMS;
    const scores = Object.fromEntries(dims.map((dim) => [dim, critique[dim].score]));
    const { failures: gateFailures, total } = evaluateGates({
      sampleName: sample.name,
      scores,
      baselineEntry: baseline.samples?.[sample.name],
    });
    process.stdout.write(`  得分: ${dims.map((d) => `${d}=${scores[d]}`).join(" / ")}(总 ${total}/40)\n`);
    for (const dim of dims) {
      for (const issue of critique[dim].issues || []) process.stdout.write(`  - [${dim}] ${issue}\n`);
    }
    if (critique.verdict) process.stdout.write(`  总评: ${critique.verdict}\n`);

    failures.push(...gateFailures);
    nextBaseline[sample.name] = { htmlHash, scores, total, judgedAt: new Date().toISOString() };
  }
} catch (error) {
  infraFailure(error);
}

if (failures.length === 0) saveBaseline({ samples: nextBaseline });
else console.error("[visual-review] 门禁红,基线不更新(保留上次通过值,防棘轮下滚)。");

if (failures.length > 0) {
  console.error(`\n[visual-review] 门禁红(${failures.length} 条):`);
  for (const failure of failures) console.error(`  ✗ ${failure}`);
  process.exit(1);
}
console.log(`\n[visual-review] 通过: ${SAMPLE_RESUMES.length} 份样本全部达标(单维 ≥${THRESHOLD.perDimension},总分 ≥${THRESHOLD.total})。基线已更新 → scripts/.visual-review-baseline.json`);
