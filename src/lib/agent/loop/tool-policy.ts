import type { ToolResult } from "@/lib/agent/tools/types";
import type { InterviewQuestionNode, InterviewSessionState, InterviewTurn } from "@/types";
import type { InterviewRebindAction } from "@/lib/agent/interview-rebind-policy";

export interface ToolPolicyInput {
  toolName: string;
  params: Record<string, unknown>;
  messages: { role: string; content: string }[];
  toolWhitelist?: string[];
  interviewState?: InterviewSessionState;
  interviewRebindAction?: InterviewRebindAction;
}

export const GLOBAL_CONTEXT_TOOLS = new Set([
  "read_file",
  "get_profile",
  "get_reference_detail",
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

function hasActiveInterviewSession(state?: InterviewSessionState): state is InterviewSessionState {
  return !!state?.planSnapshot && state.status !== "completed" && state.status !== "abandoned";
}

function explicitlyAskedToRestartInterview(text: string): boolean {
  return /(重新开始|重开|重启|重新模拟|重新出题|重新生成|从头来|新开一场|另开一场|切换.*(重新|重开|重启)|restart|start over|new interview|regenerate)/i.test(text);
}

function asksToContinueInterview(text: string): boolean {
  return /(下一题|下一个|继续|继续问|下一轮|跳过|换一题|next question|continue|skip)/i.test(text);
}

function mentionsMaterialRebindIntent(text: string): boolean {
  const mentionsMaterial = /\bJD\b|岗位|职位|招聘|简历|履历|resume|cv/i.test(text);
  const asksSwitch = /切换|换成|改用|用这份|使用这份|绑定|重新开始|重开|重启|新开|另开|restart|start over|new interview/i.test(text);
  return mentionsMaterial && asksSwitch;
}

function hydrateSingleQuestionFromActiveSession(input: ToolPolicyInput): void {
  const state = input.interviewState;
  if (!hasActiveInterviewSession(state) || input.toolName !== "generate_interview_questions") return;

  input.params.count = 1;
  const plan = state.planSnapshot;
  if (typeof input.params.jdText !== "string" || !input.params.jdText.trim()) {
    input.params.jdText = plan.jdSnapshot?.body || "";
  }
  if (typeof input.params.cvText !== "string" || !input.params.cvText.trim()) {
    input.params.cvText = plan.resumeSnapshot?.body || "";
  }
  if (typeof input.params.company !== "string" || !input.params.company.trim()) {
    input.params.company = plan.jdSnapshot?.company || "";
  }
  if (typeof input.params.role !== "string" || !input.params.role.trim()) {
    input.params.role = plan.jdSnapshot?.role || "";
  }
}

function findQuestionForScoring(state: InterviewSessionState): InterviewQuestionNode | undefined {
  const current = state.currentQuestionId
    ? state.questionGraph.find((node) => node.id === state.currentQuestionId)
    : undefined;
  if (current?.answerTurnIds.length) return current;
  return [...state.questionGraph].reverse().find((node) => node.answerTurnIds.length > 0) || current || state.questionGraph.at(-1);
}

function findAnswerForScoring(
  state: InterviewSessionState,
  question?: InterviewQuestionNode,
): InterviewTurn | undefined {
  if (question?.answerTurnIds.length) {
    const answerIds = new Set(question.answerTurnIds);
    const linked = [...state.transcript].reverse().find((turn) => turn.role === "user" && answerIds.has(turn.id));
    if (linked) return linked;
  }

  return [...state.transcript].reverse().find((turn) =>
    turn.role === "user" && (!question?.id || turn.questionNodeId === question.id || !turn.questionNodeId)
  );
}

function buildInterviewScoreContext(state: InterviewSessionState, question?: InterviewQuestionNode, answer?: InterviewTurn): string {
  const plan = state.planSnapshot;
  return [
    "Active interview scoring context.",
    `Company: ${plan.jdSnapshot?.company || ""}`,
    `Role: ${plan.jdSnapshot?.role || ""}`,
    `Question node: ${question?.id || ""}`,
    `Answer turn: ${answer?.id || ""}`,
    plan.jdSnapshot?.body ? `JD snapshot:\n${plan.jdSnapshot.body.slice(0, 1200)}` : "",
    plan.resumeSnapshot?.body ? `Resume snapshot:\n${plan.resumeSnapshot.body.slice(0, 1200)}` : "",
  ].filter(Boolean).join("\n\n");
}

function hydrateScoreFromActiveSession(input: ToolPolicyInput): ToolResult | null {
  const state = input.interviewState;
  if (!hasActiveInterviewSession(state) || input.toolName !== "score_interview_answer") return null;

  const questionText = typeof input.params.question === "string" ? input.params.question.trim() : "";
  const answerText = typeof input.params.answer === "string" ? input.params.answer.trim() : "";
  const question = findQuestionForScoring(state);
  const answer = findAnswerForScoring(state, question);

  if (!questionText && question?.question) input.params.question = question.question;
  if (!answerText && answer?.content) input.params.answer = answer.content;
  if (typeof input.params.context !== "string" || !input.params.context.trim()) {
    input.params.context = buildInterviewScoreContext(state, question, answer);
  }

  const hydratedQuestion = typeof input.params.question === "string" ? input.params.question.trim() : "";
  const hydratedAnswer = typeof input.params.answer === "string" ? input.params.answer.trim() : "";
  if (!hydratedQuestion || !hydratedAnswer) {
    return {
      success: false,
      data: null,
      error: "No stored interview question/answer is available for scoring yet.",
      errorCategory: "need_user_input",
      llmSummary: "Score only from InterviewSessionState. Do not ask the user to paste previous answers. If no stored answer exists, ask the user to answer the current interview question first.",
    };
  }

  return null;
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

function isOfferAgent(toolWhitelist?: string[]): boolean {
  return !!toolWhitelist?.includes("evaluate_offer");
}

function explicitlyAskedForWeb(text: string): boolean {
  return /(联网|网上|网络|搜索|查一下.*(官网|公开信息|新闻|面经|薪资|公司背景|部门)|面经)/.test(text);
}

export function enforceToolPolicy(input: ToolPolicyInput): ToolResult | null {
  const userText = latestUserText(input.messages);
  const hasActiveInterview = hasActiveInterviewSession(input.interviewState);

  if (hasActiveInterview && input.toolName === "generate_interview_questions") {
    hydrateSingleQuestionFromActiveSession(input);
  }

  if (hasActiveInterview && input.toolName === "score_interview_answer") {
    const scorePolicyResult = hydrateScoreFromActiveSession(input);
    if (scorePolicyResult) return scorePolicyResult;
  }

  if (
    hasActiveInterview &&
    asksToContinueInterview(userText) &&
    input.toolName === "read_file"
  ) {
    return {
      success: false,
      data: null,
      error: "Active interview continuation must use the stored interview session, not reload resume files.",
      errorCategory: "need_user_input",
      llmSummary: "The user asked to continue the active mock interview. Do not read files or ask for company/role again. Use the Active Interview Session planSnapshot and call generate_interview_questions with count=1.",
    };
  }

  if (
    hasActiveInterview &&
    (input.toolName === "prepare_interview_full" || input.toolName === "start_interview_session") &&
    mentionsMaterialRebindIntent(userText) &&
    input.interviewRebindAction !== "auto_restart_interview"
  ) {
    return {
      success: false,
      data: null,
      error: "Material rebinding or restart must pass the interview rebind policy before changing the active session.",
      errorCategory: "need_user_input",
      llmSummary: "Do not start or regenerate a new interview from another JD/resume unless rebind arbitration approved auto_restart_interview. Ask the policy clarification question or keep the current binding.",
    };
  }

  if (
    hasActiveInterview &&
    (input.toolName === "prepare_interview_full" || input.toolName === "start_interview_session") &&
    !explicitlyAskedToRestartInterview(userText)
  ) {
    return {
      success: false,
      data: null,
      error: "Active interview session already has a fixed plan snapshot; do not regenerate a full interview plan.",
      errorCategory: "need_user_input",
      llmSummary: "Active interview session is already bound to stored JD/resume snapshots. Do not call full prep/start-session tools. Continue from the stored transcript, ask exactly one next question, or ask one clarification if the user wants to restart.",
    };
  }

  if ((isEvaluateAgent(input.toolWhitelist) || isInterviewAgent(input.toolWhitelist) || isOfferAgent(input.toolWhitelist)) && input.toolName === "web_search" && !explicitlyAskedForWeb(userText)) {
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
