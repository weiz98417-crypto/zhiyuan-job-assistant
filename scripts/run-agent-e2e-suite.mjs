import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const testDir = path.join(root, "src", "__tests__");
const files = fs.readdirSync(testDir)
  .filter((name) => name.endsWith(".test.ts"))
  .sort()
  .map((name) => path.join("src", "__tests__", name));

if (files.length === 0) throw new Error("No Agent E2E tests found");
console.log(`Running Agent E2E suite: ${files.length} test files`);
const command = process.execPath;
const result = spawnSync(command, [path.join(root, "node_modules", "vitest", "vitest.mjs"), "run", ...files], {
  cwd: root,
  stdio: "inherit",
  env: process.env,
});
if (result.error) console.error(`Failed to start Vitest: ${result.error.message}`);
if (result.signal) console.error(`Vitest exited by signal: ${result.signal}`);
process.exit(result.status ?? 1);
