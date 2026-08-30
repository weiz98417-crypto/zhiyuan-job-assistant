import type { UserSafeToolView, AgentSurfaceEvent } from "@/lib/agent/surface-projection";

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
