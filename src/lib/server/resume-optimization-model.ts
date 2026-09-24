import { LLMError, llmRetry } from "@/lib/llm-retry";

interface ResumeOptimizationModelInput {
  fast?: boolean;
  messages: Array<{ role: string; content: string }>;
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
}

export class ResumeOptimizationProviderError extends Error {
  retryable: boolean;

  constructor(message: string, retryable: boolean, cause?: unknown) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = "ResumeOptimizationProviderError";
    this.retryable = retryable;
  }
}

export async function requestResumeOptimizationModel(
  input: ResumeOptimizationModelInput,
): Promise<Response> {
  const apiKey = process.env.DEEPSEEK_API_KEY?.trim();
  if (!apiKey) {
    throw new ResumeOptimizationProviderError("简历优化服务尚未配置", false);
  }

  try {
    const response = await llmRetry("https://api.deepseek.com/chat/completions", apiKey, {
      model: "deepseek-flash",
      messages: input.messages,
      temperature: input.temperature,
      max_tokens: input.maxTokens,
      response_format: { type: "json_object" },
      thinking: { type: "disabled" },
      timeout: resolveProviderTimeoutMs(),
      retries: 0,
      signal: input.signal,
    });
    await assertStructuredResponseHasContent(response, "deepseek-flash");
    return response;
  } catch (error) {
    if (input.signal?.aborted) throw abortReason(input.signal);
    const failure = normalizeProviderError(error);
    throw new ResumeOptimizationProviderError(
      failure.retryable ? "简历优化服务暂时不可用，请稍后重试" : "简历优化服务认证失败，请检查服务配置",
      failure.retryable,
      failure,
    );
  }
}

async function assertStructuredResponseHasContent(response: Response, model: string): Promise<void> {
  const payload = await response.clone().json().catch(() => null) as {
    choices?: Array<{ message?: { content?: unknown } }>;
  } | null;
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) {
    throw new LLMError("invalid_response", `${model} returned an empty structured response`, true);
  }
}

function normalizeProviderError(error: unknown): LLMError {
  if (error instanceof LLMError) {
    if (error.statusCode && error.statusCode >= 400 && error.statusCode < 500 && error.statusCode !== 429) {
      return error;
    }
    if (!error.statusCode && error.type === "unknown") {
      return new LLMError(error.type, error.message, true);
    }
    return error;
  }
  return new LLMError(
    "unknown",
    error instanceof Error ? error.message : "Unknown provider failure",
    true,
  );
}

function resolveProviderTimeoutMs(): number {
  const configured = Number(process.env.RESUME_OPTIMIZATION_PROVIDER_TIMEOUT_MS);
  if (!Number.isFinite(configured)) return 45_000;
  return Math.max(5_000, Math.min(120_000, Math.round(configured)));
}

function abortReason(signal: AbortSignal): Error {
  return signal.reason instanceof Error ? signal.reason : new Error("Request aborted");
}
