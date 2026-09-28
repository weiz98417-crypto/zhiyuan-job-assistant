import { AgentItemAssembler } from "@/lib/agent/item-projection";

export function accumulateDurableTextEvent(input: {
  assembler: AgentItemAssembler | null;
  runId: string;
  sequence: number;
  event: Record<string, unknown>;
  currentText: string;
}): { content: string; itemId: string } | null {
  const text = typeof input.event.content === "string" ? input.event.content : "";
  if (!text) return null;
  const item = input.assembler?.apply({
    cursor: input.sequence,
    type: "delta",
    itemId: `run:${input.runId}:assistant`,
    content: text,
  });
  if (!item) return null;
  return {
    content: `${input.currentText}${text}`.slice(0, 20_000),
    itemId: item.itemId,
  };
}
