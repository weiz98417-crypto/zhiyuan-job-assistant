import { getActionToolRisk } from "@/lib/agent/tools/action-tool-risk";
import type { ToolResult } from "@/lib/agent/tools/types";
import { buildVerifiedActionFailure } from "@/lib/agent/verified-action";
import { getToolGovernance } from "@/lib/agent/tool-governance";

export interface ReadBackRequirementStatus {
  required: boolean;
  satisfied: boolean;
  deferred: boolean;
  reason?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasBooleanReadBackFlag(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return (
    value.readBackVerified === true ||
    value.reportReadBackVerified === true ||
    value.referenceReadBackVerified === true ||
    value.fileReadBackVerified === true
  );
}

function scanPortalsResultDoesNotMutate(result: Pick<ToolResult, "data" | "uiPayload" | "rawData">): boolean {
  const uiType = isRecord(result.uiPayload) && typeof result.uiPayload.type === "string"
    ? result.uiPayload.type
    : "";
  const data = isRecord(result.data) ? result.data : {};
  const rawData = isRecord(result.rawData) ? result.rawData : {};
  return (
    uiType === "job_discovery_confirmation" ||
    uiType === "job_discovery_batch" ||
    uiType === "job_discovery_detail" ||
    data.needsConfirmation === true ||
    rawData.createdScan === false ||
    data.createdScan === false
  );
}

export function requiresReadBackVerification(toolName: string): boolean {
  const risk = getActionToolRisk(toolName);
  const governance = getToolGovernance(toolName);
  return Boolean(
    governance?.requiresReadBack ||
    risk?.requiresVerifiedWrite &&
    (risk.risk === "high-risk-write" || risk.risk === "destructive-write"),
  );
}

export function hasReadBackVerificationEvidence(result: Pick<ToolResult, "verifiedAction" | "data" | "uiPayload" | "rawData">): boolean {
  if (result.verifiedAction?.success && result.verifiedAction.readBack?.ok) return true;
  if (hasBooleanReadBackFlag(result.uiPayload)) return true;
  if (hasBooleanReadBackFlag(result.data)) return true;
  if (hasBooleanReadBackFlag(result.rawData)) return true;
  return false;
}

export function getReadBackRequirementStatus(toolName: string, result: ToolResult): ReadBackRequirementStatus {
  const required = requiresReadBackVerification(toolName);
  if (!required) return { required: false, satisfied: false, deferred: false };
  if (toolName === "scan_portals" && scanPortalsResultDoesNotMutate(result)) {
    return {
      required: false,
      satisfied: true,
      deferred: false,
      reason: "scan_portals returned a non-mutating confirmation or opportunity-pool response.",
    };
  }
  if (result._streaming) {
    return {
      required: true,
      satisfied: false,
      deferred: true,
      reason: "Streaming tool must emit read-back evidence after persistence completes.",
    };
  }
  const satisfied = hasReadBackVerificationEvidence(result);
  return {
    required: true,
    satisfied,
    deferred: false,
    reason: satisfied ? undefined : "High-risk tool returned success without read-back verification evidence.",
  };
}

export function enforceReadBackSuccessGate(toolName: string, result: ToolResult): ToolResult {
  if (!result.success) return result;

  const status = getReadBackRequirementStatus(toolName, result);
  if (!status.required || status.satisfied || status.deferred) return result;

  const risk = getActionToolRisk(toolName);
  const governance = getToolGovernance(toolName);
  const message = status.reason || "High-risk tool success requires read-back verification evidence.";
  const uiPayload = isRecord(result.uiPayload) ? result.uiPayload : {};

  return {
    ...result,
    success: false,
    error: result.error || message,
    errorCategory: "permanent",
    recoverable: false,
    llmSummary: `工具 ${toolName} 的成功结果已被运行时拦截：${message}`,
    uiPayload: {
      ...uiPayload,
      readBackVerified: false,
      readBackError: message,
      gatedByReadBack: true,
    },
    rawData: result.rawData ?? result.data,
    verifiedAction: result.verifiedAction ?? buildVerifiedActionFailure({
      action: toolName,
      targetType: risk?.targets[0] || governance?.documentTypes?.[0] || "unknown",
      error: message,
      verifier: {
        phase: "verifier",
        ok: false,
        code: "read_back.required_missing",
        message,
      },
    }),
  };
}
