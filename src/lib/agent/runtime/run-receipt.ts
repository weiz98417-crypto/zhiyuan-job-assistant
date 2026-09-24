import type { AgentRunSnapshot } from "@/lib/agent/runtime/durable-agent-run";

export function runReceipt(run: AgentRunSnapshot): AgentRunSnapshot {
  const contract = run.contract && typeof run.contract === "object" && !Array.isArray(run.contract)
    ? run.contract as Record<string, unknown>
    : {};
  const journey = contract.journey && typeof contract.journey === "object" && !Array.isArray(contract.journey)
    ? contract.journey as Record<string, unknown>
    : {};
  const artifacts = Array.isArray(journey.artifacts)
    ? journey.artifacts.slice(-12).filter((item) => item && typeof item === "object" && !Array.isArray(item)).map((item) => {
        const artifact = item as Record<string, unknown>;
        return {
          artifactId: String(artifact.artifactId || "").slice(0, 128),
          kind: String(artifact.kind || "").slice(0, 64),
          version: String(artifact.version || "").slice(0, 64),
          hash: String(artifact.hash || "").slice(0, 128),
        };
      })
    : [];

  return {
    id: run.id,
    userId: run.userId,
    conversationId: run.conversationId,
    requestId: run.requestId,
    taskType: run.taskType,
    agentId: run.agentId,
    status: run.status,
    snapshotVersion: run.snapshotVersion,
    eventCursor: run.eventCursor,
    contract: { journey: { graphVersion: String(journey.graphVersion || "").slice(0, 64), artifacts } },
    budgets: {},
    lastObservation: {},
    error: {},
    runtimeMode: run.runtimeMode,
    parentRunId: run.parentRunId,
    depth: run.depth,
    ownerId: run.ownerId,
    fencingToken: run.fencingToken,
    heartbeatAt: run.heartbeatAt,
    leaseExpiresAt: run.leaseExpiresAt,
    createdAt: run.createdAt,
    updatedAt: run.updatedAt,
  };
}
