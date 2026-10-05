/**
 * Spec 30 / WP5：感知事件客户端写入（仅 score_evidence_expand 走此通道；
 * 服务端三指标走 perception-events 模块直写）。fire-and-forget，失败静默。
 */
export function recordPerceptionEvent(metric: string, payload: Record<string, unknown>): void {
  void fetch("/api/perception-events", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ metric, payload }),
    keepalive: true,
  }).catch(() => undefined);
}
