import { build } from "esbuild";

await build({
  entryPoints: ["src/worker/agent-worker.ts"],
  outfile: "build/agent-worker.mjs",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  packages: "external",
  banner: {
    js: 'import { createRequire as __agentWorkerCreateRequire } from "node:module"; const require = __agentWorkerCreateRequire(import.meta.url);',
  },
  sourcemap: true,
  tsconfig: "tsconfig.json",
  logLevel: "info",
});
