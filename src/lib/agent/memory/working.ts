/**
 * Working Memory — keeps the most recent N turns in context.
 * Replaces simple truncation with a clean extraction function.
 */

export function buildWorkingContext(
  messages: { role: string; content: string }[],
  keepLast = 10,
): { role: string; content: string }[] {
  if (messages.length <= keepLast) return messages;
  return messages.slice(-keepLast);
}

/** Count user messages (for summarization threshold detection) */
export function countUserMessages(
  messages: { role: string; content: string }[],
): number {
  return messages.filter((m) => m.role === "user").length;
}
