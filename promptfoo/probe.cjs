#!/usr/bin/env node
/** promptfoo exec provider 探针：stdin JSON → 调用打包后的红队助手 → stdout JSON。 */
const { execFileSync } = require("node:child_process");
const path = require("node:path");

let input = "";
process.stdin.on("data", (chunk) => (input += chunk));
process.stdin.on("end", () => {
  // promptfoo exec provider 传入的是渲染后的 prompt 文本；这里包装成 {fn, content}
  const request = JSON.parse(process.env.REDTEAM_REQUEST || "{}");
  const result = execFileSync(process.execPath, [
    path.join(__dirname, ".build", "redteam-helpers.cjs"),
    JSON.stringify({ ...request, content: input, cvText: input }),
  ], { encoding: "utf8" });
  process.stdout.write(result);
});
