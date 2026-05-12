/**
 * loadAgentMD — 加载 agent.md 文件，解析 YAML frontmatter + body
 *
 * 返回 AgentSoul = { meta: {name, model, model_pro?}, body: string }
 * 校验缺失 name/model → fallback
 */

// Server-only: fs/path are unavailable in browser
let readFileSync: (p: string, encoding: string) => string;
let existsSync: (p: string) => boolean;
let resolvePath: (...p: string[]) => string;

if (typeof window === "undefined") {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const fs = require("fs");
  readFileSync = fs.readFileSync;
  existsSync = fs.existsSync;
  resolvePath = require("path").resolve;
} else {
  // Browser stub — never actually called (loadAgentMD is server-only)
  readFileSync = () => { throw new Error("loadAgentMD is server-only"); };
  existsSync = () => false;
  resolvePath = (...p) => p.join("/");
}

export interface AgentSoul {
  meta: {
    name: string;
    model: string;
    model_pro?: string;
  };
  body: string;
}

/**
 * 简单 YAML frontmatter 解析器（不需要 js-yaml 依赖）
 * 格式: ---\nkey: value\n...\n---\nbody
 */
function parseFrontmatter(raw: string): { meta: Record<string, string>; body: string } {
  const meta: Record<string, string> = {};
  let body = raw;

  if (raw.startsWith("---")) {
    const end = raw.indexOf("---", 3);
    if (end !== -1) {
      const fm = raw.slice(3, end);
      body = raw.slice(end + 3).trim();

      for (const line of fm.split("\n")) {
        const col = line.indexOf(":");
        if (col !== -1) {
          const key = line.slice(0, col).trim();
          const val = line.slice(col + 1).trim().replace(/^["']|["']$/g, "");
          if (key && val) meta[key] = val;
        }
      }
    }
  }
  return { meta, body };
}

/**
 * 从文件系统加载 agent.md
 * @param agentId agent 标识符，对应 registry/agents/{agentId}/agent.md
 */
export function loadAgentMD(agentId: string): AgentSoul {
  const filePath = resolvePath(process.cwd(), "src/lib/agent/registry/agents", agentId, "agent.md");

  if (!existsSync(filePath)) {
    console.warn(`[agent-md] agent.md not found for "${agentId}" at ${filePath}, using fallback`);
    return getFallback(agentId);
  }

  const raw = readFileSync(filePath, "utf-8");
  const { meta, body } = parseFrontmatter(raw);

  // Schema 校验
  if (!meta.name || !meta.model) {
    console.warn(
      `[agent-md] agent.md for "${agentId}" missing name or model in frontmatter, using fallback`,
    );
    return getFallback(agentId);
  }

  return { meta: meta as AgentSoul["meta"], body };
}

/** Fallback: 返回空 soul，调用方自己处理 */
function getFallback(agentId: string): AgentSoul {
  return {
    meta: { name: agentId, model: "deepseek-v4-flash" },
    body: `你是纸鸢的 ${agentId} 助手。根据用户需求提供帮助。`,
  };
}

/** Promise-based API (兼容可能的异步加载场景) */
export async function loadAgentMDAsync(agentId: string): Promise<AgentSoul> {
  return loadAgentMD(agentId);
}
