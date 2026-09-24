/**
 * assistant-ui 换芯的纯转换层(0.11.0-D2,ADR-0031)。
 *
 * 职责:把 page.tsx 的对话投影(transcript 合并层输出)转成 assistant-ui
 * ExternalStoreRuntime 的 ThreadMessageLike;运行态判定与方言事件条目的
 * data-part 映射也在这里,保证与 0.11.0-B 事件方言(单一事实源)对齐。
 * 本模块保持纯函数,便于 node 环境测试。
 */

import type { AppendMessage, ThreadMessageLike } from "@assistant-ui/react";
import type { AgentMessage } from "@/types";
import {
  AGENT_EVENT_DIALECT,
  type AgentEventType,
} from "@/lib/agent/events/dialect";
import { getAgentDisplayName } from "@/lib/agent/client-metadata";

export type AgentPhase =
  | "understanding"
  | "executing"
  | "verifying"
  | "reflecting"
  | "responding"
  | "done"
  | "compressing_context"
  | "extracting_ocr"
  | "extracting_jd"
  | "jd_extracted"
  | "detecting_archetype"
  | "archetype_detected"
  | null;

/** 是否处于活跃运行态(任务 2.2:isRunning = streaming && phase 活跃)。 */
export function isRunActive(streaming: boolean, phase: AgentPhase): boolean {
  return Boolean(streaming) && Boolean(phase) && phase !== "done";
}

/**
 * 方言过程事件条目:观察者可直接把事件附进 transcript,convertMessage
 * 会按方言映射为线程消息的 data part(componentKey 为 null 的事件没有
 * 卡片,注册表返回 null 渲染)。
 */
export interface AgentProcessEvent {
  eventId?: string;
  timestamp: string;
  type: AgentEventType;
  /** 仅承载 dialect.safeFields 白名单内的字段。 */
  data: Record<string, unknown>;
}

export type AgentTranscriptItem = AgentMessage | AgentProcessEvent;

export function isProcessEvent(item: AgentTranscriptItem): item is AgentProcessEvent {
  const candidate = item as Partial<AgentProcessEvent> & { role?: unknown };
  return candidate.role === undefined
    && typeof candidate.type === "string"
    && typeof candidate.data === "object"
    && candidate.data !== null;
}

/** ThreadMessageLike 的 message 部件不接受 tool 消息;工具卡以独立 assistant 条目 + tool-call part 呈现。 */
function convertToolMessage(message: AgentMessage, idPrefix: string, index: number): ThreadMessageLike {
  const raw = isRecord(message.toolResult) ? message.toolResult : {};
  return {
    role: "assistant",
    id: message.itemId || `${idPrefix}:tool:${index}:${message.toolName || ""}`,
    createdAt: parseDate(message.timestamp),
    content: [
      {
        type: "tool-call",
        toolCallId: message.itemId || `tool:${message.timestamp}`,
        toolName: message.toolName || "tool",
        args: {},
        result: raw,
      },
    ],
    metadata: { custom: { agentChatTool: true } },
  };
}

/** 对话条目 → ThreadMessageLike;相邻主责变化通过 metadata.custom.agentLabel 交给渲染层。 */
export function convertTranscript(
  items: readonly AgentTranscriptItem[],
  options: { isRunning?: boolean; idPrefix?: string } = {},
): ThreadMessageLike[] {
  const visible = items.filter((item) => {
    if (isProcessEvent(item)) return true;
    if (item.role === "assistant" && !item.content.trim()) return false;
    if (item.role === "tool" && item.toolName === "evaluate_jd_full") return false;
    return true;
  });

  const idPrefix = options.idPrefix ?? "s";
  return visible.map((item, index) => {
    const converted = isProcessEvent(item)
      ? convertProcessEvent(item, idPrefix, index)
      : item.role === "tool"
        ? convertToolMessage(item, idPrefix, index)
        : convertChatMessage(item, index === visible.length - 1, options.isRunning === true, idPrefix, index);
    // 主责标签:当前条目可标注且与前一条目主责不同时交给渲染层展示。
    const agentLabel = resolveAgentLabel(visible, index);
    if (agentLabel) {
      return {
        ...converted,
        metadata: { ...converted.metadata, custom: { ...converted.metadata?.custom, agentLabel } },
      } satisfies ThreadMessageLike;
    }
    return converted;
  });
}

/** 当前条目的主责展示名;与旧壳一致——仅在与紧邻前一条目主责不同(且非 user 条目)时返回。 */
function resolveAgentLabel(items: readonly AgentTranscriptItem[], index: number): string | undefined {
  const item = items[index];
  if (!item || isProcessEvent(item) || item.role === "user") return undefined;
  const agentId = effectiveAgentId(item);
  if (!agentId || agentId === "general") return undefined;
  const prev = index > 0 ? items[index - 1] : undefined;
  const prevAgentId = prev && !isProcessEvent(prev) ? effectiveAgentId(prev) : undefined;
  return prevAgentId === agentId ? undefined : getAgentDisplayName(agentId);
}

function effectiveAgentId(message: AgentMessage): string | undefined {
  return message.agent_id || (message.mode === "interview-coach" ? "interview" : undefined);
}

function convertChatMessage(
  message: AgentMessage,
  isLast: boolean,
  isRunning: boolean,
  idPrefix: string,
  index: number,
): ThreadMessageLike {
  if (message.role === "user") {
    const images = Array.isArray(message.images)
      ? message.images.filter((src) => typeof src === "string" && src.startsWith("data:image/"))
      : [];
    return {
      role: "user",
      id: message.itemId || `${idPrefix}:user:${index}`,
      createdAt: parseDate(message.timestamp),
      content: [
        ...(message.content ? [{ type: "text" as const, text: message.content }] : []),
        ...images.map((image) => ({ type: "image" as const, image })),
      ],
    };
  }
  const status = isLast && isRunning
    ? ({ type: "running" as const })
    : undefined;
  return {
    role: "assistant",
    id: message.itemId || `${idPrefix}:assistant:${index}`,
    createdAt: parseDate(message.timestamp),
    content: message.content ? [{ type: "text" as const, text: message.content }] : [],
    ...(status ? { status } : {}),
    metadata: { custom: { agentId: effectiveAgentId(message) ?? null } },
  };
}

/**
 * 方言事件条目 → data part(componentKey 为 null 的事件仅承载过程状态,
 * 注册表里没有渲染器,渲染层自然跳过)。
 */
function convertProcessEvent(event: AgentProcessEvent, idPrefix: string, index: number): ThreadMessageLike {
  const descriptor = AGENT_EVENT_DIALECT[event.type];
  const safeData: Record<string, unknown> = {};
  if (descriptor) {
    for (const field of descriptor.safeFields) {
      if (field in event.data) safeData[field] = event.data[field];
    }
  }
  return {
    role: "assistant",
    id: event.eventId || `${idPrefix}:event:${index}:${event.type}`,
    createdAt: parseDate(event.timestamp),
    content: [{ type: `data-${event.type}` as const, data: safeData }],
    metadata: { custom: { processEvent: event.type } },
  };
}

/** composer 提交(AppendMessage)→ onSend(content, images) 入参。 */
export function appendMessageToSubmission(message: AppendMessage): { content: string; images: string[] } {
  const text = message.content
    .filter((part): part is { type: "text"; text: string } => part.type === "text")
    .map((part) => part.text)
    .join("");
  const images = message.content
    .filter((part): part is { type: "image"; image: string } => part.type === "image")
    .map((part) => part.image)
    .filter((image): image is string => typeof image === "string");
  return { content: text, images };
}

function parseDate(value: string): Date | undefined {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? undefined : new Date(parsed);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
