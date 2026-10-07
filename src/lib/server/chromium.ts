/**
 * Playwright chromium 可执行文件定位(spec 37 收口:此前 api/generate-cv-pdf 与
 * report-pdf-service 各持一份拷贝)。bundled 优先,回落 ms-playwright 目录扫描;
 * 拆成两个具名函数代替布尔旗标:Required 抛错(route 语义),Optional 返回 undefined
 * (优雅降级语义)。
 */
import { chromium } from "playwright";
import fs from "fs";
import os from "os";
import path from "path";

/** ms-playwright 缓存目录按平台取默认位置(此前误用 Windows 专属 AppData 路径,非 Windows 恒失配)。 */
function playwrightCacheDir(): string | null {
  const home = os.homedir();
  if (os.platform() === "win32") return path.join(home, "AppData", "Local", "ms-playwright");
  if (os.platform() === "darwin") return path.join(home, "Library", "Caches", "ms-playwright");
  return path.join(home, ".cache", "ms-playwright");
}

function scanChromiumExecutable(): string | undefined {
  const bundled = chromium.executablePath();
  if (bundled && fs.existsSync(bundled)) return bundled;

  const dir = playwrightCacheDir();
  if (!dir || !fs.existsSync(dir)) return undefined;

  const platform = os.platform();
  const exeName = platform === "win32" ? "chrome.exe" : "chrome";
  const subdir =
    platform === "win32" ? "chrome-win64" :
    platform === "darwin" ? "chrome-mac" : "chrome-linux64";

  const entry = fs.readdirSync(dir)
    .find((name) => name.startsWith("chromium-") && !name.includes("headless_shell"));
  if (!entry) return undefined;

  const exe = path.join(dir, entry, subdir, exeName);
  return fs.existsSync(exe) ? exe : undefined;
}

export function findChromiumRequired(): string {
  const exe = scanChromiumExecutable();
  if (!exe) throw new Error("Chromium not found. Run: npx playwright install chromium");
  return exe;
}

export function findChromiumOptional(): string | undefined {
  return scanChromiumExecutable();
}
