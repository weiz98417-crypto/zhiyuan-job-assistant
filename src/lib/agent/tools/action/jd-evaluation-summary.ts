/**
 * JD 评估的用户侧摘要格式化（原 client-runner 版本，M1 迁移至此）。
 *
 * 与 evaluate-jd-full.ts 的 formatResult 分工不同：formatResult 面向 LLM
 * （指导模型生成 ≤6 行摘要），本文件面向用户可见的结构化摘要文本。
 */

type JDEvalBlock = { content?: string; score?: number | string };
type JDRiskSignal = { signal?: unknown; excerpt?: unknown; severity?: unknown };

const JD_SUMMARY_BLOCK_LABELS: Record<string, string> = {
  a: "A 职位概览",
  b: "B 简历匹配",
  c: "C 职级与策略",
  d: "D 薪资与市场",
  e: "E 定制化方案",
  f: "F 面试准备",
  g: "G 职位合法性",
};

function numericScore(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function cleanBlockLine(content: string): string {
  const tableCandidate = pickTableCandidate(content);
  const lines = content
    .split(/\r?\n/)
    .map((line) => normalizeSummaryLine(line))
    .filter(Boolean)
    .filter((line) => !isNoiseSummaryLine(line));
  const picked = tableCandidate || lines[0] || "";
  return truncateSummaryLine(picked);
}

function isNoiseSummaryLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return true;
  if (/^\|.*\|$/.test(trimmed)) return true;
  if (/^\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)+\|?$/.test(trimmed)) return true;
  if (/^A-G|^评分|^得分|^Score/i.test(trimmed)) return true;
  if (/^(好的|已完成|我已完成|作为AI求职评估引擎|以下是|下面是)/.test(trimmed)) return true;
  if (/修改前.*修改后.*原因/.test(trimmed)) return true;
  if (/^(题型|考察点|JD\s*关联|简历关联|面试准备建议)[:：]/i.test(trimmed)) return true;
  return false;
}

function normalizeSummaryLine(line: string): string {
  return line
    .replace(/^[-*#>\s]+/, "")
    .replace(/\*\*/g, "")
    .replace(/^#+\s*/, "")
    .trim();
}

function truncateSummaryLine(line: string, max = 70): string {
  const clean = line.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max)}...` : clean;
}

function pickTableCandidate(content: string): string {
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!/^\|.*\|$/.test(line)) continue;
    const cells = line
      .slice(1, -1)
      .split("|")
      .map((cell) => cell.replace(/\*\*/g, "").trim())
      .filter(Boolean);
    if (cells.length < 2) continue;
    if (cells.every((cell) => /^:?-{2,}:?$/.test(cell))) continue;
    const joined = cells.join(" ");
    if (/修改前.*修改后.*原因/.test(joined)) continue;
    if (/^(字段|维度|项目|JD要求|要求|问题|场景)$/.test(cells[0]) && /^(内容|分析|匹配|建议|原因|回答)$/.test(cells[1])) continue;

    const candidate = cells.length === 2
      ? `${cells[0]}：${cells[1]}`
      : cells.slice(0, 3).join("；");
    if (!isNoiseSummaryLine(candidate)) return candidate;
  }
  return "";
}

function blockSummaryFallback(blockKey: string): string {
  const fallback: Record<string, string> = {
    a: "职位基础信息已提取，需核对公司、岗位、领域与工作模式。",
    b: "需要结合简历判断核心要求、证据强弱和主要能力缺口。",
    c: "需要确认岗位职级、经验年限和候选人当前阶段是否匹配。",
    d: "薪资范围、奖金、五险一金和加班强度仍需进一步核实。",
    e: "简历需要围绕 JD 关键词、项目证据和量化结果做定制化表达。",
    f: "面试应重点准备岗位核心能力、缺口解释和 STAR 项目故事。",
    g: "需要核实职位真实性、用工形式、隐性强度和招聘风险。",
  };
  return fallback[blockKey] || "该维度已完成评估，建议查看完整报告确认细节。";
}

function formatBlockSummary(blockKey: string, value: JDEvalBlock | string | undefined): string {
  const block = typeof value === "string" ? { content: value } : value;
  const score = numericScore(block?.score);
  const scoreText = score === null ? "" : `（${Number(score.toFixed(1))}/5）`;
  const content = typeof block?.content === "string" ? cleanBlockLine(block.content) : "";
  return `${JD_SUMMARY_BLOCK_LABELS[blockKey]}${scoreText}：${content || blockSummaryFallback(blockKey)}`;
}

function formatRiskSignals(data: Record<string, unknown>): string[] {
  const raw = Array.isArray(data.risks) ? data.risks : Array.isArray(data.riskSignals) ? data.riskSignals : [];
  const signals = raw
    .map((item) => {
      const risk = (item && typeof item === "object" ? item : {}) as JDRiskSignal;
      const signal = typeof risk.signal === "string" ? risk.signal.trim() : "";
      const excerpt = typeof risk.excerpt === "string" ? risk.excerpt.trim() : "";
      const severity = typeof risk.severity === "string" ? risk.severity.trim() : "";
      if (!signal) return "";
      const label = severity === "critical" ? "严重" : severity === "high" ? "高风险" : severity === "medium" ? "中风险" : "提示";
      return `${label}：${signal}${excerpt ? `（${truncateSummaryLine(excerpt, 34)}）` : ""}`;
    })
    .filter(Boolean)
    .slice(0, 3);
  return signals.length > 0 ? signals : ["暂未命中已知招聘黑话/风险词，但仍建议面试核验工作强度、用工形式和薪资结构。"];
}

function blockRiskFallback(blockKey: string): string {
  const fallback: Record<string, string> = {
    a: "公司与岗位信息仍需确认真实性和稳定性。",
    b: "岗位描述里可能存在强度、合规或隐性要求风险。",
    c: "你的经历与 JD 核心要求之间可能存在明显差距。",
    d: "薪资、职级或发展空间需要进一步确认。",
    e: "岗位能力模型与现有背景的迁移成本需要评估。",
    f: "投递策略需要结合你的优先级再判断。",
    g: "需要补充关键信息后再做最终决策。",
  };
  return fallback[blockKey] || "该维度存在不确定性，建议面试前重点核实。";
}

export function formatJDEvaluationSummary(data: Record<string, unknown>): string {
  const company = String(data.company || "未知公司");
  const role = String(data.role || "未知岗位");
  const score = numericScore(data.overallScore);
  const scoreText = score === null ? "已生成" : `${Number(score.toFixed(1))}/5`;
  const verdict = score === null
    ? "已完成评估"
    : score >= 4.2
      ? "建议投递"
      : score >= 3.5
        ? "可以投递，但需要确认风险"
        : score >= 2.5
          ? "谨慎投递"
          : "不建议投递";
  const archetype = data.archetype ? ` · ${String(data.archetype)}` : "";
  const reportNum = data.reportNum ? `报告 #${String(data.reportNum).padStart(3, "0")}` : "报告已保存";
  const blocks = (data.blocks && typeof data.blocks === "object" ? data.blocks : {}) as Record<string, JDEvalBlock | string>;
  const blockLines = Object.keys(JD_SUMMARY_BLOCK_LABELS).map((key) => formatBlockSummary(key, blocks[key]));
  const riskLines = formatRiskSignals(data);

  return [
    "## JD 评估摘要",
    "",
    `结论：${verdict}（总分 ${scoreText}）`,
    `岗位：${company} — ${role}${archetype}`,
    "",
    "A-G 速览：",
    ...blockLines.map((line) => `- ${line}`),
    "",
    "行业黑话 / 风险扫描：",
    ...riskLines.map((line) => `- ${line}`),
    "",
    `${reportNum}，完整 A-G 报告已保存，可在报告库或 JD 管理查看，也可下载 PDF。`,
  ].join("\n");
}
