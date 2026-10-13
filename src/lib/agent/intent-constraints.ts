import {
  detectNegatedWriteIntent,
  hasProfileWriteIntent,
  hasResumeWriteIntent,
} from "@/lib/agent/write-intent";

export type IntentWritePolicy = "forbidden" | "proposal_only" | "allowed";

export interface IntentConstraints {
  writePolicy: IntentWritePolicy;
  noProfileWrite: boolean;
  noResumeWrite: boolean;
  noReferenceResumeWrite: boolean;
}

export function deriveIntentConstraints(content: string): IntentConstraints {
  const constraints: IntentConstraints = {
    writePolicy: "allowed",
    noProfileWrite: false,
    noResumeWrite: false,
    noReferenceResumeWrite: false,
  };
  const negated = detectNegatedWriteIntent(content);
  if (negated === "profile") constraints.noProfileWrite = true;
  if (negated === "resume") constraints.noResumeWrite = true;
  if (negated === "reference_resume") constraints.noReferenceResumeWrite = true;
  if (constraints.noProfileWrite || constraints.noResumeWrite || constraints.noReferenceResumeWrite) {
    constraints.writePolicy = hasResumeWriteIntent(content) || hasProfileWriteIntent(content)
      || constraints.noResumeWrite && /(?:生成|创建|提供|给).{0,12}(?:简历)?(?:修改)?提案/.test(content)
      ? "proposal_only"
      : "forbidden";
  }
  if (/(?:只|仅)(?:需|需要)?(?:做|帮我|给我)?(?:整理|解释|查看|阅读|分析|讨论|咨询).{0,30}(?:事实|信息|内容|条件|材料)|(?:不要|禁止|不允许).{0,8}(?:保存报告|生成报告|更新投递|写入记忆|入库|任何写入)/i.test(content)) {
    constraints.writePolicy = "forbidden";
  }
  return constraints;
}
