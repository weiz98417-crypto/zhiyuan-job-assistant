import type { ToolResult } from "@/lib/agent/tools/types";

export interface ToolPolicyInput {
  toolName: string;
  params: Record<string, unknown>;
  messages: { role: string; content: string }[];
  toolWhitelist?: string[];
}

export const GLOBAL_CONTEXT_TOOLS = new Set([
  "read_file",
  "get_profile",
  "get_recent_jd_context",
  "get_report_detail",
]);

export function isToolAllowedInMode(toolName: string, toolWhitelist?: string[]): boolean {
  if (!toolWhitelist) return true;
  return toolWhitelist.includes(toolName) || GLOBAL_CONTEXT_TOOLS.has(toolName);
}

function normalizeCompanyName(name: string): string {
  const trimmed = name.trim();
  if (/^字节$|ByteDance/i.test(trimmed)) return "字节跳动";
  if (/^阿里$|Alibaba/i.test(trimmed)) return "阿里巴巴";
  return trimmed;
}

export function inferCompanyFromMessages(messages: { role: string; content: string }[]): string | undefined {
  const userTexts = messages.filter((message) => message.role === "user").map((message) => message.content).reverse();
  const known = [
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

  for (const text of userTexts) {
    const explicit = text.match(/(?:公司|企业|雇主)\s*(?:是|为|=|：|:|改成|改为)\s*([^\s，。,.、]{2,30})/);
    if (explicit?.[1]) return normalizeCompanyName(explicit[1].replace(/的?JD$/i, ""));
    for (const [company, pattern] of known) {
      if (pattern.test(text) && /(JD|职位|岗位|公司|评估|报告|面试)/i.test(text)) return company;
    }
  }
  return undefined;
}

function latestUserText(messages: { role: string; content: string }[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "user" && !messages[i].content.startsWith("<!-- tool:")) {
      return messages[i].content || "";
    }
  }
  return "";
}

function hasUrl(text: string): boolean {
  return /https?:\/\/\S+/i.test(text);
}

function isEvaluateAgent(toolWhitelist?: string[]): boolean {
  return !!toolWhitelist?.includes("evaluate_jd_full");
}

function isInterviewAgent(toolWhitelist?: string[]): boolean {
  return !!toolWhitelist?.includes("generate_interview_questions") || !!toolWhitelist?.includes("prepare_interview_full");
}

function explicitlyAskedForWeb(text: string): boolean {
  return /(联网|网上|网络|搜索|查一下.*(官网|公开信息|新闻|面经|薪资|公司背景|部门)|面经)/.test(text);
}

export function enforceToolPolicy(input: ToolPolicyInput): ToolResult | null {
  const userText = latestUserText(input.messages);

  if ((isEvaluateAgent(input.toolWhitelist) || isInterviewAgent(input.toolWhitelist)) && input.toolName === "web_search" && !explicitlyAskedForWeb(userText)) {
    return {
      success: false,
      data: null,
      error: "当前 Agent 禁止主动联网搜索。只有用户明确要求查公开信息/面经/最新信息时才允许搜索。",
      errorCategory: "need_user_input",
      llmSummary: "不要联网搜索。请优先使用会话里已有 JD、最近保存的 JD/报告、我的简历；如果确实缺 JD，请让用户粘贴 JD。",
    };
  }

  if (input.toolName === "fetch_jd_content" && !hasUrl(userText)) {
    return {
      success: false,
      data: null,
      error: "用户这一轮没有提供新的 JD 链接，不能臆造或复用不可访问链接去抓取。",
      errorCategory: "need_user_input",
      llmSummary: "不要抓取链接。若用户说'这份JD/刚才那个JD'，请先使用 get_recent_jd_context 或 get_report_detail 读取本地已保存内容；读不到再请用户粘贴 JD 文本。",
    };
  }

  if (input.toolName === "evaluate_jd_full") {
    const jdText = typeof input.params.jd_text === "string" ? input.params.jd_text.trim() : "";
    const jdUrl = typeof input.params.jd_url === "string" ? input.params.jd_url.trim() : "";
    const images = Array.isArray(input.params.images) ? input.params.images : [];
    if (!jdText && !jdUrl && images.length === 0 && !/(刚才|这份|这个|上面|已保存|报告|JD|jd)/.test(userText)) {
      return {
        success: false,
        data: null,
        error: "缺少 JD 内容，不能启动完整评估。",
        errorCategory: "need_user_input",
        llmSummary: "启动完整评估前必须有 JD 文本、JD 链接、截图，或明确引用最近已保存的 JD。",
      };
    }
  }

  return null;
}
