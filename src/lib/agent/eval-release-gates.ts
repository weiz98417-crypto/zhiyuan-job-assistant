import { stableContentHash } from "@/lib/agent/verified-action";
import { projectConversationItems, type ConversationItem, type ConversationItemProjectionInput } from "@/lib/agent/item-projection";

export type AgentEvalLayer = "A" | "B" | "C" | "D" | "E" | "F" | "G" | "H";

export interface AgentEvalLayerResult {
  layer: AgentEvalLayer;
  passed: boolean;
  deterministic: boolean;
  failures: string[];
  score?: number | null;
  evidence?: Record<string, unknown>;
}

export interface AgentReleaseManifestEntry {
  module: "run-admission" | "run-continuation" | "task-program" | "item-projection" | "runtime" | "browser" | "journey" | "production-replay";
  program?: string;
  requiredLayers: AgentEvalLayer[];
  fixtureIds: string[];
  commandCategories: string[];
  environment: "unit" | "memory" | "postgres" | "staging" | "browser" | "production-replay";
  owner: string;
}

export interface AgentReleaseManifest {
  version: string;
  codeCommit: string;
  programVersions: Record<string, string>;
  entries: AgentReleaseManifestEntry[];
}

export interface AgentReleaseGateResult {
  passed: boolean;
  hardFailures: string[];
  qualityWarnings: string[];
  missingEvidence: string[];
  layerResults: AgentEvalLayerResult[];
}

export const REQUIRED_AGENT_EVAL_LAYERS: AgentEvalLayer[] = ["A", "B", "C", "D", "E", "F", "G", "H"];

export function validateAgentReleaseManifest(manifest: AgentReleaseManifest): string[] {
  const failures: string[] = [];
  if (!manifest.version.trim()) failures.push("manifest.version_required");
  if (!manifest.codeCommit.trim()) failures.push("manifest.code_commit_required");
  if (!manifest.entries.length) failures.push("manifest.entries_required");
  manifest.entries.forEach((entry, index) => {
    if (!entry.module) failures.push(`manifest.entry.${index}.module_required`);
    if (!entry.owner.trim()) failures.push(`manifest.entry.${index}.owner_required`);
    if (!entry.fixtureIds.length) failures.push(`manifest.entry.${index}.fixtures_required`);
    if (!entry.requiredLayers.length) failures.push(`manifest.entry.${index}.layers_required`);
    entry.requiredLayers.forEach((layer) => {
      if (!REQUIRED_AGENT_EVAL_LAYERS.includes(layer)) failures.push(`manifest.entry.${index}.unknown_layer:${layer}`);
    });
  });
  return failures;
}

export function aggregateAgentReleaseGates(input: {
  manifest: AgentReleaseManifest;
  results: AgentEvalLayerResult[];
  minimumQualityScore?: number;
}): AgentReleaseGateResult {
  const hardFailures: string[] = [...validateAgentReleaseManifest(input.manifest)];
  const qualityWarnings: string[] = [];
  const missingEvidence: string[] = [];
  const byLayer = new Map(input.results.map((result) => [result.layer, result]));
  const required = new Set(input.manifest.entries.flatMap((entry) => entry.requiredLayers));
  for (const layer of required) {
    const result = byLayer.get(layer);
    if (!result) {
      missingEvidence.push(`layer_missing:${layer}`);
      continue;
    }
    if (!result.passed && result.deterministic) hardFailures.push(...result.failures.map((failure) => `${layer}:${failure}`));
    if (!result.passed && !result.deterministic) qualityWarnings.push(...result.failures.map((failure) => `${layer}:${failure}`));
    if (!result.deterministic && input.minimumQualityScore !== undefined && (result.score ?? 0) < input.minimumQualityScore) {
      qualityWarnings.push(`${layer}:quality_below_threshold`);
    }
  }
  return {
    passed: hardFailures.length === 0 && missingEvidence.length === 0,
    hardFailures: Array.from(new Set(hardFailures)),
    qualityWarnings: Array.from(new Set(qualityWarnings)),
    missingEvidence: Array.from(new Set(missingEvidence)),
    layerResults: input.results.map((result) => ({ ...result, failures: [...result.failures] })),
  };
}

export function replayConversationItemFixture(input: ConversationItemProjectionInput): {
  items: ConversationItem[];
  fixtureHash: string;
  replayStable: boolean;
} {
  const items = projectConversationItems(input);
  const replay = projectConversationItems({ ...input, events: [...(input.events || []), ...(input.events || [])] });
  const firstHash = stableContentHash(items);
  const replayHash = stableContentHash(replay);
  return { items, fixtureHash: firstHash, replayStable: firstHash === replayHash };
}

export function assertAgentReleaseGates(result: AgentReleaseGateResult): void {
  if (!result.passed) {
    throw new Error(`Agent release gates failed: ${[...result.hardFailures, ...result.missingEvidence].join(", ")}`);
  }
}
