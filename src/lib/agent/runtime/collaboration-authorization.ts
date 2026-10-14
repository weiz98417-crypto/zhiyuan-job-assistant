import { createHash } from "crypto";

export function readCollaborationAuthorization(messages: unknown[], kind: "research" | "handoff",
  targetAgentId: string, goal: string): { turnId: string; quote: string; hash: string } {
  const user = [...messages].reverse().map(record).find((entry) => entry.role === "user");
  const quote = typeof user?.content === "string" ? user.content : "";
  const turnId = typeof user?.id === "string" ? user.id : typeof user?.itemId === "string" ? user.itemId : "";
  const aliases: Record<string, string[]> = { general: ["general", "通用"], resume: ["resume", "简历"], evaluate: ["evaluate", "岗位评估", "JD评估"] };
  const stripQuoted = (value: string) => value.replace(/“[^”]*”|「[^」]*」|『[^』]*』|"[^"]*"|'[^']*'|‘[^’]*’|`[^`]*`/g, "");
  const command = kind === "research" ? "(?:委派|委托|交给|delegate)" : "(?:交接|移交|交给|handoff|transfer)";
  const segments = quote.split(/[。！？；;\n]/);
  const authorized = segments.some((segment) => {
    const unquoted = stripQuoted(segment);
    const action = new RegExp(command, "i").exec(unquoted);
    if (!action) return false;
    const prefix = unquoted.slice(0, action.index);
    const direct = /^(?:\s|可选辅助研究[：:]|辅助研究[：:])*(?:(?:请|麻烦|现在|立即|直接)\s*|please\s+)?(?:(?:将|把)[^，,:：]{1,80})?$/i.test(prefix);
    const suffix = unquoted.slice(action.index);
    const conditional = /(?:如果|假如|假设|倘若|除非|暂不|不要|不允许|不得|请勿|do not|don't|unless|\bif\b)/i.test(suffix.replace(goal, ""));
    return direct && !conditional && !/[?？]/.test(quote)
      && segment.replace(/\s/g, "").includes(goal.replace(/\s/g, ""))
      && aliases[targetAgentId]?.some((alias) => new RegExp("^" + command + "(?:\\s|给|to\\s+)*" + alias
        + "(?=\\s|专家|代理|Agent|研究|继续|解释|评估|[，,:：]|$)", "i").test(suffix));
  });
  if (!turnId || quote.length > 8_000 || goal.length < 4 || goal.length > 500 || !authorized) {
    throw new Error(kind === "research" ? "研究委派需要当前持久化用户消息明确执行目标专家和研究范围"
      : "主责交接需要当前持久化用户消息明确执行目标专家和目标");
  }
  return { turnId, quote, hash: createHash("sha256").update(quote).digest("hex") };
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
