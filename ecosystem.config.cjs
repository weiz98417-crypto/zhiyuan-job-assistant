const path = require("path");

const releaseDirectory = __dirname;
const releaseParent = path.dirname(releaseDirectory);
const appRoot = path.basename(releaseParent) === "releases"
  ? path.dirname(releaseParent)
  : releaseParent;
const artifactDirectory = process.env.AGENT_ARTIFACT_DIR
  || path.join(appRoot, "shared", "agent-artifacts");

module.exports = {
  apps: [
    {
      name: "zhiyuan-web",
      cwd: releaseDirectory,
      script: path.join(releaseDirectory, "node_modules", "next", "dist", "bin", "next"),
      args: "start -H 127.0.0.1 -p 3000",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      max_memory_restart: "1G",
      env: {
        NODE_ENV: "production",
        AGENT_ARTIFACT_DIR: artifactDirectory,
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
        AGENT_ARTIFACT_DIR: artifactDirectory,
        AGENT_WORKER_CONCURRENCY: "2",
      },
    },
  ],
};
