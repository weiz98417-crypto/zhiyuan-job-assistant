import { spawn } from "node:child_process";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { normalizeExtractedText } from "./pdf-text";
import { DocumentExtractionError, type MinerUInput } from "./types";

const DEFAULT_MINERU_TIMEOUT_MS = 180_000;

export interface MinerUHealth {
  configured: boolean;
  executable?: string;
  configJson?: string;
  modelSource?: string;
  timeoutMs: number;
  missing: string[];
}

export function getMinerUTimeoutMs(): number {
  const raw = process.env.MINERU_EXTRACTION_TIMEOUT_MS;
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_MINERU_TIMEOUT_MS;
}

export function getMinerUHealth(): MinerUHealth {
  const executable = process.env.MINERU_EXECUTABLE?.trim();
  const configJson = process.env.MINERU_TOOLS_CONFIG_JSON?.trim();
  const modelSource = process.env.MINERU_MODEL_SOURCE?.trim() || "local";
  const missing: string[] = [];
  if (!executable) missing.push("MINERU_EXECUTABLE");
  if (!configJson) missing.push("MINERU_TOOLS_CONFIG_JSON");
  return {
    configured: missing.length === 0,
    executable,
    configJson,
    modelSource,
    timeoutMs: getMinerUTimeoutMs(),
    missing,
  };
}

export async function runMinerU(input: MinerUInput): Promise<string> {
  const health = getMinerUHealth();
  if (!health.configured || !health.executable || !health.configJson) {
    throw new DocumentExtractionError({
      code: "mineru_not_configured",
      message: `MinerU is not configured: ${health.missing.join(", ")}`,
      diagnostics: { mineruUsed: true },
    });
  }

  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "zhiyuan-mineru-"));
  const inputPath = path.join(tempRoot, safeFilename(input.filename, input.ext));
  const outputPath = path.join(tempRoot, "output");

  try {
    await writeFile(inputPath, input.buffer);
    await execMinerU({
      executable: health.executable,
      configJson: health.configJson,
      modelSource: health.modelSource || "local",
      inputPath,
      outputPath,
      timeoutMs: health.timeoutMs,
    });
    const outputText = await readMinerUOutputText(outputPath);
    const normalized = normalizeExtractedText(outputText);
    if (!normalized) {
      throw new DocumentExtractionError({
        code: "document_text_empty",
        message: "MinerU output contained no usable text",
        diagnostics: { mineruUsed: true, textLength: 0 },
      });
    }
    return normalized;
  } catch (err) {
    if (err instanceof DocumentExtractionError) throw err;
    if (isTimeoutLike(err)) {
      throw new DocumentExtractionError({
        code: "mineru_timeout",
        message: "MinerU timed out",
        status: 504,
        diagnostics: { mineruUsed: true, timeoutMs: health.timeoutMs },
        cause: err,
      });
    }
    throw new DocumentExtractionError({
      code: "mineru_failed",
      message: err instanceof Error ? err.message : "MinerU failed",
      diagnostics: { mineruUsed: true },
      cause: err,
    });
  } finally {
    await rm(tempRoot, { recursive: true, force: true }).catch(() => undefined);
  }
}

async function execMinerU(args: {
  executable: string;
  configJson: string;
  modelSource: string;
  inputPath: string;
  outputPath: string;
  timeoutMs: number;
}): Promise<void> {
  const childArgs = [
    "-p",
    args.inputPath,
    "-o",
    args.outputPath,
    "-b",
    "pipeline",
    "-m",
    "auto",
  ];

  const env = {
    ...process.env,
    MINERU_MODEL_SOURCE: args.modelSource,
    MINERU_TOOLS_CONFIG_JSON: args.configJson,
  };

  await new Promise<void>((resolve, reject) => {
    const child = spawn(args.executable, childArgs, {
      env,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      const timeout = new Error("MinerU timed out");
      timeout.name = "TimeoutError";
      child.kill("SIGTERM");
      reject(timeout);
    }, args.timeoutMs);

    child.stdout?.on("data", (chunk) => {
      stdout += String(chunk).slice(0, 20_000);
    });
    child.stderr?.on("data", (chunk) => {
      stderr += String(chunk).slice(0, 20_000);
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`MinerU exited with code ${code}: ${(stderr || stdout).slice(0, 1000)}`));
    });
  });
}

async function readMinerUOutputText(outputPath: string): Promise<string> {
  const files = await listFiles(outputPath);
  const markdownFiles = files.filter((file) => /\.(md|markdown)$/i.test(file));
  const textFiles = files.filter((file) => /\.txt$/i.test(file));
  const candidates = [...markdownFiles, ...textFiles];
  const chunks: string[] = [];
  for (const file of candidates) {
    const text = await readFile(file, "utf8").catch(() => "");
    if (text.trim()) chunks.push(text);
  }
  return chunks.join("\n\n");
}

async function listFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
  const files: string[] = [];
  for (const entry of entries) {
    const child = path.join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listFiles(child));
    } else if (entry.isFile()) {
      files.push(child);
    }
  }
  return files;
}

function safeFilename(filename: string, ext: string): string {
  const clean = filename.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_").slice(0, 120);
  if (clean.includes(".")) return clean;
  return `${clean || "resume"}.${ext || "pdf"}`;
}

function isTimeoutLike(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  return err.name === "TimeoutError" || /timed?\s*out|timeout/i.test(err.message);
}
