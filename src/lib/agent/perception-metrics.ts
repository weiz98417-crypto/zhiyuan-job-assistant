/**
 * 感知指标词汇(spec 33 leaf 常量):纯数据、零依赖,客户端/服务端共用。
 * 服务端写入通道(src/lib/server/perception-events.ts)与客户端仪表盘都从这里取,
 * 加指标只改这一处+对应 label。
 */
export const PERCEPTION_METRICS = [
  "fact_gate_repair",
  "score_evidence_expand",
  "sourced_jd_follow_through",
  "question_source_followup",
] as const;

export type PerceptionMetric = (typeof PERCEPTION_METRICS)[number];

export const PERCEPTION_METRIC_LABELS: Record<string, string> = {
  fact_gate_repair: "事实门拦截后修复",
  score_evidence_expand: "评分依据展开",
  sourced_jd_follow_through: "带来源评估后跟进",
  question_source_followup: "带出处题追问",
};
