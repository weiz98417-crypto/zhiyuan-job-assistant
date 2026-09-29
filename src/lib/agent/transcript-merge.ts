/**
 * Transcript 合并（0.11.0-C，ADR-0036）。
 *
 * Worker 是 transcript 唯一写者；本地乐观层只存在于渲染内存。刷新时按稳定
 * 条目标识、附件、内容和时间逐条对账：
 * - 服务端有对应条目 → 以服务端为准（权威落库版本）
 * - 服务端没有、本地有 → 保留（可能是尚未落库的乐观项）
 * - 顺序以服务端为骨架，本地乐观项按时间就近插入尾部
 */

export interface MergeableMessage {
  itemId?: string;
  role: string;
  content: string;
  timestamp?: string;
  images?: string[];
  toolName?: string;
  toolResult?: unknown;
}

function pseudoId(message: MergeableMessage): string {
  const minute = (message.timestamp || "").slice(0, 16);
  return `${message.role}|${minute}|${message.content.slice(0, 64)}`;
}

function keyOf(message: MergeableMessage): string {
  return message.itemId || pseudoId(message);
}

function semanticToolKey(message: MergeableMessage): string | null {
  if (message.role !== "tool" || !message.toolResult || typeof message.toolResult !== "object") return null;
  const result = message.toolResult as Record<string, unknown>;
  const safeView = result.safeView && typeof result.safeView === "object" && !Array.isArray(result.safeView)
    ? result.safeView as Record<string, unknown>
    : result;
  const payload = safeView.uiPayload && typeof safeView.uiPayload === "object" && !Array.isArray(safeView.uiPayload)
    ? safeView.uiPayload as Record<string, unknown>
    : null;
  const type = typeof payload?.type === "string" ? payload.type : "";
  if (!type) return null;
  const runId = typeof result.durableRunId === "string"
    ? result.durableRunId
    : typeof safeView.durableRunId === "string" ? safeView.durableRunId : "";
  return [runId, message.toolName || safeView.toolName || "", type, stableValue(payload)].join("|");
}

export function stableValue(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableValue).join(",")}]`;
  if (!value || typeof value !== "object") return JSON.stringify(value) || "";
  return `{${Object.keys(value as Record<string, unknown>).sort().map((key) => `${JSON.stringify(key)}:${stableValue((value as Record<string, unknown>)[key])}`).join(",")}}`;
}

function closeEnough(left: MergeableMessage, right: MergeableMessage): boolean {
  const leftTime = Date.parse(left.timestamp || "");
  const rightTime = Date.parse(right.timestamp || "");
  return Number.isFinite(leftTime) && Number.isFinite(rightTime) && Math.abs(leftTime - rightTime) <= 30_000;
}

function sameConversationTurn(left: MergeableMessage, right: MergeableMessage): boolean {
  if (left.role !== right.role || (left.role !== "user" && left.role !== "assistant")) return false;
  if (!closeEnough(left, right)) return false;
  const leftImages = left.images || [];
  const rightImages = right.images || [];
  const sameImages = leftImages.length === rightImages.length
    && leftImages.every((image, index) => image === rightImages[index]);
  if (left.content && left.content === right.content) return sameImages;
  if (left.role !== "user") return false;
  if (!left.content && leftImages.length > 0 && sameImages) return true;
  return leftImages.some((image) => image.startsWith("data:application/pdf"))
    && rightImages.length === 0
    && right.content.startsWith(`${left.content}\n\n---\n`);
}

export function mergeServerTranscript<
  T extends MergeableMessage,
>(local: readonly T[], server: readonly T[]): Array<T | MergeableMessage> {
  const matchedLocal = new Set<number>();
  for (const serverItem of server) {
    const semanticKey = semanticToolKey(serverItem);
    const match = local.findIndex((localItem, index) => !matchedLocal.has(index) && (
      keyOf(localItem) === keyOf(serverItem)
      || Boolean(semanticKey && semanticKey === semanticToolKey(localItem)
        && (semanticKey.split("|", 1)[0] || closeEnough(localItem, serverItem)))
      || sameConversationTurn(localItem, serverItem)
    ));
    if (match >= 0) matchedLocal.add(match);
  }
  const merged: Array<T | MergeableMessage> = [];
  const emittedLocal = new Set<number>();

  for (let index = 0; index < server.length; index += 1) {
    const serverItem = server[index];
    // Attach trailing local optimistic items that belong before this server item.
    for (let localIndex = 0; localIndex < local.length; localIndex += 1) {
      if (matchedLocal.has(localIndex) || emittedLocal.has(localIndex)) continue;
      const localItem = local[localIndex];
      const localTs = Date.parse(localItem.timestamp || "") || 0;
      const serverTs = Date.parse(serverItem.timestamp || "") || Number.MAX_SAFE_INTEGER;
      if (localTs <= serverTs) {
        merged.push(localItem);
        emittedLocal.add(localIndex);
      }
    }
    merged.push(serverItem);
  }
  // Any remaining local items (never acknowledged by the server) keep render state.
  for (let localIndex = 0; localIndex < local.length; localIndex += 1) {
    if (matchedLocal.has(localIndex) || emittedLocal.has(localIndex)) continue;
    merged.push(local[localIndex]);
  }
  return merged;
}
