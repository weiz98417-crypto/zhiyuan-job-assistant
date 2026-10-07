#!/usr/bin/env node
/** Spec 26 全量校准：RUN_RUBRIC_CALIBRATION=1 + DEEPSEEK_API_KEY 下跑 30 样例 ×2 遍（约 10-20 分钟）。
 *  Windows cmd 不支持 env 前缀 script（仓库环境坑），用 node 显式设环境变量。 */
import { spawnSync } from "node:child_process";

process.env.RUN_RUBRIC_CALIBRATION = "1";
const result = spawnSync("npx", ["vitest", "run", "src/__tests__/interview-rubric-calibration.eval.test.ts"], {
  stdio: "inherit",
  env: process.env,
  shell: process.platform === "win32",
});
process.exit(result.status ?? 1);
