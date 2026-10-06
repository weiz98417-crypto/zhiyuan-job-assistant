/**
 * Playwright chromium 可执行文件定位(spec 37 收口:此前 api/generate-cv-pdf 与
 * report-pdf-service 各持一份拷贝)。bundled 优先,回落 ms-playwright 目录扫描;
 * required=true 抛错(route 语义),false 返回 undefined(优雅降级语义)。
 */
import { chromium } from "playwright";
import fs from "fs";
import os from "os";
import path from "path";

export function findChromiumExecutable(required: boolean): string | undefined {
  const bundled = chromium.executablePath();
  if (bundled && fs.existsSync(bundled)) return bundled;

  const platform = os.platform();
  const exeName = platform === "win32" ? "chrome.exe" : "chrome";
  const subdir =
    platform === "win32" ? "chrome-win64" :
    platform === "darwin" ? "chrome-mac" : "chrome-linux64";

  const playwrightDir = path.join(os.homedir(), "AppData", "Local", "ms-playwright");
  if (!fs.existsSync(playwrightDir)) {
    if (required) throw new Error("Playwright browsers not installed. Run: npx playwright install chromium");
    return undefined;
  }

  const dir = fs.readdirSync(playwrightDir)
    .find((entry) => entry.startsWith("chromium-") && !entry.includes("headless_shell"));

  if (!dir) {
    if (required) throw new Error("Chromium browser not found in Playwright directory. Run: npx playwright install chromium");
    return undefined;
  }

  const exe = path.join(playwrightDir, dir, subdir, exeName);
  if (!fs.existsSync(exe)) {
    if (required) throw new Error(`Chromium executable not found at ${exe}`);
    return undefined;
  }

  return exe;
}
