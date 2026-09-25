"use client";

/**
 * ToolUI 注册表(0.11.0-D2 任务 3.1/3.2,ADR-0031)。
 *
 * 旧 MessageBubble 的工具分支按 surface-projection 的安全投影类型挂载领域卡;
 * 换芯后该分支成为 assistant-ui 消息渲染的 tools.Override / data 渲染器。
 * 组件本身来自 AgentDomainCards(原样迁出),本文件只做登记与分发。
 */

import { Ban, Check, CheckCircle, FileText, Image as ImageIcon, User, X } from "lucide-react";
import { motion } from "framer-motion";
import { createContext, useContext, type ReactNode } from "react";
import type { ToolCallMessagePartProps } from "@assistant-ui/react";
import type { AgentEventType } from "@/lib/agent/events/dialect";
import {
  AgentDelegationCard,
  AgentHandoffBanner,
  COMPACT_AGENT_CARD_CLASS,
  EvalCompletionNotice,
  EvalConfirmCard,
  InterviewQuestionCard,
  JobDiscoveryBatchCard,
  JobDiscoveryConfirmationCard,
  JobDiscoveryErrorCard,
  JobDiscoveryRunCard,
  OfferResultCard,
  ReportSummaryCard,
  ResumeDocumentCard,
  ResumeDraftCard,
  ResumeEditProposalCard,
  RunGateCard,
  SafeToolStatusView,
  ToolResultCard,
  ApplicationPipelineCard,
} from "../AgentDomainCards";

/** ToolUI 分发可用的动作(page.tsx 既有回调,不新增语义)。 */
export interface AgentShellActions {
  currentSessionId: number | null;
  onSend: (content: string, images?: string[]) => Promise<void>;
  onGateDecision?: (gateId: string, decision: "approved" | "denied") => Promise<void>;
}

export const AgentShellActionsContext = createContext<AgentShellActions>({
  currentSessionId: null,
  onSend: async () => {},
});

export function useAgentShellActions(): AgentShellActions {
  return useContext(AgentShellActionsContext);
}

/** tool-call part 的 result:0.11.0-C 投影后的 safeView(含 uiPayload),兼容遗留原始形态。 */
interface ToolResultShape {
  uiPayload?: Record<string, unknown>;
  success?: boolean;
  status?: unknown;
  summary?: unknown;
  label?: unknown;
}

function normalizeToolResult(result: unknown): {
  payload?: Record<string, unknown>;
  success: boolean;
  summary: string;
} {
  const raw = (result && typeof result === "object" && !Array.isArray(result) ? result : {}) as ToolResultShape;
  const payload = raw.uiPayload && typeof raw.uiPayload === "object" ? raw.uiPayload : undefined;
  const success = typeof raw.success === "boolean" ? raw.success : raw.status === "failed" ? false : true;
  return { payload, success, summary: typeof raw.summary === "string" ? raw.summary : "" };
}

const DATA_QUERY_TOOLS: Record<string, string> = {
  read_file: "已读取文件",
  get_reference_detail: "已读取参考简历",
  search_applications: "已查询投递记录",
  get_recent_activity: "已获取活动",
  get_pipeline_status: "已获取 Pipeline 状态",
  get_recommendations: "已获取推荐",
  check_pipeline_health: "已完成健康检查",
  get_profile_insights: "已完成画像分析",
  detect_skill_gaps: "已完成技能分析",
  check_ats_compatibility: "已完成 ATS 检查",
  decode_black_market_terms: "已解码黑话",
  analyze_jd_risks: "已完成风险扫描",
  web_search: "已完成搜索",
};

/**
 * tools.Override:全部 tool-call part 由此分发(与旧 MessageBubble 工具分支一致)。
 */
export function AgentToolCardOverride({ toolName, result }: ToolCallMessagePartProps) {
  const { currentSessionId, onSend, onGateDecision } = useAgentShellActions();
  const { payload, success, summary } = normalizeToolResult(result);

  if (payload?.type === "resume_document") return <ResumeDocumentCard payload={payload} />;
  if (payload?.type === "resume_draft") return <ResumeDraftCard payload={payload} onSend={onSend} />;
  if (payload?.type === "handoff") {
    return <div className={COMPACT_AGENT_CARD_CLASS}><AgentHandoffBanner payload={payload} /></div>;
  }
  if (payload?.type === "delegation") {
    return <div className={COMPACT_AGENT_CARD_CLASS}><AgentDelegationCard payload={payload} /></div>;
  }
  if (payload?.type === "handoff_denied" || payload?.type === "delegation_denied") {
    return (
      <div className={COMPACT_AGENT_CARD_CLASS}>
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs" style={{ background: "var(--surface-soft)", color: "var(--muted)" }}>
          <Ban size={13} className="shrink-0" />
          <span>{String(payload?.reason || "协作请求被治理策略拒绝")}</span>
        </div>
      </div>
    );
  }
  if (payload?.type === "run_gate") {
    // ApprovalCard 形态:批准/拒绝回调仍走 handleGateDecision,状态修正仍由 reconcileRunGateMessages 负责。
    return <RunGateCard payload={payload} onDecision={onGateDecision} />;
  }
  if (DATA_QUERY_TOOLS[toolName || ""]) {
    const label = DATA_QUERY_TOOLS[toolName!];
    return (
      <div className={COMPACT_AGENT_CARD_CLASS}>
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-[var(--radius-md)] border border-[var(--color-divider)] overflow-hidden"
        >
          <div className="flex items-center gap-2 px-3 py-2">
            <FileText size={14} className="text-[var(--color-primary)]" />
            <span className="text-xs font-medium text-[var(--color-text)]">{success ? label : "工具调用失败"}</span>
            {success ? (
              <Check size={12} className="text-emerald-500 ml-auto flex-shrink-0" />
            ) : (
              <X size={12} className="text-red-500 ml-auto flex-shrink-0" />
            )}
          </div>
        </motion.div>
      </div>
    );
  }
  if (toolName === "get_profile") {
    return (
      <div className={COMPACT_AGENT_CARD_CLASS}>
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-[var(--radius-md)] border border-[var(--color-divider)] overflow-hidden"
        >
          <div className="flex items-center gap-2 px-3 py-2">
            <User size={14} className="text-[var(--color-primary)]" />
            <span className="text-xs font-medium text-[var(--color-text)]">已读取求职画像</span>
            <Check size={12} className="text-emerald-500 ml-auto flex-shrink-0" />
          </div>
        </motion.div>
      </div>
    );
  }
  if (payload?.type === "interview_questions") return <InterviewQuestionCard payload={payload} />;
  if (
    payload?.type === "resume_edit_proposal"
    || payload?.type === "resume_edit_proposal_applied"
    || payload?.type === "resume_edit_proposal_discarded"
    || payload?.type === "resume_edit_proposal_rolled_back"
  ) {
    return <ResumeEditProposalCard payload={payload} success={success} onSend={onSend} />;
  }
  if (payload?.type === "job_discovery_confirmation") return <JobDiscoveryConfirmationCard payload={payload} onSend={onSend} />;
  if (payload?.type === "job_discovery_run") return <JobDiscoveryRunCard payload={payload} onSend={onSend} />;
  if (payload?.type === "job_discovery_batch" || payload?.type === "job_discovery_detail") {
    return <JobDiscoveryBatchCard payload={payload} onSend={onSend} />;
  }
  if (payload?.type === "job_discovery_error") return <JobDiscoveryErrorCard payload={payload} />;
  if (
    payload?.type === "application_tracked"
    || payload?.type === "application_status_updated"
    || payload?.type === "application_context"
  ) {
    return <ApplicationPipelineCard payload={payload} success={success} onSend={onSend} />;
  }
  if (payload?.type === "offer_evaluation" || payload?.type === "offer_report") {
    return <OfferResultCard payload={payload} success={success} currentSessionId={currentSessionId} />;
  }
  if (toolName === "get_report_detail") {
    if (payload?.type === "report_blocks") {
      return <ReportSummaryCard payload={payload} content={summary} />;
    }
    return <SafeToolStatusView toolName={toolName} success={success} />;
  }
  if (toolName === "evaluate_jd") {
    // 与旧壳一致:EvalConfirmCard 消费 msg.content;0.11.0-C 投影后 content 即安全摘要。
    return <EvalConfirmCard msg={{ role: "tool", toolName, content: summary, timestamp: "" }} />;
  }
  if (toolName === "evaluate_jd_full") return null;
  if (toolName === "recognize_document_image") {
    return <ImageIntakeCard payload={payload} success={success} />;
  }
  if (toolName === "export_file" || toolName === "download_report_pdf") {
    const downloadUrl = typeof payload?.downloadUrl === "string" ? payload.downloadUrl : null;
    const filename = typeof payload?.filename === "string" ? payload.filename : null;
    if (!downloadUrl && !filename) return <SafeToolStatusView toolName={toolName} success={success} />;
    return (
      <div className={COMPACT_AGENT_CARD_CLASS}>
        <ToolResultCard
          toolName={toolName}
          toolResult={summary}
          success={true}
          downloadUrl={downloadUrl}
          downloadLabel={filename ? `下载 ${filename}` : "下载文件"}
        />
      </div>
    );
  }
  return <SafeToolStatusView toolName={toolName} success={success} />;
}

/** 图片识别卡:与旧 MessageBubble 的 recognize_document_image 分支一致(字段来自安全 uiPayload)。 */
function ImageIntakeCard({ payload, success }: { payload?: Record<string, unknown>; success: boolean }) {
  const status = (payload?.status as string | undefined) || (success ? "done" : "failed");
  const route = payload?.route ? String(payload.route) : "";
  const reason = payload?.reason ? String(payload.reason) : "";
  const confidence = typeof payload?.confidence === "number" ? `${Math.round(payload.confidence * 100)}%` : "";
  const clarificationQuestion = payload?.clarificationQuestion ? String(payload.clarificationQuestion) : "";
  const retryHint = payload?.retryHint ? String(payload.retryHint) : "";
  const imagesCount = typeof payload?.imagesCount === "number" ? payload.imagesCount : 0;
  const perImage = Array.isArray(payload?.perImage)
    ? payload.perImage.filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null)
    : [];
  return (
    <div className={COMPACT_AGENT_CARD_CLASS}>
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-divider)] bg-[var(--color-surface)]"
      >
        <div className="flex items-center gap-2 border-b border-[var(--color-divider)] bg-[var(--color-bg)] px-3 py-2">
          <CheckCircle size={14} className={status === "failed" ? "text-red-500" : "text-[var(--color-primary)]"} />
          <span className="text-xs font-medium text-[var(--color-text)] flex items-center gap-1"><ImageIcon size={13} /> 识别图片</span>
          <span className={`ml-auto text-xs ${status === "failed" ? "text-red-500" : "text-emerald-500"}`}>
            {status === "failed" ? "失败" : status === "running" ? "识别中" : "完成"}
          </span>
        </div>
        <div className="space-y-2 px-3 py-2 text-sm text-[var(--color-text)]">
          {imagesCount > 0 && <div className="text-xs text-[var(--color-muted)]">图片: {imagesCount} 张</div>}
          {route && <div className="text-xs text-[var(--color-muted)]">路由: {route}</div>}
          {confidence && <div className="text-xs text-[var(--color-muted)]">置信度: {confidence}</div>}
          {reason && <div className="text-xs text-[var(--color-muted)] whitespace-pre-wrap">{reason}</div>}
          {perImage.length > 0 && (
            <div className="space-y-1">
              {perImage.map((item, index) => {
                const itemIndex = typeof item.index === "number" ? item.index + 1 : index + 1;
                const itemType = item.documentType ? String(item.documentType) : "unknown";
                const itemConfidence = typeof item.confidence === "number" ? `${Math.round(item.confidence * 100)}%` : "";
                const textLength = typeof item.extractedTextLength === "number" ? `${item.extractedTextLength}字` : "";
                const itemReason = item.reason ? String(item.reason) : "";
                return (
                  <div key={`image-intake-${itemIndex}-${index}`} className="rounded-[var(--radius-sm)] border border-[var(--color-divider)] bg-[var(--color-bg)] px-2 py-1.5 text-xs text-[var(--color-muted)]">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-[var(--color-text)]">第 {itemIndex} 张</span>
                      <span>{itemType}</span>
                      {itemConfidence && <span>{itemConfidence}</span>}
                      {textLength && <span>{textLength}</span>}
                    </div>
                    {itemReason && <div className="mt-1 whitespace-pre-wrap">{itemReason}</div>}
                  </div>
                );
              })}
            </div>
          )}
          {clarificationQuestion && (
            <div className="rounded-[var(--radius-sm)] border border-[var(--color-divider)] bg-[var(--color-bg)] px-3 py-2 text-xs">
              {clarificationQuestion}
            </div>
          )}
          {retryHint && (
            <div className="rounded-[var(--radius-sm)] border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              {retryHint}
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}

/* ── 方言 data-part 渲染器(0.11.0-B 事件方言 → 线程消息 data parts) ── */

/** persist_done 的卡片形态:方言 componentKey AgentPersistDoneCard 的注册实现。 */
export function AgentPersistDoneCard({ data }: { data: Record<string, unknown> }) {
  return (
    <EvalCompletionNotice
      info={{
        reportNum: Number(data.reportNum || 0),
        company: String(data.company || ""),
        role: String(data.role || ""),
        score: Number(data.score || 0),
      }}
    />
  );
}

function SubagentStartedCard({ data }: { data: Record<string, unknown> }) {
  return <AgentDelegationCard payload={{ delegationId: data.delegationId, agentId: data.agentId, goal: data.goal, state: "running" }} />;
}

function SubagentFinishedCard({ data }: { data: Record<string, unknown> }) {
  return <AgentDelegationCard payload={{ delegationId: data.delegationId, agentId: data.agentId, state: "completed", findings: data.findings, keyPoints: data.keyPoints }} />;
}

function SubagentErrorCard({ data }: { data: Record<string, unknown> }) {
  return <AgentDelegationCard payload={{ delegationId: data.delegationId, agentId: data.agentId, state: "failed", findings: data.reason }} />;
}

function AgentSwitchBanner({ data }: { data: Record<string, unknown> }) {
  return <AgentHandoffBanner payload={{ agentId: data.agentId, agentName: data.agentName }} />;
}

/**
 * data.by_name 注册表:键 = 方言事件名,值 = 安全渲染器(仅消费方言白名单字段)。
 * componentKey 为 null 的事件(step/subagent 进度、phase、text 等)不注册,渲染层跳过。
 */
export const AGENT_DATA_RENDERERS: Partial<Record<AgentEventType, (props: { data: Record<string, unknown> }) => ReactNode>> = {
  "subagent.started": SubagentStartedCard,
  "subagent.finished": SubagentFinishedCard,
  "subagent.error": SubagentErrorCard,
  agent_switch: AgentSwitchBanner,
  persist_done: AgentPersistDoneCard,
};

/**
 * 方言 componentKey → 渲染组件(任务 4.4 一致性断言的注册表事实源)。
 * REQUIRED_COMPONENT_KEYS 里的每个键都必须在这里有实现。
 */
export const DIALECT_COMPONENT_REGISTRY: Record<string, (props: { data: Record<string, unknown> }) => ReactNode> = {
  AgentHandoffBanner: AgentSwitchBanner,
  AgentDelegationCard: SubagentStartedCard,
  AgentPersistDoneCard,
};
