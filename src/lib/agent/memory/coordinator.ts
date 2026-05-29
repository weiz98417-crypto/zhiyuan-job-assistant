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
  agentStateInjection: string;
}

export interface AgentContextState {
  latestJD?: { reportNum?: number; company?: string; role?: string; bodyPreview: string };
  latestReport?: { reportNum: number; company?: string; role?: string };
  targetCompany?: string;
  resumeMentioned: boolean;
  supplementalFacts: string[];
}

function cleanInline(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function normalizeCompanyName(name: string): string {
  const trimmed = name.trim();
  if (/^字节$|ByteDance/i.test(trimmed)) return "字节跳动";
  if (/^阿里$|Alibaba/i.test(trimmed)) return "阿里巴巴";
  return trimmed;
}

export function buildAgentContextState(messages: { role: string; content: string }[]): AgentContextState {
  const userText = messages.filter((message) => message.role === "user").map((message) => message.content);
  const allText = messages.map((message) => message.content).join("\n");
  const reportMatch = [...allText.matchAll(/报告(?:编号)?[：:\s#]*(\d+)/g)].at(-1);
  const companyFacts = userText
    .filter((text) => /(公司是|这是.*JD|这个JD.*是|公司改成|公司改为)/i.test(text))
    .slice(-3)
    .map((text) => cleanInline(text).slice(0, 180));
  const knownCompanies = [
    ["字节跳动", /字节|ByteDance/i],
    ["阿里巴巴", /阿里|Alibaba/i],
    ["腾讯", /腾讯|Tencent/i],
    ["百度", /百度|Baidu/i],
    ["美团", /美团|Meituan/i],
    ["小米", /小米|Xiaomi/i],
    ["京东", /京东|JD\.com/i],
    ["拼多多", /拼多多|PDD/i],
    ["快手", /快手|Kuaishou/i],
    ["小红书", /小红书|Xiaohongshu/i],
    ["华为", /华为|Huawei/i],
  ] as const;
  let targetCompany: string | undefined;
  for (let i = userText.length - 1; i >= 0 && !targetCompany; i--) {
    const text = userText[i];
    const explicit = text.match(/(?:公司|企业|雇主)\s*(?:是|为|=|：|:|改成|改为)\s*([^\s，。,.、]{2,30})/);
    if (explicit?.[1]) targetCompany = normalizeCompanyName(explicit[1].replace(/的?JD$/i, ""));
    for (const [company, pattern] of knownCompanies) {
      if (!targetCompany && pattern.test(text) && /(JD|职位|岗位|公司|评估|报告|面试)/i.test(text)) targetCompany = company;
    }
  }

  let jdBody = "";
  for (let i = userText.length - 1; i >= 0; i--) {
    const text = userText[i];
    if (text.length >= 80 && /(JD|岗位|职位|职责|要求|任职|加分|实习)/i.test(text)) {
      jdBody = text;
      break;
    }
  }

  return {
    latestJD: jdBody ? { bodyPreview: cleanInline(jdBody).slice(0, 1200) } : undefined,
    latestReport: reportMatch ? { reportNum: Number(reportMatch[1]) } : undefined,
    targetCompany,
    resumeMentioned: userText.some((text) => /(我的)?(简历|CV|履历)/i.test(text)),
    supplementalFacts: companyFacts,
  };
}

export function formatAgentContextState(state: AgentContextState): string {
  const lines = ["## AgentContextState"];
  if (state.latestJD) lines.push(`- 最近一次会话 JD 摘要: ${state.latestJD.bodyPreview}`);
  if (state.latestReport) lines.push(`- 最近一次报告编号: ${state.latestReport.reportNum}`);
  if (state.targetCompany) lines.push(`- 用户补充/推断的目标公司: ${state.targetCompany}`);
  lines.push(`- 用户是否提到要结合简历: ${state.resumeMentioned ? "是" : "否"}`);
  if (state.supplementalFacts.length) lines.push(`- 用户后续补充: ${state.supplementalFacts.join(" | ")}`);
  lines.push("- 先读本地 JD/报告/简历状态，再决定是否调用工具；不要把“没看见”当成默认结论。");
  return lines.join("\n");
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
  const agentStateInjection = formatAgentContextState(buildAgentContextState(messages));

  return { truncatedMessages, summaryInjection, semanticInjection, agentStateInjection };
}
