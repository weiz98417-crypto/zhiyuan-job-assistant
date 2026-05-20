/**
 * Server startup — start Turso background push if configured.
 */
import { spawn } from "child_process";
import path from "path";

export async function register() {
  if (!process.env.TURSO_URL || !process.env.TURSO_TOKEN) return;

  // Push to Turso every 60 seconds in background
  const pushScript = path.join(process.cwd(), "scripts", "turso-push.mjs");
  setInterval(() => {
    spawn("node", [pushScript], { stdio: "ignore" });
  }, 60_000);

  console.log("[turso] Background push started (60s interval)");
}
