/**
 * Transcript 合并（0.11.0-C，ADR-0030）。
 *
 * Worker 是 transcript 唯一写者；本地乐观层只存在于渲染内存。刷新时按稳定
 * 条目标识（itemId，缺失时退化为 role+content+分钟时间戳的伪 id）合并：
 * - 服务端有同名条目 → 以服务端为准（权威落库版本）
 * - 服务端没有、本地有 → 保留（可能是尚未落库的乐观项）
 * - 顺序以服务端为骨架，本地乐观项按时间就近插入尾部
 */

export interface MergeableMessage {
  itemId?: string;
  role: string;
  content: string;
  timestamp?: string;
}

function pseudoId(message: MergeableMessage): string {
  const minute = (message.timestamp || "").slice(0, 16);
  return `${message.role}|${minute}|${message.content.slice(0, 64)}`;
}

function keyOf(message: MergeableMessage): string {
  return message.itemId || pseudoId(message);
}

export function mergeServerTranscript<
  T extends MergeableMessage,
>(local: readonly T[], server: readonly T[]): Array<T | MergeableMessage> {
  const serverKeys = new Set(server.map(keyOf));
  const merged: Array<T | MergeableMessage> = [];
  const consumedLocal = new Set<string>();
  const serverKeyOf = new Map<number, string>();
  server.forEach((message, index) => serverKeyOf.set(index, keyOf(message)));

  for (let index = 0; index < server.length; index += 1) {
    const serverItem = server[index];
    const sKey = serverKeyOf.get(index)!;
    // Attach trailing local optimistic items that belong before this server item.
    for (const localItem of local) {
      const lKey = keyOf(localItem);
      if (consumedLocal.has(lKey) || serverKeys.has(lKey)) continue;
      const localTs = Date.parse(localItem.timestamp || "") || 0;
      const serverTs = Date.parse(serverItem.timestamp || "") || Number.MAX_SAFE_INTEGER;
      if (localTs <= serverTs) {
        merged.push(localItem);
        consumedLocal.add(lKey);
      }
    }
    merged.push(serverItem);
  }
  // Any remaining local items (never acknowledged by the server) keep render state.
  for (const localItem of local) {
    const lKey = keyOf(localItem);
    if (!consumedLocal.has(lKey) && !serverKeys.has(lKey)) {
      merged.push(localItem);
      consumedLocal.add(lKey);
    }
  }
  return merged;
}
