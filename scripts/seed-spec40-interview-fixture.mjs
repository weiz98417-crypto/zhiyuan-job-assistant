import fs from "node:fs";
import path from "node:path";
import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import pg from "pg";
import { build } from "esbuild";

const connectionString = process.env.SPEC40_INTERVIEW_EXTERNAL_DATABASE_URL;
if (!connectionString) throw new Error("SPEC40_INTERVIEW_EXTERNAL_DATABASE_URL is required");
const target = new URL(connectionString);
if (target.hostname !== "127.0.0.1" || target.port !== "55440" || target.pathname !== "/spec40_interview_external") {
  throw new Error("External interview fixtures require the dedicated local database");
}
const privateDirectory = path.resolve(".private/spec40/interview");
const appDirectory = path.join(privateDirectory, "app");
fs.mkdirSync(appDirectory, { recursive: true });
for (const name of ["src", "public", "lib", "modes", "skills"]) {
  fs.cpSync(path.resolve(name), path.join(appDirectory, name), {
    recursive: true,
    filter: (source) => !source.includes(path.sep + "__tests__"),
  });
}
for (const name of ["package.json", "tsconfig.json", "next-env.d.ts", "AGENTS.md"]) {
  if (fs.existsSync(name)) fs.copyFileSync(name, path.join(appDirectory, name));
}
if (!fs.existsSync(path.join(appDirectory, "node_modules"))) {
  fs.symlinkSync(path.resolve("node_modules"), path.join(appDirectory, "node_modules"), "junction");
}
fs.writeFileSync(path.join(appDirectory, "next.config.mjs"), "export default { images: { remotePatterns: [] }, serverExternalPackages: ['@napi-rs/canvas'], allowedDevOrigins: ['localhost', '127.0.0.1'] };\n");
await build({
  entryPoints: ["src/worker/agent-worker.ts"], outfile: path.join(privateDirectory, "worker.mjs"),
  bundle: true, platform: "node", format: "esm", target: "node20", packages: "external",
  banner: { js: 'import { createRequire as fixtureCreateRequire } from "node:module"; const require = fixtureCreateRequire(import.meta.url);' },
  tsconfig: "tsconfig.json", sourcemap: true, logLevel: "silent",
});
const client = new pg.Client({ connectionString });
await client.connect();
try {
  const identity = await client.query("SELECT current_database() AS name");
  if (identity.rows[0].name !== "spec40_interview_external") throw new Error("Fixture database identity mismatch");
  await client.query("CREATE EXTENSION IF NOT EXISTS vector");
  await client.query(fs.readFileSync("src/lib/postgres-schema.sql", "utf8"));
  const password = randomBytes(24).toString("base64url");
  const passwordHash = await bcrypt.hash(password, 10);
  const fixtureIdentity = randomBytes(8).toString("hex");
  const users = {
    owner: { id: "spec40-interview-owner-" + fixtureIdentity, username: "spec40InterviewOwner" + fixtureIdentity, password },
    foreign: { id: "spec40-interview-foreign-" + fixtureIdentity, username: "spec40InterviewForeign" + fixtureIdentity, password },
  };
  for (const user of Object.values(users)) {
    await client.query(`INSERT INTO users (id, username, password_hash, display_name, role, status)
      VALUES ($1, $2, $3, 'Synthetic interview fixture', 'member', 'active')
      ON CONFLICT (id) DO UPDATE SET password_hash = EXCLUDED.password_hash, status = 'active', token_version = 0`,
    [user.id, user.username, passwordHash]);
  }
  fs.writeFileSync(path.join(privateDirectory, "fixture.json"), JSON.stringify({
    connectionString, jwtSecret: randomBytes(48).toString("base64url"), users,
    sourceVersion: "spec40-interview-external-v1", appDirectory,
    workerHash: createHash("sha256").update(fs.readFileSync(path.join(privateDirectory, "worker.mjs"))).digest("hex"),
  }), { mode: 0o600 });
  console.log("External interview fixture and private app staged; credentials retained privately");
} finally { await client.end(); }
