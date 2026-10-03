/**
 * 知识注册表加载器（Spec 25）。
 *
 * 所有提示词与领域数据经 manifest.json 登记；消费方只引用条目 id，
 * 不再内嵌 prompt 字符串或散落硬编码路径。md 条目支持 frontmatter
 * （剥离后注入，正文与迁移前逐字节一致）；yaml 条目原样解析；
 * json 条目为结构化数据。
 */
import fs from "node:fs";
import path from "node:path";
import manifestRaw from "./manifest.json";

export interface RegistryEntry {
  id: string;
  path: string;
  kind: "prompt" | "yaml" | "json" | "modes_dir";
  lang: "zh" | "en" | "both";
  source: string;
  version: string;
  lastReviewed: string;
  consumers: string[];
  legacyEnOnly?: boolean;
}

export const REGISTRY_VERSION = (manifestRaw as { version: string }).version;

export const REGISTRY_MANIFEST: RegistryEntry[] = (manifestRaw as { entries: RegistryEntry[] }).entries;

const entryById = new Map(REGISTRY_MANIFEST.map((entry) => [entry.id, entry]));

export function getRegistryEntry(id: string): RegistryEntry {
  const entry = entryById.get(id);
  if (!entry) throw new Error(`知识注册表中不存在条目: ${id}（已登记 ${REGISTRY_MANIFEST.length} 条）`);
  return entry;
}

const bodyCache = new Map<string, string>();

function repoRoot(): string {
  return process.cwd();
}

function readEntryRaw(entry: RegistryEntry): string {
  const absolute = path.join(repoRoot(), entry.path);
  if (!fs.existsSync(absolute)) {
    throw new Error(`知识注册表条目文件缺失: ${entry.id} → ${entry.path}`);
  }
  return fs.readFileSync(absolute, "utf8");
}

/** 剥离 frontmatter（--- 包裹的 YAML 头）；正文原样返回（去 frontmatter 后前导空行与文件尾空白）。 */
export function stripFrontmatter(raw: string): { body: string; frontmatter: string } {
  const normalized = raw.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
  const match = normalized.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!match) return { body: normalized.trimEnd(), frontmatter: "" };
  return { body: normalized.slice(match[0].length).replace(/^\n+/, "").trimEnd(), frontmatter: match[1] };
}

/** 加载 prompt/document 条目正文（frontmatter 剥离、缓存）。 */
export function loadRegistryText(id: string): string {
  const cached = bodyCache.get(id);
  if (cached !== undefined) return cached;
  const entry = getRegistryEntry(id);
  if (entry.kind === "json") throw new Error(`条目 ${id} 是结构化数据，请直接 import 其文件`);
  const { body } = stripFrontmatter(readEntryRaw(entry));
  bodyCache.set(id, body);
  return body;
}

/** 加载 yaml 条目并解析（服务端专用，读文件系统）。 */
export function loadRegistryYaml<T>(id: string): T {
  const entry = getRegistryEntry(id);
  if (entry.kind !== "yaml") throw new Error(`条目 ${id} 不是 yaml 条目`);
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const yaml = require("js-yaml") as typeof import("js-yaml");
  return yaml.load(readEntryRaw(entry)) as T;
}

/**
 * modes 文档统一读取（Spec 25 全量登记的收口点）。
 * zh 文件在 modes/zh/<name>.md；en 镜像在 modes/ 顶层（文件名映射见 scripts/gen-en-modes.mjs 的 FILE_MAP）。
 * 返回 null = 文件不存在（调用方按各自既有语义处理 404/跳过）；内容原样返回，不做 frontmatter 剥离
 * （modes 文件未登记 frontmatter 纪律，逐字节等价于旧 fs.readFileSync 路径）。
 */
export function loadModeDocument(language: "zh" | "en", name: string): string | null {
  const safeName = `${path.basename(name, ".md")}.md`; // 防路径穿越，沿用旧路由的白名单语义
  const absolute = language === "zh"
    ? path.join(repoRoot(), "modes", "zh", safeName)
    : path.join(repoRoot(), "modes", safeName);
  if (!fs.existsSync(absolute)) return null;
  return fs.readFileSync(absolute, "utf8");
}

/** 注册表完整性自检：文件存在 + frontmatter 含 id/version。供护栏与测试调用。 */
export function verifyRegistryIntegrity(): Array<{ id: string; ok: boolean; problem?: string }> {
  return REGISTRY_MANIFEST.map((entry) => {
    try {
      if (entry.kind === "modes_dir") {
        // 目录条目：存在性检查即可（内含文件由 drift 护栏按文件粒度覆盖）
        if (!fs.existsSync(path.join(repoRoot(), entry.path))) {
          return { id: entry.id, ok: false, problem: `目录缺失: ${entry.path}` };
        }
        return { id: entry.id, ok: true };
      }
      const raw = readEntryRaw(entry);
      if (entry.kind === "prompt") {
        const { frontmatter } = stripFrontmatter(raw);
        if (!/id:\s*\S/.test(frontmatter) || !/version:\s*\S/.test(frontmatter)) {
          return { id: entry.id, ok: false, problem: "frontmatter 缺 id 或 version" };
        }
      }
      return { id: entry.id, ok: true };
    } catch (error) {
      return { id: entry.id, ok: false, problem: error instanceof Error ? error.message : String(error) };
    }  });
}
