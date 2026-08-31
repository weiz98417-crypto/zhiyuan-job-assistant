export function safeUserDisplayName(displayName: unknown, username: unknown): string {
  const candidate = typeof displayName === "string" ? displayName.trim() : "";
  const compact = candidate.replace(/\s+/g, "");
  if (candidate && !/^[?？�]+$/u.test(compact)) return candidate;

  const fallback = typeof username === "string" ? username.trim() : "";
  return fallback || "用户";
}
