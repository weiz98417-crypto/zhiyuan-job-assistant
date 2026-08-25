import { callDeepSeekJson, parseJsonResponse } from "@/lib/stream-utils";

export interface PipelineHealthApplication {
  company: string;
  role: string;
  status: string;
  daysSinceApplied: number;
  daysSinceLastActivity: number;
}

export interface PipelineHealthInput {
  applications: PipelineHealthApplication[];
}

export interface PipelineHealthThresholds {
  evalWarningPct: number;
  evalDangerPct: number;
  zeroReplyCount: number;
  staleDays: number;
}

export interface PipelineHealthResult {
  status: "green" | "yellow" | "red" | "gray";
  score: number;
  issues: string[];
  suggestions: string[];
}

const DEFAULT_THRESHOLDS: PipelineHealthThresholds = {
  evalWarningPct: 70,
  evalDangerPct: 80,
  zeroReplyCount: 5,
  staleDays: 14,
};

export async function analyzePipelineHealth(
  pipeline: PipelineHealthInput,
  thresholds?: Partial<PipelineHealthThresholds>,
  signal?: AbortSignal,
): Promise<PipelineHealthResult> {
  const applications = Array.isArray(pipeline?.applications) ? pipeline.applications : [];
  if (!applications.length) {
    return {
      status: "gray",
      score: 0,
      issues: ["暂无投递数据，开始你的第一个申请吧"],
      suggestions: ["去评估一个 JD，开启求职之旅"],
    };
  }
  const configured = { ...DEFAULT_THRESHOLDS, ...thresholds };
  const applicationText = applications.map((application) =>
    `${application.company} - ${application.role}：${application.status}（投递 ${application.daysSinceApplied} 天，上次活动 ${application.daysSinceLastActivity} 天前）`,
  ).join("\n");
  const content = await callDeepSeekJson({
    messages: [
      {
        role: "system",
        content: `你是 Pipeline 健康度分析师。评估用户的求职 Pipeline 健康状态。

检查漏斗分布、阶段转化率、长期未更新的停滞风险和方向集中度。

告警阈值：
- 初筛阶段占比 ≥ ${configured.evalWarningPct}% 触发黄色警告
- 初筛阶段占比 ≥ ${configured.evalDangerPct}% 触发红色告警
- 某方向连续 ${configured.zeroReplyCount}+ 次零回复触发红色告警
- 申请超过 ${configured.staleDays} 天无活动视为停滞

返回 JSON：
{"status":"green","score":80,"issues":["具体问题"],"suggestions":["改进建议"]}
status 只能是 green、yellow、red、gray；score 为 0-100；只用中文。`,
      },
      { role: "user", content: `Pipeline 状态：\n${applicationText}` },
    ],
    temperature: 0.3,
    max_tokens: 2000,
    signal,
  });
  const parsed = parseJsonResponse(content);
  const rawStatus = String(parsed.status || "gray");
  const status = ["green", "yellow", "red", "gray"].includes(rawStatus)
    ? rawStatus as PipelineHealthResult["status"]
    : "gray";
  return {
    status,
    score: Number.isFinite(Number(parsed.score)) ? Math.max(0, Math.min(100, Number(parsed.score))) : 0,
    issues: stringArray(parsed.issues),
    suggestions: stringArray(parsed.suggestions),
  };
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String).map((item) => item.trim()).filter(Boolean) : [];
}
