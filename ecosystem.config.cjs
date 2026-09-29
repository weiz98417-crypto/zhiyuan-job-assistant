const path = require("path");

const releaseDirectory = __dirname;
const releaseParent = path.dirname(releaseDirectory);
const releaseMode = path.basename(releaseParent) === "releases";
const appRoot = releaseMode
  ? path.dirname(releaseParent)
  : releaseParent;
if (releaseMode) {
  for (const name of ["DB_DRIVER", "DATABASE_URL", "DEEPSEEK_API_KEY", "AGENT_RUNTIME_MODE"]) {
    delete process.env[name];
  }
}
const sharedEnvironment = require("dotenv").config({ path: path.join(appRoot, "shared", "secrets", "production.env"), override: true });
if (releaseMode && ["DB_DRIVER", "DATABASE_URL", "DEEPSEEK_API_KEY", "AGENT_RUNTIME_MODE"].some(
  (name) => !String(sharedEnvironment.parsed?.[name] || "").trim(),
)) {
  throw new Error("missing required shared production environment");
}
require("dotenv").config({ path: path.join(releaseDirectory, ".env.local") });
require("dotenv").config();
const artifactDirectory = releaseMode
  ? path.join(appRoot, "shared", "agent-artifacts")
  : process.env.AGENT_ARTIFACT_DIR || path.join(appRoot, "shared", "agent-artifacts");

module.exports = {
  apps: [
    {
      name: "zhiyuan-web",
      cwd: releaseDirectory,
      script: path.join(releaseDirectory, "node_modules", "next", "dist", "bin", "next"),
      args: "start -H 127.0.0.1 -p 3100",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      max_memory_restart: "1G",
      env: {
        NODE_ENV: "production",
        DB_DRIVER: process.env.DB_DRIVER || "postgres",
        DATABASE_URL: process.env.DATABASE_URL,
        AGENT_RUNTIME_MODE: process.env.AGENT_RUNTIME_MODE || "worker_all",
        AGENT_ARTIFACT_DIR: artifactDirectory,
        DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY,
        DEEPSEEK_MODEL: "deepseek-flash",
      },
    },
    {
      name: "zhiyuan-agent-worker",
      cwd: releaseDirectory,
      script: path.join(releaseDirectory, "build", "agent-worker.mjs"),
      node_args: "--enable-source-maps",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      wait_ready: true,
      listen_timeout: 15000,
      kill_timeout: 75000,
      min_uptime: 30000,
      max_restarts: 5,
      restart_delay: 5000,
      max_memory_restart: "1G",
      env: {
        NODE_ENV: "production",
        DB_DRIVER: "postgres",
        DATABASE_URL: process.env.DATABASE_URL,
        AGENT_RUNTIME_MODE: process.env.AGENT_RUNTIME_MODE || "worker_all",
        AGENT_ARTIFACT_DIR: artifactDirectory,
        AGENT_WORKER_CONCURRENCY: "2",
        DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY,
        DEEPSEEK_MODEL: "deepseek-flash",
      },
    },
  ],
};
