/**
 * 简历产物数字溯源（Spec 24 / ADR-0041 硬门）。
 *
 * 确定性规则：改写产物中出现的每个数字（计数/百分比/金额/年限/年份）必须能在
 * 事实源（原简历全文、参照 JD、用户确认记录）中找到相同的数字串。
 * 找不到 = 编造嫌疑 = 该内容不得进入简历草稿工件，带违规清单反馈重试一次。
 *
 * 匹配语义：提取阿拉伯数字串（全角归一、逗号千分位归一）后做串级比对。
 * 中文数字（「三倍」）不参与——无法确定性判真伪，由 faithfulness 软门兜底。
 * 严格是有意的：模型从「从20到30」推出「提升50%」这类派生数字也算违规，
 * 反馈会明确要求只用原文出现过的数字。
 */

export interface NumberProvenanceViolation {
  /** 违规数字串（归一化后） */
  token: string;
  note: string;
}

export interface NumberProvenanceResult {
  ok: boolean;
  checked: number;
  violations: NumberProvenanceViolation[];
}

/** 全角→半角、千分位逗号去除后的文本。 */
function normalizeDigits(text: string): string {
  return text
    .replace(/[０-９]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
    .replace(/(\d),(?=\d{3}\b)/g, "$1");
}

const NUMBER_TOKEN_RE = /\d+(?:\.\d+)?/g;
/** 产品名/版本号里的数字（GPT-4、GPT-4o、Web3、K8s、A4、v1.5）不是数量，溯源前剥离——否则提到新产品名即整方案被毙。 */
const PRODUCT_VERSION_RE = /[A-Za-z]+-?\d+(?:\.\d+)?[A-Za-z]*/g;
/** 中文数量级单位归一：「800万」与「8,000,000」是同一个数（优化链跨表示匹配的关键）。
 *  交替分支长单位优先（eng 二轮 S2）——「3千万」先匹配「千万」（3e7），不能被「千」截胡成 3000。 */
const CN_UNIT_RE = /(\d+(?:\.\d+)?)(千万|百万|十万|亿|万|千)/g;

/** 提取文本中的数字 token（归一化后）。中文数字与产品名/版本号内嵌数字不参与；万/亿/千折算为位值数字。 */
export function extractNumberTokens(text: string): string[] {
  const cleaned = normalizeDigits(text || "")
    .replace(PRODUCT_VERSION_RE, " ")
    .replace(CN_UNIT_RE, (_match, num: string, unit: string) => {
      const multiplier = unit === "亿" ? 1e8 : unit === "千万" ? 1e7 : unit === "百万" ? 1e6 : unit === "十万" ? 1e5 : unit === "万" ? 1e4 : 1e3;
      const value = parseFloat(num) * multiplier;
      return ` ${value} `;
    });
  return cleaned.match(NUMBER_TOKEN_RE) || [];
}

/** 产物内容对事实源的数字溯源检查。 */
export function checkNumberProvenance(content: string, sources: Array<string | undefined | null>): NumberProvenanceResult {
  const contentTokens = extractNumberTokens(content);
  if (contentTokens.length === 0) return { ok: true, checked: 0, violations: [] };
  const sourceTokenSet = new Set<string>();
  for (const source of sources) {
    if (!source) continue;
    for (const token of extractNumberTokens(source)) sourceTokenSet.add(token);
  }
  const violations: NumberProvenanceViolation[] = [];
  const seen = new Set<string>();
  for (const token of contentTokens) {
    if (sourceTokenSet.has(token) || seen.has(token)) continue;
    seen.add(token);
    violations.push({ token, note: `数字 ${token} 在原简历、JD 或用户确认记录中均未出现` });
  }
  return { ok: violations.length === 0, checked: contentTokens.length, violations };
}

/** 供重试反馈使用的违规清单文本。 */
export function formatProvenanceFeedback(result: NumberProvenanceResult): string {
  const lines = result.violations.map((violation) => `- ${violation.token}（${violation.note}）`);
  return [
    "上一版方案的以下数字无法在事实源（原简历/JD/用户确认记录）中找到出处，属于编造嫌疑：",
    ...lines,
    "请重新生成：只能使用事实源中出现过的数字；确需表达量级时用原文数字，禁止推算新数字。",
  ].join("\n");
}

/** 生成/优化共用的 section 级过滤（纯函数，可测）：通过溯源的 section 保留，违规清单聚合供重试反馈。 */
export function filterSectionsByProvenance<S extends { content: string }>(
  sections: S[],
  sources: Array<string | undefined | null>,
): { passing: S[]; violations: NumberProvenanceViolation[] } {
  const passing: S[] = [];
  const violations: NumberProvenanceViolation[] = [];
  for (const section of sections) {
    const result = checkNumberProvenance(section.content, sources);
    if (result.ok) passing.push(section);
    else violations.push(...result.violations);
  }
  return { passing, violations };
}

/** 单元测试注入点类型：与 model-gateway 的 complete 同形。 */
export type FactualityCompletion = (request: {
  messages: Array<{ role: string; content: string }>;
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
}) => Promise<{ text: string; usage?: { promptTokens?: number; completionTokens?: number; totalTokens?: number } }>;
