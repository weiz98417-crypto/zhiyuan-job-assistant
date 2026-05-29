import fs from "fs";
import path from "path";

/* ── Types ── */

export interface SkillMeta {
  name: string;
  description: string;
}

export interface SkillDefinition {
  meta: SkillMeta;
  body: string;
}

/* ── Module-level cache ── */

const cache = new Map<string, SkillDefinition>();

/* ── Frontmatter parser ── */

function parseFrontmatter(raw: string): { meta: Record<string, string>; body: string } {
  const trimmed = raw.trimStart();
  if (!trimmed.startsWith("---")) {
    return { meta: {}, body: raw };
  }

  const end = trimmed.indexOf("---", 3);
  if (end === -1) {
    return { meta: {}, body: raw };
  }

  const frontmatterBlock = trimmed.slice(3, end);
  const body = trimmed.slice(end + 3).trim();

  const meta: Record<string, string> = {};
  for (const line of frontmatterBlock.split("\n")) {
    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    const value = line.slice(colonIdx + 1).trim();
    if (key && value) meta[key] = value;
  }

  return { meta, body };
}

/* ── Loader ── */

export function loadSkill(name: string): SkillDefinition {
  const cached = cache.get(name);
  if (cached) return cached;

  const filePath = path.join(process.cwd(), "skills", `${name}.md`);

  if (!fs.existsSync(filePath)) {
    throw new Error(`Skill file not found: ${filePath}`);
  }

  const raw = fs.readFileSync(filePath, "utf-8");
  const { meta, body } = parseFrontmatter(raw);

  const def: SkillDefinition = {
    meta: {
      name: meta.name || name,
      description: meta.description || "",
    },
    body,
  };

  cache.set(name, def);
  return def;
}

export function getSkillBody(name: string): string {
  return loadSkill(name).body;
}
