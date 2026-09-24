/**
 * ModelGateway — 全应用唯一的 LLM 调用模块
 *
 * 收编原先三份重复的 MODEL_CHAIN / SSE 解析 / tool_call 分片重组：
 * - loop/server-runner.ts 的 callLLM（流式 + 工具调用）
 * - /api/agent/think 的模型请求（流式转发给浏览器）
 * - classify-intent-llm.ts 的 callClassifier（非流式小请求）
 *
 * 统一语义：使用 deepseek-flash → 429/503 重试一次 →
 * 失败抛 ModelGatewayError。
 */
import { DEEPSEEK_API_URL, DEEPSEEK_VISION_MODEL, getDeepSeekApiKey } from "@/lib/deepseek-provider";

export interface ModelChainEntry {
  provider: string;
  model: string;
  url: string;
  keyEnv: string;
}

export function getDefaultModelChain(): ModelChainEntry[] {
  return [
    { provider: "deepseek", model: DEEPSEEK_VISION_MODEL, url: DEEPSEEK_API_URL, keyEnv: "DEEPSEEK_API_KEY" },
  ];
}

export function getThinkModelChain(): ModelChainEntry[] {
  return getDefaultModelChain();
}

export class ModelGatewayError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ModelGatewayError";
  }
}

export interface GatewayMessage {
  role: string;
  content: string | Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }>;
  /** Browser-loop artifact, stripped before the provider request. */
  images?: string[];
  tool_call_id?: string;
  tool_calls?: Array<{ id: string; type: "function"; function: { name: string; arguments: string } }>;
}

export interface ChatCompletionRequest {
  messages: GatewayMessage[];
  systemPrompt?: string;
  tools?: Array<{ type: string; function: object }>;
  temperature?: number;
  maxTokens?: number;
  /** Non-streaming: returns full text (classifier-style). */
  stream: false;
  /** Kept for existing callers; the gateway only uses deepseek-flash. */
  chain?: ModelChainEntry[];
  /** Per-attempt connect timeout. Classifier-style callers should keep this small. */
  timeoutMs?: number;
}

export interface StreamingChatRequest {
  messages: GatewayMessage[];
  systemPrompt?: string;
  tools?: Array<{ type: string; function: object }>;
  temperature?: number;
  maxTokens?: number;
  stream: true;
  /** Abort signal from the caller (request signal / loop signal). */
  signal?: AbortSignal;
  /** Per-attempt connect timeout. Default 60s. */
  timeoutMs?: number;
  /** Kept for existing callers; the gateway only uses deepseek-flash. */
  chain?: ModelChainEntry[];
  /** Kept for existing callers; the gateway only uses deepseek-flash. */
  preferredModel?: string;
}

export interface NativeToolCall {
  id: string;
  name: string;
  arguments: string;
}

export interface ChatResult {
  text: string;
  toolCalls: NativeToolCall[];
  modelUsed: string;
  finishReason: string;
}

export interface StreamingChatResult extends ChatResult {
  response: Response;
}

const RETRYABLE_STATUS = new Set([429, 503]);

export interface AttemptOutcome {
  response: Response | null;
  lastError: string;
}

export async function attemptModel(
  entry: ModelChainEntry,
  body: Record<string, unknown>,
  signal?: AbortSignal,
  timeoutMs = 60_000,
): Promise<AttemptOutcome> {
  const apiKey = getDeepSeekApiKey();
  if (!apiKey) return { response: null, lastError: `${entry.model}: no key` };

  let lastError = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    if (signal?.aborted) return { response: null, lastError: `${entry.model}: aborted` };
    let response: Response;
    try {
      response = await fetch(entry.url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify(body),
        signal: AbortSignal.any([AbortSignal.timeout(timeoutMs), ...(signal ? [signal] : [])]),
      });
    } catch (err) {
      if (signal?.aborted) return { response: null, lastError: `${entry.model}: aborted` };
      lastError = `${entry.model} network: ${err instanceof Error ? err.message : String(err)}`;
      break;
    }
    if (response.ok) return { response, lastError: "" };
    const detail = (await response.text().catch(() => "")).slice(0, 300);
    lastError = `${entry.model} ${response.status}${detail ? ` ${detail}` : ""}`;
    if (!RETRYABLE_STATUS.has(response.status)) break;
    if (attempt === 0) await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  return { response: null, lastError };
}

function resolveChain(): ModelChainEntry[] {
  return getDefaultModelChain();
}

function buildBody(request: StreamingChatRequest | ChatCompletionRequest, model: string): Record<string, unknown> {
  // Strip caller-side `images` (browser-loop artifact); providers reject unknown per-message fields.
  const messages = request.messages.map(({ images: _images, ...message }) => message);
  return {
    model,
    messages: [
      ...(request.systemPrompt ? [{ role: "system", content: request.systemPrompt }] : []),
      ...messages,
    ],
    temperature: request.temperature ?? 0.7,
    max_tokens: request.maxTokens ?? 16384,
    stream: request.stream,
    ...(request.tools?.length ? { tools: request.tools } : {}),
  };
}

/** Parse an OpenAI-compatible SSE stream into text + accumulated tool calls. */
export async function parseToolCallStream(
  response: Response,
  signal?: AbortSignal,
): Promise<{ text: string; toolCalls: NativeToolCall[]; finishReason: string }> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let fullText = "";
  const toolCallFragments = new Map<number, { id: string; name: string; arguments: string }>();
  let finishReason = "";
  let buffer = "";

  try {
    while (true) {
      if (signal?.aborted) break;
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const data = line.slice(6);
        if (data === "[DONE]") continue;
        try {
          const parsed = JSON.parse(data);
          const delta = parsed.choices?.[0]?.delta;
          const fr = parsed.choices?.[0]?.finish_reason;
          if (fr) finishReason = fr;
          if (delta?.content) fullText += delta.content;
          if (delta?.tool_calls) {
            for (const tc of delta.tool_calls) {
              const idx = tc.index ?? 0;
              if (!toolCallFragments.has(idx)) {
                toolCallFragments.set(idx, { id: "", name: "", arguments: "" });
              }
              const frag = toolCallFragments.get(idx)!;
              if (tc.id) frag.id = tc.id;
              if (tc.function?.name) frag.name += tc.function.name;
              if (tc.function?.arguments) frag.arguments += tc.function.arguments;
            }
          }
        } catch { /* skip malformed line */ }
      }
    }
  } finally {
    reader.releaseLock();
  }

  return { text: fullText, toolCalls: Array.from(toolCallFragments.values()), finishReason };
}

/** Non-streaming completion with fallback (classifier-style small requests). */
export async function complete(request: ChatCompletionRequest): Promise<ChatResult> {
  const chain = resolveChain();
  let lastError = "";
  for (const entry of chain) {
    const outcome = await attemptModel(entry, buildBody(request, entry.model), undefined, request.timeoutMs ?? 30_000);
    if (!outcome.response) {
      lastError = outcome.lastError;
      continue;
    }
    try {
      const json = await outcome.response.json();
      const msg = json.choices?.[0]?.message;
      const text = (msg?.content || msg?.reasoning_content || "").trim();
      const toolCalls = Array.isArray(msg?.tool_calls)
        ? msg.tool_calls.map((tc: { id?: string; function?: { name?: string; arguments?: string } }) => ({
            id: tc.id || "",
            name: tc.function?.name || "",
            arguments: tc.function?.arguments || "",
          }))
        : [];
      return {
        text,
        toolCalls,
        modelUsed: entry.model,
        finishReason: json.choices?.[0]?.finish_reason || "",
      };
    } catch (err) {
      lastError = `${entry.model} parse: ${err instanceof Error ? err.message : String(err)}`;
    }
  }
  throw new ModelGatewayError(`All models failed (last: ${lastError})`);
}

/** Streaming completion with fallback. The returned Response is an ok SSE stream. */
export async function streamChat(request: StreamingChatRequest): Promise<StreamingChatResult> {
  const chain = resolveChain();
  let lastError = "";
  for (const entry of chain) {
    const outcome = await attemptModel(entry, buildBody(request, entry.model), request.signal, request.timeoutMs ?? 60_000);
    if (!outcome.response) {
      lastError = outcome.lastError;
      // A caller abort must not fall through to the next model.
      if (request.signal?.aborted) break;
      continue;
    }
    return { response: outcome.response, text: "", toolCalls: [], modelUsed: entry.model, finishReason: "" };
  }
  throw new ModelGatewayError(`All models failed (last: ${lastError})`);
}
