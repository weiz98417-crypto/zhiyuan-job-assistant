/* ── localStorage → DexieDB migration ── */

import db from "@/lib/db";
import type { AgentInteraction } from "@/types";

const LEGACY_KEY = "zhiyuan-explore-chat";
const MIGRATION_DONE_KEY = "zhiyuan-explore-migrated-v2";

interface LegacyMessage {
  role: "user" | "assistant";
  content: string;
}

interface LegacyData {
  messages?: LegacyMessage[];
  profile?: unknown;
}

export async function migrateExploreToAgent(): Promise<boolean> {
  // Already done
  if (localStorage.getItem(MIGRATION_DONE_KEY)) return false;

  try {
    const raw = localStorage.getItem(LEGACY_KEY);
    if (!raw) {
      localStorage.setItem(MIGRATION_DONE_KEY, "1");
      return false;
    }

    const parsed: LegacyData = JSON.parse(raw);
    const messages = parsed.messages;
    if (!messages || messages.length === 0) {
      localStorage.setItem(MIGRATION_DONE_KEY, "1");
      localStorage.removeItem(LEGACY_KEY);
      return false;
    }

    // Import as AgentInteraction entries (one per user message)
    let imported = 0;
    for (const msg of messages) {
      if (msg.role !== "user") continue;

      try {
        await db.agentInteractions.add({
          timestamp: new Date(),
          trigger: "user_query",
          contextSnapshot: {
            profileVersion: "migrated-v2",
            pipelineSummary: "",
            recentActivityCount: 0,
          },
          reasoning: {
            thought: "",
            toolsConsidered: [],
            toolsUsed: [],
          },
          output: {
            type: "answer",
            summary: msg.content,
          },
        } as AgentInteraction);
        imported++;
      } catch {
        /* skip duplicates */
      }
    }

    // Clean up
    localStorage.removeItem(LEGACY_KEY);
    localStorage.setItem(MIGRATION_DONE_KEY, "1");

    return imported > 0;
  } catch {
    // Best-effort: don't block page
    try {
      localStorage.setItem(MIGRATION_DONE_KEY, "1");
    } catch {
      /* ignore */
    }
    return false;
  }
}
