/**
 * Memory Coordinator — orchestrates the three memory layers.
 * Replaces getSessionContext() in orchestrator with intelligent context building.
 */

import { buildWorkingContext } from "./working";
import { shouldSummarize, generateSummary, saveSummary, loadSummary } from "./episodic";
import { loadSemanticContext } from "./semantic";

export interface MemoryContext {
  truncatedMessages: { role: string; content: string }[];
  summaryInjection: string;
  semanticInjection: string;
}

/**
 * Build optimized context for the agent.
 * 1. Working memory: last 10 turns
 * 2. Episodic: summary of older turns (if conversation > 15 user messages)
 * 3. Semantic: cross-session facts from previous conversations
 */
export async function buildContext(
  sessionId: number | null,
  messages: { role: string; content: string }[],
): Promise<MemoryContext> {
  // Working memory
  const truncatedMessages = buildWorkingContext(messages, 10);

  // Episodic memory
  let summaryInjection = "";
  if (shouldSummarize(messages)) {
    // Check if we already have a summary
    if (sessionId) {
      summaryInjection = await loadSummary(sessionId);
    }

    // Generate new summary if none exists
    if (!summaryInjection) {
      const earlyMessages = messages.slice(0, 5); // Summarize first 5 turns
      const summary = await generateSummary(earlyMessages);
      if (summary) {
        summaryInjection = `[摘要] ${summary}`;
        if (sessionId) {
          saveSummary(sessionId, summary).catch(() => {});
        }
      }
    }
  }

  // Semantic memory (cross-session)
  const semanticInjection = await loadSemanticContext();

  return { truncatedMessages, summaryInjection, semanticInjection };
}
