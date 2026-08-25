import type {
  ToolDefinition,
  ToolExecutionContext,
  ToolReconciliationOutcome,
  ToolResult,
} from "./types";
import { enforceReadBackSuccessGate } from "./readback-verification";
import { getLegacyToolGovernanceCompatibility, getToolGovernance } from "@/lib/agent/tool-governance";
import { deriveToolCapability, hasCompleteToolCapability } from "./tool-capability";
import {
  sharedRuntimeResourceScheduler,
  type RuntimeResource,
  type RuntimeResourceScheduler,
} from "@/lib/agent/runtime/runtime-resource-scheduler";

export class ToolRegistry {
  private tools = new Map<string, ToolDefinition>();
  private sealed = false;

  constructor(
    private readonly scheduler: RuntimeResourceScheduler = sharedRuntimeResourceScheduler,
  ) {}

  register(tool: ToolDefinition): void {
    if (this.sealed) throw new Error("Tool Registry is sealed");
    if (this.tools.has(tool.name)) throw new Error(`Tool ${tool.name} is already registered`);
    const governance = tool.governance || getToolGovernance(tool.name);
    if (!governance && process.env.NODE_ENV !== "production") {
      console.warn(getLegacyToolGovernanceCompatibility(tool.name).warning);
    }
    const derivedCapability = deriveToolCapability(tool.name, governance);
    const capability = tool.capability || (derivedCapability
      ? {
          ...derivedCapability,
          reconciliation: derivedCapability.reconciliation === "read_back" && !tool.reconcile
            ? "manual" as const
            : derivedCapability.reconciliation,
        }
      : undefined);
    this.tools.set(tool.name, Object.freeze({
      ...tool,
      governance,
      capability: capability ? Object.freeze({ ...capability }) : undefined,
      parameters: Object.freeze({ ...tool.parameters }),
    }));
  }

  seal(): void {
    this.sealed = true;
  }

  get(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  getAll(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }

  getByCategory(category: "query" | "action"): ToolDefinition[] {
    return this.getAll().filter((t) => t.category === category);
  }

  buildToolListText(): string {
    const tools = this.getExposedTools();
    if (tools.length === 0) return "";

    const lines = tools.map((t) => {
      const paramsStr = Object.entries(t.parameters)
        .map(([k, p]) => `${k}${p.required ? "*" : "?"}: ${p.description}`)
        .join(", ");
      const hints = t.matchHints?.length ? ` [提示: ${t.matchHints.join(", ")}]` : "";
      return `- ${t.name}: ${t.description}${hints}${paramsStr ? ` (${paramsStr})` : ""}`;
    });

    return `\n## 可用工具\n\n${lines.join("\n")}`;
  }

  toOpenAITools(allowlist?: readonly string[], workerOnly = false): Array<{
    type: "function";
    function: {
      name: string;
      description: string;
      parameters: {
        type: "object";
        properties: Record<string, { type: string; description: string }>;
        required: string[];
      };
    };
  }> {
    const allowed = allowlist ? new Set(allowlist) : null;
    return this.getExposedTools()
      .filter((tool) => !allowed || allowed.has(tool.name))
      .filter((tool) => !workerOnly || tool.capability?.workerExecution !== "legacy")
      .map((t) => {
      const properties: Record<string, { type: string; description: string }> = {};
      const required: string[] = [];
      for (const [key, param] of Object.entries(t.parameters)) {
        properties[key] = { type: param.type, description: param.description };
        if (param.required) required.push(key);
      }
      return {
        type: "function" as const,
        function: {
          name: t.name,
          description: t.description,
          parameters: { type: "object", properties, required },
        },
      };
      });
  }

  async execute(
    name: string,
    params: Record<string, unknown>,
    context?: ToolExecutionContext,
  ): Promise<ToolResult> {
    if (context && !context.allowlist.includes(name)) {
      return {
        success: false,
        data: null,
        error: `工具 ${name} 在当前 Agent 模式下不可用`,
        errorCategory: "permanent",
      };
    }
    const tool = this.tools.get(name);
    if (!tool) return { success: false, data: null, error: `工具 ${name} 不存在`, errorCategory: "permanent" };
    if (!hasCompleteToolCapability(tool.capability)) {
      return {
        success: false,
        data: null,
        error: `工具 ${name} 缺少完整 capability metadata`,
        errorCategory: "permanent",
      };
    }
    const controller = new AbortController();
    const forwardAbort = () => controller.abort(context?.signal?.reason);
    if (context?.signal?.aborted) forwardAbort();
    else context?.signal?.addEventListener("abort", forwardAbort, { once: true });
    const deadlineTimer = setTimeout(() => {
      controller.abort(new Error(`tool deadline exceeded: ${name}`));
    }, tool.capability.deadlineMs);
    try {
      const result = await this.scheduler.run(toolResource(tool), async () => {
        const execution = tool.handler(
          params,
          context ? { ...context, signal: controller.signal } : context,
        );
        const aborted = new Promise<never>((_resolve, reject) => {
          controller.signal.addEventListener("abort", () => {
            reject(controller.signal.reason instanceof Error
              ? controller.signal.reason
              : new Error(`tool execution aborted: ${name}`));
          }, { once: true });
        });
        return Promise.race([execution, aborted]);
      }, controller.signal);
      return enforceReadBackSuccessGate(name, result);
    } catch (err) {
      return {
        success: false,
        data: null,
        error: err instanceof Error ? err.message : "Tool execution error",
        errorCategory: "transient",
        recoverable: true,
        rawData: { dispatchState: "unknown" },
      };
    } finally {
      clearTimeout(deadlineTimer);
      context?.signal?.removeEventListener("abort", forwardAbort);
    }
  }

  async reconcile(
    name: string,
    params: Record<string, unknown>,
    context: ToolExecutionContext,
    previousResult: ToolResult | null,
  ): Promise<ToolReconciliationOutcome> {
    const tool = this.tools.get(name);
    if (!tool) return { state: "unknown", summary: `工具 ${name} 不存在，无法自动对账` };
    if (previousResult?.verifiedAction?.success === true) {
      return { state: "verified", summary: "已存在通过读回验证的工具结果", result: previousResult };
    }
    const previousData = previousResult?.data && typeof previousResult.data === "object"
      ? previousResult.data as Record<string, unknown>
      : {};
    if (previousData.readBackVerified === true) {
      return { state: "verified", summary: "已存在通过读回验证的工具结果", result: previousResult || undefined };
    }
    const rawData = previousResult?.rawData && typeof previousResult.rawData === "object"
      ? previousResult.rawData as Record<string, unknown>
      : {};
    if (rawData.dispatchState === "not_dispatched") {
      return { state: "not_executed", summary: "持久结果证明工具尚未分发" };
    }
    if (!tool.reconcile) {
      return { state: "unknown", summary: "没有可安全执行的自动读回适配器" };
    }
    return tool.reconcile(params, context, previousResult);
  }

  formatResult(result: ToolResult, toolName: string): string {
    const tool = this.tools.get(toolName);
    if (!tool) return JSON.stringify(result).slice(0, 500);
    return tool.formatResult(result);
  }

  private getExposedTools(): ToolDefinition[] {
    return this.getAll().filter((tool) => hasCompleteToolCapability(tool.capability));
  }
}

function toolResource(tool: ToolDefinition): RuntimeResource {
  if (/ocr|image|document_image/i.test(tool.name)) return "ocr";
  if (
    tool.category === "action" &&
    (tool.capability?.verification !== "none" || tool.capability?.risk === "high" || tool.capability?.risk === "critical")
  ) return "write";
  return "tool";
}
