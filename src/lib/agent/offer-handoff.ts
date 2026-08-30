export type OfferHandoffIntent = "negotiate" | "ask_hr" | "explain";

export function buildOfferAgentHandoffUrl(
  reportId: number,
  intent: OfferHandoffIntent,
  sessionId: number,
): string {
  const params = new URLSearchParams();
  params.set("sessionId", String(sessionId));
  params.set("offerReportId", String(reportId));
  params.set("intent", intent);
  return `/agent?${params.toString()}`;
}
