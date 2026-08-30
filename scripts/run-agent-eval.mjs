import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const modeArgument = process.argv.find((argument) => argument.startsWith("--mode="));
const mode = modeArgument?.slice("--mode=".length) || "staging";
if (!["staging", "release"].includes(mode)) {
  console.error(`Unsupported Agent Eval mode: ${mode}`);
  process.exit(2);
}

const required = ["AGENT_EVAL_MODEL_VERSION", "AGENT_EVAL_PROMPT_VERSION", "AGENT_EVAL_TOOL_VERSION", "AGENT_EVAL_FIXTURE_VERSION"];
const missing = required.filter((name) => !(process.env[name] || "").trim());
if (missing.length > 0) {
  console.error(`Agent ${mode} Eval is intentionally blocked until fixed benchmark metadata is provided: ${missing.join(", ")}`);
  console.error("Set fixed model, prompt, tool and fixture versions; do not run this against mutable production defaults.");
  process.exit(2);
}

console.log(JSON.stringify({
  mode,
  modelVersion: process.env.AGENT_EVAL_MODEL_VERSION,
  promptVersion: process.env.AGENT_EVAL_PROMPT_VERSION,
  toolVersion: process.env.AGENT_EVAL_TOOL_VERSION,
  fixtureVersion: process.env.AGENT_EVAL_FIXTURE_VERSION,
  judgeVersion: process.env.AGENT_EVAL_JUDGE_VERSION || "rubric-v1",
}, null, 2));

const vitestEntrypoint = fileURLToPath(new URL("../node_modules/vitest/vitest.mjs", import.meta.url));
const result = spawnSync(process.execPath, [vitestEntrypoint, "run", "src/__tests__/agent-journey-eval.test.ts", "src/__tests__/agent-staging-judge.test.ts"], {
  stdio: "inherit",
  env: { ...process.env, AGENT_EVAL_MODE: mode },
});
process.exit(result.status ?? 1);
