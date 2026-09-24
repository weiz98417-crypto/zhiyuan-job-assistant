/**
 * 事件方言（0.11.0-B，AG-UI 词汇对齐）——唯一事实源。
 *
 * 服务端产出、投影白名单、客户端观察者、消息渲染注册全部从此导入。
 * 旧事件名不重命名（durable 事件库回放兼容）；新语义按 AG-UI 词汇。
 * 组件注册由客户端在渲染层注入（服务端不 import React）。
 */

export type AgentEventType =
  // 既有事件（回放兼容，名称冻结）
  | "phase"
  | "text"
  | "tool_call"
  | "tool_result"
  | "tool_error"
  | "thinking_content"
  | "intent"
  | "agent_switch"
  | "run_directive"
  | "result_quality"
  | "persist_done"
  | "search_start"
  | "search_result"
  | "done"
  // 0.11.0-B 新增（AG-UI 词汇）
  | "step.started"
  | "step.finished"
  | "subagent.started"
  | "subagent.finished"
  | "subagent.error"
  | "messages.snapshot";

/** 事件 → 用户可见形态描述。`componentKey: null` 表示纯状态事件（无卡片）。 */
export interface AgentEventDescriptor {
  /** 用户安全字段白名单（与 surface-projection 的 SAFE_PAYLOAD_FIELDS 对齐）。 */
  safeFields: readonly string[];
  /** 渲染组件键；null = 不渲染卡片，仅驱动过程状态。 */
  componentKey: string | null;
}

export const AGENT_EVENT_DIALECT: Readonly<Record<AgentEventType, AgentEventDescriptor>> = {
  phase: { safeFields: ["phase"], componentKey: null },
  text: { safeFields: ["content"], componentKey: null },
  tool_call: { safeFields: ["name"], componentKey: null },
  tool_result: { safeFields: ["name", "result", "success", "uiPayload"], componentKey: "by-payload-type" },
  tool_error: { safeFields: ["name", "error", "recoverable"], componentKey: null },
  thinking_content: { safeFields: ["summary"], componentKey: null },
  intent: { safeFields: ["agentId", "modelTier", "audit", "clarify"], componentKey: null },
  agent_switch: { safeFields: ["agentId", "agentName"], componentKey: "AgentHandoffBanner" },
  run_directive: { safeFields: ["directive", "reason"], componentKey: null },
  result_quality: { safeFields: ["quality"], componentKey: null },
  persist_done: {
    safeFields: ["reportNum", "company", "role", "score", "readBackVerified", "readBackError"],
    componentKey: "AgentPersistDoneCard",
  },
  search_start: { safeFields: ["block"], componentKey: null },
  search_result: { safeFields: ["block", "progress"], componentKey: null },
  done: { safeFields: [], componentKey: null },
  "step.started": { safeFields: ["step", "criteriaDone", "criteriaTotal"], componentKey: null },
  "step.finished": { safeFields: ["step", "criteriaDone", "criteriaTotal"], componentKey: null },
  "subagent.started": { safeFields: ["delegationId", "agentId", "goal"], componentKey: "AgentDelegationCard" },
  "subagent.finished": { safeFields: ["delegationId", "agentId", "findings", "keyPoints"], componentKey: "AgentDelegationCard" },
  "subagent.error": { safeFields: ["delegationId", "agentId", "reason"], componentKey: "AgentDelegationCard" },
  "messages.snapshot": { safeFields: ["items"], componentKey: null },
};

/** 客户端渲染层必须注册的组件键（缺一个开发构建即告警）。 */
export const REQUIRED_COMPONENT_KEYS: readonly string[] = Object.values(AGENT_EVENT_DIALECT)
  .map((d) => d.componentKey)
  .filter((key): key is string => key !== null && key !== "by-payload-type");
