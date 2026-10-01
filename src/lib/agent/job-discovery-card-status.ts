import type { AgentMessage } from "@/types";

/**
 * 岗位发现卡片回放对账（Spec 20）。
 *
 * 纯函数：输入会话消息与 scanId→终态映射（来自 scan_queue），输出覆写后的消息。
 * 只动 role="tool" 且卡片类型为 job_discovery_run 的条目——瞬时状态（pending/running）
 * 用事实源终态覆写；「无事实源」（无 scanId、scan_queue 查无记录）统一落 unknown，
 * 绝不保留进行中判定。孤儿扫描（scan_queue 仍是 pending/running）是真实状态，不覆写。
 */

export interface ScanTerminalStatus {
  status: string;
  updatedAt: string | null;
}

export type ScanStatusMap = Record<string, ScanTerminalStatus>;

const CARD_TYPE = "job_discovery_run";
/** scan_queue 终态词表（scan-worker.mjs: done/failed；scan-data.ts: canceled）。 */
const TERMINAL_STATUSES = new Set(["done", "failed", "canceled"]);
const IN_FLIGHT_STATUSES = new Set(["pending", "running"]);

interface LocatedCard {
  container: Record<string, unknown>;
  payload: Record<string, unknown>;
  scanId: string;
  status: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/** 卡片 payload 的两个落点：toolResult.uiPayload（ToolResult 三管道）与 toolResult 本身
 *  （item-projection 把 safeView 展开进 toolResult 的路径）。 */
function locateCard(message: AgentMessage): LocatedCard | null {
  if (message.role !== "tool" || !isRecord(message.toolResult)) return null;
  const toolResult = message.toolResult as Record<string, unknown>;
  const uiPayload = isRecord(toolResult.uiPayload) ? toolResult.uiPayload : null;
  if (uiPayload && uiPayload.type === CARD_TYPE) {
    return {
      container: toolResult,
      payload: uiPayload,
      scanId: typeof uiPayload.scanId === "string" ? uiPayload.scanId : "",
      status: typeof uiPayload.status === "string" ? uiPayload.status : "",
    };
  }
  if (toolResult.type === CARD_TYPE) {
    return {
      container: toolResult,
      payload: toolResult,
      scanId: typeof toolResult.scanId === "string" ? toolResult.scanId : "",
      status: typeof toolResult.status === "string" ? toolResult.status : "",
    };
  }
  return null;
}

export function collectJobDiscoveryScanIds(messages: AgentMessage[]): string[] {
  const ids = new Set<string>();
  for (const message of messages) {
    const card = locateCard(message);
    if (card?.scanId) ids.add(card.scanId);
  }
  return Array.from(ids);
}

/** 对账一个会话的消息数组：返回新数组（无卡或无需覆写时原样返回）。 */
export function reconcileJobDiscoveryRunMessages(messages: AgentMessage[], statuses: ScanStatusMap): AgentMessage[] {
  let mutated = false;
  const next = messages.map((message) => {
    const card = locateCard(message);
    if (!card) return message;
    if (TERMINAL_STATUSES.has(card.status)) return message;

    const entry = card.scanId ? statuses[card.scanId] : undefined;
    let nextStatus: string;
    let resolvedAt: string | null;
    if (entry && TERMINAL_STATUSES.has(entry.status)) {
      nextStatus = entry.status;
      resolvedAt = entry.updatedAt;
    } else if (entry) {
      // 孤儿运行（scan_queue 仍是 pending/running）：保留现状——这是扫描子系统的
      // 真实状态，属其自身缺陷（Spec 20 Out of Scope），读回层不替它下结论。
      return message;
    } else {
      // 查无记录或 scanId 缺失：无事实源，unknown——绝不保留进行中判定。
      nextStatus = "unknown";
      resolvedAt = null;
    }
    if (card.status === nextStatus) return message;

    mutated = true;
    const payload: Record<string, unknown> = { ...card.payload, status: nextStatus };
    if (resolvedAt) payload.resolvedAt = resolvedAt;
    const container = { ...card.container };
    if (container.uiPayload === card.payload) container.uiPayload = payload;
    else Object.assign(container, payload);
    return { ...message, toolResult: container };
  });
  return mutated ? next : messages;
}
