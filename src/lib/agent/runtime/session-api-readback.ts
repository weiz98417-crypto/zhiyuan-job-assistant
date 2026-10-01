import { getDatabaseDriver, isPostgresConfigured } from "@/lib/postgres";
import { getSessionMemoryAdapter, type SessionMemoryMessage } from "@/lib/memory/postgres-memory";
import { safeAssistantText } from "@/lib/agent/runtime/run-event-projection";
import {
  collectJobDiscoveryScanIds,
  reconcileJobDiscoveryRunMessages,
} from "@/lib/agent/job-discovery-card-status";
import { getScanStatusesForUser } from "@/lib/scan-data";
import type { AgentMessage } from "@/types";

function toSessionTranscriptMessage(message: SessionMemoryMessage, fallbackTimestamp: string, includeImages: boolean) {
  const execution = message.metadata?.execution;
  const metadata = execution && typeof execution === "object" && !Array.isArray(execution)
    ? execution as Record<string, unknown>
    : {};
  return {
    role: typeof metadata.role === "string" ? metadata.role : message.role,
    content: message.role === "assistant" ? safeAssistantText(message.content) : message.content,
    timestamp: message.createdAt || fallbackTimestamp,
    ...(message.id ? { id: message.id, itemId: message.id } : {}),
    ...(includeImages && Array.isArray(metadata.images) ? { images: metadata.images } : {}),
    ...(typeof metadata.toolName === "string" ? { toolName: metadata.toolName } : {}),
    ...(metadata.toolResult !== undefined ? { toolResult: metadata.toolResult } : {}),
  };
}

export async function readSessionRowsWithDurableMessages<T extends Record<string, unknown>>(
  rows: T[],
  userId: string,
  options: { includeImages?: boolean } = {},
): Promise<T[]> {
  if (getDatabaseDriver() !== "postgres" || !isPostgresConfigured()) {
    return reconcileSessionRows(rows, userId);
  }
  const adapter = getSessionMemoryAdapter();
  const result: T[] = [];
  for (let index = 0; index < rows.length; index += 5) {
    const batch = await Promise.all(rows.slice(index, index + 5).map(async (row) => {
      const conversationId = Number(row.id);
      if (!Number.isInteger(conversationId) || conversationId <= 0) return row;
      const messages = await adapter.load({ userId, conversationId });
      if (!messages.length) return row;
      const fallbackTimestamp = typeof row.created_at === "string" ? row.created_at : new Date().toISOString();
      return {
        ...row,
        messages_json: JSON.stringify(messages.map((message) => toSessionTranscriptMessage(message, fallbackTimestamp, options.includeImages === true))),
      };
    }));
    result.push(...batch);
  }
  return reconcileSessionRows(result, userId);
}

/** Spec 20: 读回层对账——job_discovery_run 卡的瞬时状态在返回客户端前用 scan_queue
 *  终态覆写（读时投影，不写回 transcript）。挂在出口使 legacy 早退与 durable 路径
 *  都被覆盖；对账失败只记日志，绝不阻塞会话读回。 */
async function reconcileSessionRows<T extends Record<string, unknown>>(rows: T[], userId: string): Promise<T[]> {
  try {
    const parsed = rows.map((row) => {
      try {
        const raw = row.messages_json;
        const messages = typeof raw === "string" && raw.trim() ? (JSON.parse(raw) as AgentMessage[]) : [];
        return { row, messages: Array.isArray(messages) ? messages : [] };
      } catch {
        return { row, messages: [] as AgentMessage[] };
      }
    });
    const scanIds = Array.from(new Set(parsed.flatMap((entry) => collectJobDiscoveryScanIds(entry.messages))));
    if (!scanIds.length) return rows;
    const statuses = await getScanStatusesForUser(userId, scanIds);
    if (!Object.keys(statuses).length && scanIds.length > 0) {
      // 查无任何记录也要覆写 unknown，因此仅在 statuses 为空对象但确有卡时继续。
    }
    return rows.map((row, index) => {
      const { messages } = parsed[index];
      if (!messages.length) return row;
      const reconciled = reconcileJobDiscoveryRunMessages(messages, statuses);
      if (reconciled === messages) return row;
      return { ...row, messages_json: JSON.stringify(reconciled) };
    });
  } catch (error) {
    console.error(`[session-readback] job discovery card reconciliation failed: ${error instanceof Error ? error.message : error}`);
    return rows;
  }
}
