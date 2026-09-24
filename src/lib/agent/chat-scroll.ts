interface ChatTranscriptPosition {
  sessionId: number | null;
  userMessageCount: number;
}

interface ChatScrollMetrics {
  scrollHeight: number;
  scrollTop: number;
  clientHeight: number;
}

export function isNearChatBottom(metrics: ChatScrollMetrics, threshold = 96): boolean {
  return metrics.scrollHeight - metrics.scrollTop - metrics.clientHeight <= threshold;
}

export function shouldFollowChatScroll(
  previous: ChatTranscriptPosition | null,
  current: ChatTranscriptPosition,
  nearBottom: boolean,
): boolean {
  return nearBottom || previous?.sessionId !== current.sessionId ||
    (previous !== null && current.userMessageCount > previous.userMessageCount);
}
