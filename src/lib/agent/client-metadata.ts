const AGENT_DISPLAY_NAMES: Record<string, string> = {
  orchestrator: "任务编排",
  interview: "面试教练",
  offer: "Offer 评估",
  evaluate: "JD 评估",
  profile: "求职画像",
  resume: "简历优化",
  general: "通用助手",
};

export function getAgentDisplayName(agentId: string): string {
  return AGENT_DISPLAY_NAMES[agentId] || agentId;
}
