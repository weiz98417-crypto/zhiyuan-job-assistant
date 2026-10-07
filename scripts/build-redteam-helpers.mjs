#!/usr/bin/env node
/**
 * Spec 24：把被红队的确定性模块（写入守门 + 数字溯源 + ATS 规则）打包成 CJS，
 * 供 promptfoo 探针调用。vitest 已带 esbuild，用其 JS API 避开 Windows .cmd 调用问题。
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const root = process.cwd();
const require = createRequire(import.meta.url);
const esbuild = require("esbuild");

const outDir = path.join(root, "promptfoo", ".build");
fs.mkdirSync(outDir, { recursive: true });

await esbuild.build({
  entryPoints: [path.join(root, "promptfoo", "redteam-entry.ts")],
  bundle: true,
  platform: "node",
  format: "cjs",
  outfile: path.join(outDir, "redteam-helpers.cjs"),
  external: ["js-yaml"],
  logLevel: "silent",
});

console.log("redteam helpers 打包完成 → promptfoo/.build/redteam-helpers.cjs");
