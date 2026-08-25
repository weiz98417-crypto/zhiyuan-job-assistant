import { build } from "esbuild";

await build({
  entryPoints: ["src/worker/agent-worker.ts"],
  outfile: "build/agent-worker.mjs",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  packages: "external",
  sourcemap: true,
  tsconfig: "tsconfig.json",
  logLevel: "info",
});
