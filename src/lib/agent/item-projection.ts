import {
  projectToolResultForUser,
  sanitizeSafeReasoningSummary,
  type UserSafeToolView,
  type AgentSurfaceEvent,
} from "@/lib/agent/surface-projection";
import type { AgentMessage } from "@/types";

export type AgentItemStatus = "started" | "delta" | "completed" | "interrupted" | "failed" | "hidden";

export interface AgentItem {
  itemId: string;
  status: AgentItemStatus;
  content: string;
  toolView?: UserSafeToolView;
  visible: boolean;
  lastCursor?: number;
}

export interface AgentItemEvent {
  cursor?: number;
  itemId?: string;
  type: AgentItemStatus;
  content?: string;
  toolView?: UserSafeToolView;
}

export class AgentItemAssembler {
  private readonly runId: string;
  private readonly items = new Map<string, AgentItem>();
  private readonly seenCursors = new Set<number>();

  constructor(runId: string) {
    this.runId = runId;
  }

  apply(event: AgentItemEvent): AgentItem | null {
    if (typeof event.cursor === "number") {
      if (this.seenCursors.has(event.cursor)) return null;
      this.seenCursors.add(event.cursor);
    }
    const itemId = event.itemId || `${this.runId}:assistant`;
    const current = this.items.get(itemId) || {
      itemId,
      status: "started" as const,
      content: "",
      visible: false,
    };
    const content = event.type === "delta" ? current.content + (event.content || "") : event.content ?? current.content;
    const terminal = event.type === "completed" || event.type === "interrupted" || event.type === "failed" || event.type === "hidden";
    const hasVisibleContent = Boolean(content.trim());
    const visible = event.type === "hidden" ? false : hasVisibleContent || Boolean(event.toolView);
    const next: AgentItem = {
      ...current,
      status: terminal && !visible && event.type === "completed" ? "hidden" : event.type,
      content,
      toolView: event.toolView || current.toolView,
      visible,
      lastCursor: event.cursor ?? current.lastCursor,
    };
    this.items.set(itemId, next);
    return next;
  }

  snapshot(): AgentItem[] {
    return Array.from(this.items.values()).filter((item) => item.visible || item.status === "interrupted" || item.status === "failed");
  }

  surfaceEvents(): AgentSurfaceEvent[] {
    return this.snapshot().map((item) => ({
      audience: item.content.trim() || item.toolView?.kind === "card" ? "user_transcript" : "user_activity",
      itemId: item.itemId,
      cursor: item.lastCursor,
      lifecycle: item.status,
      content: item.content || undefined,
      summary: item.toolView?.summary,
      toolView: item.toolView,
    }));
  }
}

export function isVisibleAgentItem(item: Pick<AgentItem, "content" | "toolView" | "status">): boolean {
  return Boolean(item.content.trim() || item.toolView || item.status === "interrupted" || item.status === "failed");
}

export type ConversationItemType =
  | "user_turn"
  | "assistant_text"
  | "run_progress"
  | "safe_tool_status"
  | "artifact_card"
  | "run_gate"
  | "task_switch_notice"
  | "run_terminal"
  | "user_safe_error";

export type ConversationItemDisplayState =
  | "visible"
  | "running"
  | "pending"
  | "resolved"
  | "failed"
  | "interrupted"
  | "hidden";

export interface ConversationItem {
  itemId: string;
  conversationId: number | null;
  runId?: string;
  eventCursor?: number;
  type: ConversationItemType;
  schemaVersion: number;
  displayState: ConversationItemDisplayState;
  createdAt: string;
  updatedAt: string;
  dedupeKey: string;
  payload: Record<string, unknown>;
  artifactRef?: {
    id: string | number;
    version: string | number;
    hash?: string;
  };
}

export interface ConversationProjectionEvent {
  runId: string;
  userId?: string;
  sequence: number;
  type: string;
  schemaVersion?: number;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface ConversationTurnProjection {
  turnId?: string | number;
  content: string;
  createdAt?: string;
  updatedAt?: string;
  eventCursor?: number;
  dedupeKey?: string;
}

export interface VerifiedArtifactProjection {
  id: string | number;
  version: string | number;
  hash?: string;
  ownerId?: string;
  verified?: boolean;
  stale?: boolean;
  type?: string;
}

export interface ConversationProjectionGate {
  id?: string;
  gateId?: string;
  runId?: string;
  toolName?: string;
  risk?: string;
  scopeHash?: string;
  status: "pending" | "approved" | "denied" | "expired" | "cancelled";
  request?: Record<string, unknown>;
  resolvedAt?: string | null;
  createdAt?: string;
}

export interface ConversationItemProjectionInput {
  conversationId: number | null;
  runId?: string;
  ownerId?: string;
  events?: ConversationProjectionEvent[];
  gates?: ConversationProjectionGate[];
  conversationTurns?: ConversationTurnProjection[];
  artifacts?: VerifiedArtifactProjection[];
  assistantText?: string;
  now?: string;
}

const TERMINAL_RUN_STATUSES = new Set(["succeeded", "failed", "cancelled"]);

export class ConversationItemProjector {
  private readonly items = new Map<string, ConversationItem>();
  private readonly seenEvents = new Set<string>();
  private readonly conversationId: number | null;
  private readonly runId?: string;
  private readonly artifacts: VerifiedArtifactProjection[];
  private readonly ownerId?: string;

  constructor(input: Pick<ConversationItemProjectionInput, "conversationId" | "runId" | "artifacts" | "ownerId">) {
    this.conversationId = input.conversationId;
    this.runId = input.runId;
    this.artifacts = input.artifacts || [];
    this.ownerId = input.ownerId;
  }

  applyEvent(event: ConversationProjectionEvent): ConversationItem | null {
    if (!event || typeof event.sequence !== "number") return null;
    const eventKey = `${event.runId}:${event.sequence}`;
    if (this.seenEvents.has(eventKey)) return null;
    this.seenEvents.add(eventKey);
    const payload = record(event.payload);
    const at = validTime(event.createdAt);
    const eventRunId = event.runId || this.runId || "run";
    if (event.type === "run.ui_event") return this.applyUiEvent(eventRunId, event.sequence, record(payload.event), at);
    if (event.type === "run.gate_opened") return this.applyGate({
      gateId: stringOrUndefined(payload.gateId),
      runId: eventRunId,
      toolName: stringOrUndefined(payload.toolName),
      risk: stringOrUndefined(payload.risk),
      scopeHash: stringOrUndefined(payload.scopeHash),
      status: "pending",
      request: record(payload.request),
      createdAt: at,
    }, event.sequence);
    if (event.type === "run.gate_resolved") return this.applyGate({
      gateId: stringOrUndefined(payload.gateId),
      runId: eventRunId,
      toolName: stringOrUndefined(payload.toolName),
      risk: stringOrUndefined(payload.risk),
      scopeHash: stringOrUndefined(payload.scopeHash),
      status: gateStatus(payload.status || payload.decision),
      request: record(payload.request),
      resolvedAt: stringOrUndefined(payload.resolvedAt),
      createdAt: at,
    }, event.sequence);
    if (event.type === "run.status_changed") {
      const status = String(payload.status || "");
      if (TERMINAL_RUN_STATUSES.has(status)) {
        return this.upsert({
          itemId: `${eventRunId}:terminal`,
          dedupeKey: `${eventRunId}:terminal`,
          type: "run_terminal",
          displayState: status === "failed" ? "failed" : "visible",
          runId: eventRunId,
          eventCursor: event.sequence,
          createdAt: at,
          updatedAt: at,
          payload: status === "failed"
            ? { status, message: "任务未完成，请检查后重试。" }
            : { status },
        });
      }
      return this.upsert({
        itemId: `${eventRunId}:progress:status`,
        dedupeKey: `${eventRunId}:progress:status`,
        type: "run_progress",
        displayState: status === "waiting_user" || status === "paused" ? "pending" : "running",
        runId: eventRunId,
        eventCursor: event.sequence,
        createdAt: at,
        updatedAt: at,
        payload: { status },
      });
    }
    if (event.type === "run.input_accepted") {
      return this.upsert({
        itemId: `${eventRunId}:progress:input:${String(payload.inputId || event.sequence)}`,
        dedupeKey: `${eventRunId}:input:${String(payload.inputId || event.sequence)}`,
        type: "run_progress",
        displayState: "visible",
        runId: eventRunId,
        eventCursor: event.sequence,
        createdAt: at,
        updatedAt: at,
        payload: { status: "input_accepted" },
      });
    }
    return null;
  }

  applyTurn(turn: ConversationTurnProjection): ConversationItem | null {
    const content = typeof turn.content === "string" ? turn.content.trim() : "";
    if (!content) return null;
    const dedupeKey = turn.dedupeKey || `conversation:${this.conversationId}:turn:${String(turn.turnId ?? hashText(content))}`;
    const at = validTime(turn.updatedAt || turn.createdAt);
    return this.upsert({
      itemId: `turn:${dedupeKey}`,
      dedupeKey,
      type: "user_turn",
      displayState: "visible",
      eventCursor: turn.eventCursor,
      createdAt: validTime(turn.createdAt),
      updatedAt: at,
      payload: { content: content.slice(0, 12000) },
    });
  }

  applyAssistantText(content: string, eventCursor?: number, createdAt?: string): ConversationItem | null {
    const safeContent = safeAssistantText(content);
    if (!safeContent) return null;
    const runId = this.runId || "run";
    const itemId = `${runId}:assistant`;
    const existing = this.items.get(itemId);
    const at = validTime(createdAt);
    return this.upsert({
      itemId,
      dedupeKey: `${runId}:assistant`,
      type: "assistant_text",
      displayState: "visible",
      runId,
      eventCursor,
      createdAt: existing?.createdAt || at,
      updatedAt: at,
      payload: { content: safeContent.slice(0, 20000) },
    });
  }

  applyGate(gate: ConversationProjectionGate, eventCursor?: number): ConversationItem | null {
    const gateId = gate.gateId || gate.id;
    if (!gateId) return null;
    const existing = this.items.get(`gate:${gateId}`);
    const at = validTime(gate.resolvedAt || gate.createdAt);
    const displayState: ConversationItemDisplayState = gate.status === "pending" ? "pending"
      : gate.status === "approved" ? "resolved"
      : gate.status === "denied" || gate.status === "expired" || gate.status === "cancelled" ? "failed"
      : "pending";
    return this.upsert({
      itemId: `gate:${gateId}`,
      dedupeKey: `gate:${gateId}`,
      type: "run_gate",
      displayState,
      runId: gate.runId || this.runId,
      eventCursor,
      createdAt: existing?.createdAt || validTime(gate.createdAt),
      updatedAt: at,
      payload: {
        gateId,
        toolName: safeIdentifier(gate.toolName),
        risk: safeIdentifier(gate.risk),
        status: gate.status,
        request: safeGateRequest(gate.request),
        ...(gate.resolvedAt ? { resolvedAt: gate.resolvedAt } : {}),
      },
    });
  }

  snapshot(): ConversationItem[] {
    return Array.from(this.items.values())
      .filter((item) => item.displayState !== "hidden")
      .sort(compareItems)
      .map(cloneConversationItem);
  }

  private applyUiEvent(runId: string, sequence: number, event: Record<string, unknown>, at: string): ConversationItem | null {
    const type = String(event.type || "");
    if (type === "text") {
      const content = safeAssistantText(event.content);
      if (!content) return null;
      const itemId = `${runId}:assistant`;
      const existing = this.items.get(itemId);
      const previous = typeof existing?.payload.content === "string" ? existing.payload.content : "";
      return this.upsert({
        itemId,
        dedupeKey: `${runId}:assistant`,
        type: "assistant_text",
        displayState: "visible",
        runId,
        eventCursor: sequence,
        createdAt: existing?.createdAt || at,
        updatedAt: at,
        payload: { content: `${previous}${content}`.slice(0, 20000) },
      });
    }
    if (type === "tool_result") {
      const projectedSafeView = record(event.safeView);
      const safeView: UserSafeToolView = projectedSafeView.kind === "card"
        || projectedSafeView.kind === "status"
        || projectedSafeView.kind === "silent"
        ? projectedSafeView as unknown as UserSafeToolView
        : projectToolResultForUser({
            toolName: safeIdentifier(event.name),
            success: event.success === true,
            uiPayload: recordOrUndefined(event.uiPayload),
          });
      if (safeView.kind === "silent") return null;
      const artifact = this.validArtifact(safeView);
      if (safeView.kind === "card" && artifact) {
        return this.upsert({
          itemId: `${runId}:artifact:${sequence}`,
          dedupeKey: `${runId}:artifact:${sequence}`,
          type: "artifact_card",
          displayState: safeView.status === "failed" ? "failed" : "visible",
          runId,
          eventCursor: sequence,
          createdAt: at,
          updatedAt: at,
          artifactRef: artifact,
          payload: safeView.uiPayload || { summary: safeView.summary },
        });
      }
      return this.upsert({
        itemId: `${runId}:tool:${sequence}`,
        dedupeKey: `${runId}:tool:${sequence}`,
        type: "safe_tool_status",
        displayState: safeView.status === "failed" ? "failed" : "visible",
        runId,
        eventCursor: sequence,
        createdAt: at,
        updatedAt: at,
        payload: { toolName: safeView.toolName, status: safeView.status, label: safeView.label, summary: safeView.summary },
      });
    }
    if (type === "tool_error") {
      return this.upsert({
        itemId: `${runId}:error:${sequence}`,
        dedupeKey: `${runId}:error:${sequence}`,
        type: "user_safe_error",
        displayState: "failed",
        runId,
        eventCursor: sequence,
        createdAt: at,
        updatedAt: at,
        payload: { message: "这一步未完成，请重试。", recoverable: event.recoverable !== false },
      });
    }
    if (type === "agent_switch") {
      return this.upsert({
        itemId: `${runId}:switch:${sequence}`,
        dedupeKey: `${runId}:switch:${sequence}`,
        type: "task_switch_notice",
        displayState: "visible",
        runId,
        eventCursor: sequence,
        createdAt: at,
        updatedAt: at,
        payload: { agentId: safeIdentifier(event.agentId) },
      });
    }
    if (type === "phase" || type === "run_directive" || type === "thinking_content") {
      const summary = type === "thinking_content"
        ? sanitizeSafeReasoningSummary(event.summary)
        : type === "phase" ? safeIdentifier(event.phase) : safeIdentifier(event.directive);
      if (!summary) return null;
      return this.upsert({
        itemId: `${runId}:progress:${type}`,
        dedupeKey: `${runId}:progress:${type}`,
        type: "run_progress",
        displayState: "running",
        runId,
        eventCursor: sequence,
        createdAt: at,
        updatedAt: at,
        payload: { status: summary },
      });
    }
    return null;
  }

  private validArtifact(safeView: UserSafeToolView): ConversationItem["artifactRef"] | undefined {
    const reference = safeView.artifact;
    if (!reference || reference.id === undefined || reference.version === undefined || reference.stale === true) return undefined;
    const matching = this.artifacts.length > 0
      ? this.artifacts.find((artifact) => String(artifact.id) === String(reference.id) && String(artifact.version) === String(reference.version))
      : undefined;
    if (this.artifacts.length > 0 && (!matching || matching.verified === false || matching.stale === true || (reference.hash && matching.hash && reference.hash !== matching.hash))) return undefined;
    if (this.ownerId && matching?.ownerId && matching.ownerId !== this.ownerId) return undefined;
    return {
      id: reference.id,
      version: reference.version,
      ...(reference.hash ? { hash: reference.hash } : {}),
    };
  }

  private upsert(item: Omit<ConversationItem, "conversationId" | "schemaVersion">): ConversationItem {
    const next: ConversationItem = {
      ...item,
      conversationId: this.conversationId,
      schemaVersion: 1,
      payload: sanitizeItemPayload(item.payload),
    };
    const existing = this.items.get(item.itemId);
    if (existing) {
      const merged = {
        ...existing,
        ...next,
        createdAt: existing.createdAt,
        payload: { ...existing.payload, ...next.payload },
      };
      this.items.set(item.itemId, merged);
      return merged;
    }
    this.items.set(item.itemId, next);
    return next;
  }
}

export function projectConversationItems(input: ConversationItemProjectionInput): ConversationItem[] {
  const projector = new ConversationItemProjector(input);
  const events = [...(input.events || [])].sort((left, right) => left.sequence - right.sequence);
  events.forEach((event) => projector.applyEvent(event));
  if (input.assistantText) projector.applyAssistantText(input.assistantText, events.at(-1)?.sequence, input.now);
  (input.conversationTurns || []).forEach((turn) => projector.applyTurn(turn));
  (input.gates || []).forEach((gate) => projector.applyGate(gate));
  return projector.snapshot();
}

export const projectDurableRunToConversationItems = projectConversationItems;
export const ConversationItemProjection = ConversationItemProjector;

export function conversationItemsToAgentMessages(items: ConversationItem[]): AgentMessage[] {
  return items.flatMap((item): AgentMessage[] => {
    const timestamp = item.updatedAt || item.createdAt;
    const content = typeof item.payload.content === "string"
      ? item.payload.content
      : typeof item.payload.summary === "string" ? item.payload.summary : "";
    if (item.type === "user_turn") return [{ role: "user", itemId: item.itemId, content, timestamp }];
    if (item.type === "assistant_text") return content ? [{ role: "assistant", itemId: item.itemId, content, timestamp }] : [];
    if (["safe_tool_status", "artifact_card", "run_gate"].includes(item.type)) {
      return [{
        role: "tool",
        itemId: item.itemId,
        content,
        toolName: typeof item.payload.toolName === "string" ? item.payload.toolName : item.type,
        toolResult: { ...item.payload, itemType: item.type, displayState: item.displayState, artifactRef: item.artifactRef },
        timestamp,
      }];
    }
    if (item.type === "user_safe_error" || item.type === "run_terminal") {
      return [{ role: "assistant", itemId: item.itemId, content, timestamp }];
    }
    return [];
  });
}

export interface ConversationItemProjectionDiff {
  equal: boolean;
  missing: string[];
  extra: string[];
  changed: string[];
}

export function compareConversationItemProjections(
  expected: ConversationItem[],
  actual: ConversationItem[],
): ConversationItemProjectionDiff {
  const left = new Map(expected.map((item) => [item.dedupeKey, item]));
  const right = new Map(actual.map((item) => [item.dedupeKey, item]));
  const missing: string[] = [];
  const extra: string[] = [];
  const changed: string[] = [];
  for (const [key, item] of left) {
    if (!right.has(key)) missing.push(key);
    else if (stableJson(item) !== stableJson(right.get(key))) changed.push(key);
  }
  for (const key of right.keys()) if (!left.has(key)) extra.push(key);
  return {
    equal: missing.length === 0 && extra.length === 0 && changed.length === 0,
    missing: missing.sort(),
    extra: extra.sort(),
    changed: changed.sort(),
  };
}

function compareItems(left: ConversationItem, right: ConversationItem): number {
  const created = left.createdAt.localeCompare(right.createdAt);
  if (created) return created;
  if (left.eventCursor !== undefined && right.eventCursor !== undefined && left.eventCursor !== right.eventCursor) {
    return left.eventCursor - right.eventCursor;
  }
  return left.itemId.localeCompare(right.itemId);
}

function cloneConversationItem(item: ConversationItem): ConversationItem {
  return {
    ...item,
    payload: JSON.parse(JSON.stringify(item.payload)) as Record<string, unknown>,
    ...(item.artifactRef ? { artifactRef: { ...item.artifactRef } } : {}),
  };
}

function sanitizeItemPayload(payload: Record<string, unknown>): Record<string, unknown> {
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (/^(raw|result|params?|arguments?|prompt|system|stack|trace|llm|internal|scopeHash)$/i.test(key)) continue;
    if (typeof value === "string") output[key] = value.slice(0, 20000);
    else if (Array.isArray(value)) output[key] = value.slice(0, 100).map((entry) => sanitizeItemValue(entry, 1)).filter((entry) => entry !== undefined);
    else if (value && typeof value === "object") output[key] = sanitizeItemPayload(value as Record<string, unknown>);
    else output[key] = value;
  }
  return output;
}

function sanitizeItemValue(value: unknown, depth: number): unknown {
  if (depth > 5) return undefined;
  if (typeof value === "string") return value.slice(0, 4000);
  if (typeof value === "number" || typeof value === "boolean" || value === null) return value;
  if (Array.isArray(value)) return value.slice(0, 100).map((entry) => sanitizeItemValue(entry, depth + 1)).filter((entry) => entry !== undefined);
  if (value && typeof value === "object") return sanitizeItemPayload(value as Record<string, unknown>);
  return undefined;
}

function safeAssistantText(value: unknown): string {
  if (typeof value !== "string") return "";
  const text = value.replace(/\s+/g, " ").trim();
  if (!text || /(?:system prompt|系统提示词|chain[- ]?of[- ]?thought|思维链|bearer\s+|sk-[a-z0-9_-]{12,}|password|authorization)/i.test(text)) return "";
  return text;
}

function safeGateRequest(value: unknown): Record<string, unknown> {
  const request = record(value);
  const output: Record<string, unknown> = {};
  for (const key of ["userVisibleName", "message", "action", "description"]) {
    if (typeof request[key] === "string") output[key] = String(request[key]).slice(0, 1000);
  }
  return output;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function recordOrUndefined(value: unknown): Record<string, unknown> | undefined {
  const next = record(value);
  return Object.keys(next).length > 0 ? next : undefined;
}

function stringOrUndefined(value: unknown): string | undefined {
  return typeof value === "string" && value ? value : undefined;
}

function safeIdentifier(value: unknown): string {
  return typeof value === "string" ? value.replace(/[^a-zA-Z0-9_.:-]/g, "").slice(0, 80) : "";
}

function validTime(value: unknown): string {
  if (typeof value === "string" && !Number.isNaN(Date.parse(value))) return value;
  return new Date(0).toISOString();
}

function gateStatus(value: unknown): ConversationProjectionGate["status"] {
  return value === "approved" || value === "denied" || value === "expired" || value === "cancelled" ? value : "pending";
}

function hashText(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) hash = Math.imul(hash ^ value.charCodeAt(index), 16777619);
  return (hash >>> 0).toString(16);
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}
