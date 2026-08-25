import { createHash } from "crypto";

export function createToolGateScope(
  toolName: string,
  args: Record<string, unknown>,
  risk: string,
): string {
  return createHash("sha256")
    .update(stableStringify({ toolName, args, risk }))
    .digest("hex");
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}
