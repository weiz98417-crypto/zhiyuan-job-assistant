import { build } from "esbuild";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const entry = path.join(projectRoot, "src/lib/agent/runtime/legacy-run-migration-cli.ts");
const output = path.join(projectRoot, "build/legacy-run-migration.mjs");

await build({
  entryPoints: [entry], outfile: output, bundle: true, platform: "node", format: "esm", target: "node20", packages: "external",
  banner: { js: 'import { createRequire as __legacyMaintenanceRequire } from "node:module"; const require = __legacyMaintenanceRequire(import.meta.url);' },
  tsconfig: path.join(projectRoot, "tsconfig.json"), logLevel: "silent",
});

const child = spawn(process.execPath, [output, ...process.argv.slice(2)], { cwd: projectRoot, stdio: "inherit" });
child.on("error", (error) => { process.stderr.write(error.message + "\n"); process.exitCode = 1; });
child.on("exit", (code) => { process.exitCode = code ?? 1; });
