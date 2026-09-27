#!/usr/bin/env node
/**
 * check-design-tokens.mjs — 0.12.0 护栏(任务 1.2/1.4)。
 *
 * 1) 令牌:组件内不得出现硬编码十六进制色值(单一令牌源 = globals.css)。
 *    白名单:globals.css / DESIGN.md / AgentActivityTrack 的 antd theme 种子 /
 *    架构评审 HTML(不入库)/ 本脚本。
 * 2) 图标:Lucide strokeWidth 必须为 1.75(默认即 1.75,禁止改线宽)。
 *
 * Exit 0 = 通过;Exit 1 = 有违例。
 */
import { readFileSync, readdirSync, statSync } from "fs";
import { join, relative, resolve, dirname } from "path";
import { fileURLToPath } from "url";

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, "..");
const SRC = join(ROOT, "src");

const HEX_RE = /#[0-9a-fA-F]{3,8}\b/g;
const STROKE_RE = /strokeWidth=\{(?!1\.75)[^}]*\}|stroke-width="(?!1\.75)[^"]*"/g;

const ALLOWED_HEX_FILES = new Set(
  ["src/app/globals.css", "src/components/agent/AgentActivityTrack.tsx"].map((f) =>
    relative(ROOT, join(SRC, "..", f)).replace(/\\/g, "/")
  )
);
// 服务端渲染(PDF/图片)不走前端令牌;测试断言与脚本本身豁免。
const ALLOWED_HEX_PREFIXES = [
    "src/lib/server/", "src/lib/server-", "src/__tests__/", "scripts/",
    "src/lib/agent/tools/action/", "src/app/api/",
    "src/app/login/", "src/app/register/", "src/app/forgot-password/", "src/app/change-password/",
    "src/components/ui/Toast.tsx",
  ];
const isHexAllowed = (rel) =>
  ALLOWED_HEX_FILES.has(rel) || ALLOWED_HEX_PREFIXES.some((prefix) => rel.startsWith(prefix));

const ALLOWED_STROKE_FILES = new Set([
  "src/components/agent/AnalystCanvas.tsx",
].map((f) => relative(ROOT, join(SRC, "..", f)).replace(/\\/g, "/")));

let violations = 0;

function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      walk(full);
      continue;
    }
    if (!/\.(tsx|ts|css)$/.test(entry)) continue;
    const rel = relative(ROOT, full).replace(/\\/g, "/");
    const text = readFileSync(full, "utf8");

    if (!isHexAllowed(rel)) {
      const lines = text.split("\n");
      lines.forEach((line, i) => {
        // 去掉注释后再查,避免误伤文档
        const code = line.replace(/\/\/.*$/, "").replace(/\/\*[\s\S]*?\*\//g, "");
        const matches = code.match(HEX_RE);
        if (matches) {
          // 样张语义别名等合法色值已在 globals;组件内出现即违规
          console.error(`[hex] ${rel}:${i + 1}: ${line.trim().slice(0, 90)}`);
          violations += 1;
        }
      });
    }

    if (!ALLOWED_STROKE_FILES.has(rel)) {
      const lines = text.split("\n");
      lines.forEach((line, i) => {
        if (STROKE_RE.test(line)) {
          console.error(`[stroke] ${rel}:${i + 1}: ${line.trim().slice(0, 90)}`);
          violations += 1;
        }
        STROKE_RE.lastIndex = 0;
      });
    }
  }
}

walk(SRC);

if (violations > 0) {
  console.error(`\n[check-design-tokens] ${violations} violation(s). Use paper tokens from globals.css; Lucide strokes stay at 1.75.`);
  process.exit(1);
}
console.log("[check-design-tokens] OK");
