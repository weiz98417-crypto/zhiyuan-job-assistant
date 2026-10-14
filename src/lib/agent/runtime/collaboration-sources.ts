import { createHash } from "crypto";
import type { AgentRunCheckpoint, AgentRunFactReference, AgentRunSnapshot } from "@/lib/agent/runtime/durable-agent-run";

export interface CollaborationSourceContent { id: string; content: string; contentHash: string }

export async function readCollaborationSources(run: AgentRunSnapshot, checkpoint: AgentRunCheckpoint,
  refs: AgentRunFactReference[]): Promise<CollaborationSourceContent[]> {
  const sources: CollaborationSourceContent[] = [];
  for (const ref of refs) {
    if (!ref.hash || !ref.version) throw new Error("协作来源缺少版本或 hash");
    if (ref.type === "attachment") {
      const material = record(checkpoint.context.attachmentMaterial);
      const images = material.images;
      const intake = record(material.intake);
      if (material.id !== ref.id || material.runId !== run.id || material.userId !== run.userId
        || ref.version !== "v1" || !Array.isArray(images) || !images.length || images.some((entry) => typeof entry !== "string")
        || digest(images.join("\n")) !== ref.hash || material.sourceHash !== ref.hash
        || typeof intake.extractedText !== "string" || !intake.extractedText.trim()) {
        throw new Error("协作来源的 owner、版本或 hash 已变更");
      }
      sources.push(content(ref.id, intake.extractedText));
    } else if (ref.type === "tool_attempt") {
      const { PostgresRunContextSource } = await import("@/lib/agent/runtime/postgres-run-context-source");
      const current = await new PostgresRunContextSource().load({ userId: run.userId }, run.id);
      if (!current.factRefs.some((candidate) => candidate.id === ref.id && candidate.hash === ref.hash && candidate.version === ref.version)) {
        throw new Error("协作工具来源已变更或归属不一致");
      }
      const fact = current.completedToolFacts.find((entry) => entry.sourceRef?.id === ref.id
        && entry.sourceRef.hash === ref.hash && entry.sourceRef.version === ref.version);
      if (!fact) throw new Error("协作工具来源缺少对应结果");
      sources.push(content(ref.id, fact.summary));
    } else {
      throw new Error("协作来源类型尚无独立 owner/hash 校验，不能交接或委派");
    }
  }
  return sources;
}

function content(id: string, value: string): CollaborationSourceContent {
  if (value.length > 16_000) throw new Error("协作来源超过材料预算，必须先缩小研究范围");
  return { id, content: value, contentHash: digest(value) };
}
function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function digest(value: string): string { return createHash("sha256").update(value).digest("hex"); }
