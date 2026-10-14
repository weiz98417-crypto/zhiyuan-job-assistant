import fs from "node:fs";
import path from "node:path";
import type { E2EConfig } from "e2e";
import { web } from "@e2e-dev/web";

const fixture = JSON.parse(fs.readFileSync(path.resolve(".private/spec40/browser-fixture.json"), "utf8"));
const database = new URL(fixture.connectionString);
if (database.hostname !== "127.0.0.1" || database.port !== "55440" || database.pathname !== "/spec40_isolated") {
  throw new Error("Spec 40 browser fixtures require the dedicated local database");
}

export default {
  tests: "tests/spec40/**/*.e2e.ts",
  workers: 1,
  launchTimeout: 120_000,
  timeout: 120_000,
  output: ".e2e/spec40",
  reporters: ["list", "junit", "markdown"],
  credentials: {
    ownerA: { username: fixture.users.a.username, password: fixture.users.a.password },
    ownerB: { username: fixture.users.b.username, password: fixture.users.b.password },
  },
  secrets: { "fixture-jwt": fixture.jwtSecret },
  targets: [{
    name: "spec40-local-chromium",
    engine: web({ locale: "zh-CN", timezoneId: "Asia/Shanghai" }),
    app: {
      url: "http://127.0.0.1:0",
      readyUrl: "http://127.0.0.1:{port}/login",
      command: {
        executable: process.execPath,
        args: ["node_modules/next/dist/bin/next", "dev", "--hostname", "127.0.0.1", "--port", "{port}"],
        env: {
          DB_DRIVER: "postgres", DATABASE_URL: fixture.connectionString, JWT_SECRET: fixture.jwtSecret,
          DATA_DIR: path.resolve(".private/spec40/browser-data"), ALLOW_SQLITE_LEGACY: "",
          AGENT_RUNTIME_MODE: "worker_all", NEXT_TELEMETRY_DISABLED: "1",
        },
        startupTimeout: 120_000,
        log: ".private/spec40/browser-app.log",
      },
    },
  }],
} satisfies E2EConfig;
