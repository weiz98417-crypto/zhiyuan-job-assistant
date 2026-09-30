import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { build } from "esbuild";

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

/** Bundle the exact local projection source. Nothing is written to disk. */
export async function loadConversationProjector(projectionRoot = process.cwd()) {
  const root = path.resolve(projectionRoot);
  const entry = path.join(root, "src", "lib", "agent", "item-projection.ts");
  if (!fs.existsSync(entry)) throw new Error(`projection source missing: ${entry}`);
  const result = await build({
    absWorkingDir: root,
    entryPoints: [entry],
    bundle: true,
    format: "esm",
    platform: "node",
    write: false,
    logLevel: "silent",
    tsconfig: path.join(root, "tsconfig.json"),
  });
  const source = result.outputFiles[0]?.text;
  if (!source) throw new Error("projection bundle is empty");
  const projectorModule = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
  if (typeof projectorModule.projectConversationItems !== "function") throw new Error("projectConversationItems export missing");
  return { projectConversationItems: projectorModule.projectConversationItems, sourceSha256: sha256(source), sourceRoot: root };
}

/** Keep the response aligned with /api/agent/runs/[id]/items. */
export function latestAssistantText(context) {
  const messages = context?.conversationMessages;
  if (!Array.isArray(messages)) return undefined;
  const assistant = [...messages].reverse().find((message) => (
    message && typeof message === "object" && !Array.isArray(message)
    && message.role === "assistant" && typeof message.content === "string"
  ));
  return assistant ? String(assistant.content || "") : undefined;
}

export function replayItemEvidence(input) {
  const { projectConversationItems, runId, conversationId, ownerId, events, checkpointContext } = input;
  const projectionInput = {
    conversationId,
    runId,
    ownerId,
    events,
    assistantText: latestAssistantText(checkpointContext),
  };
  const first = projectConversationItems(projectionInput);
  const second = projectConversationItems(projectionInput);
  const firstHash = sha256(JSON.stringify(first));
  const secondHash = sha256(JSON.stringify(second));
  return {
    runId,
    conversationId,
    source: "db_events_checkpoint_local_source_replay",
    apiVerified: false,
    eventCount: events.length,
    checkpointPresent: checkpointContext !== undefined,
    itemCount: first.length,
    itemIds: first.map((item) => item.itemId),
    items: first.map((item) => ({
      itemId: item.itemId,
      type: item.type,
      displayState: item.displayState,
      eventCursor: item.eventCursor ?? null,
      payloadSha256: sha256(JSON.stringify(item.payload)),
      itemSha256: sha256(JSON.stringify(item)),
      ...(item.artifactRef ? { artifactRef: item.artifactRef } : {}),
    })),
    projectionSha256: firstHash,
    replayStable: firstHash === secondHash,
  };
}
