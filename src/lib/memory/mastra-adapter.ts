import { createHash } from "node:crypto";
import { Memory } from "@mastra/memory";
import { PgVector, PostgresStore } from "@mastra/pg";
import type { MastraDBMessage } from "@mastra/core/agent";
import type { MastraModelConfig } from "@mastra/core/llm";
import { getPostgresPool, isPostgresConfigured } from "@/lib/postgres";
import { complete, type GatewayMessage } from "@/lib/ai/model-gateway";
import {
  createEmbeddingProvider,
  MEMORY_EMBEDDING_DIMENSION,
  type EmbeddingProvider,
} from "@/lib/memory/vector-memory";

export interface MastraSessionContract {
  append(input: { resourceId: string; threadId: string; messages: Array<{ id?: string; role: string; content: string; createdAt?: string; metadata?: Record<string, unknown> }>; requestId?: string }): Promise<void>;
  load(input: { resourceId: string; threadId: string }): Promise<Array<{ id?: string; role: string; content: string; createdAt?: string; metadata?: Record<string, unknown> }> >;
  eraseTarget(input: { resourceId: string; threadId: string; targetText: string }): Promise<{ redactedCount: number }>;
}

let memoryPromise: Promise<Memory> | null = null;

async function getMemory(): Promise<Memory> {
  if (!isPostgresConfigured()) throw new Error("Mastra session memory requires DATABASE_URL");
  if (!memoryPromise) {
    memoryPromise = (async () => {
      const storage = new PostgresStore({ id: "zhiyuan-mastra-memory", pool: getPostgresPool() });
      const vector = new PgVector({
        id: "zhiyuan-mastra-memory-vectors",
        connectionString: process.env.DATABASE_URL!.trim(),
      });
      const embedder = createMastraEmbedder();
      await storage.init();
      return new Memory({
        storage,
        vector,
        embedder,
        options: {
          lastMessages: 50,
          semanticRecall: { topK: 5, messageRange: 2, scope: "thread" },
          workingMemory: {
            enabled: true,
            scope: "thread",
            template: "# Conversation Working Context\n- 当前目标：\n- 当前材料：\n- 未完成事项：\n- 用户约束：",
          },
          observationalMemory: {
            enabled: true,
            scope: "resource",
            model: createMastraMemoryModel(),
          },
        },
      });
    })().catch((error) => {
      memoryPromise = null;
      throw error;
    });
  }
  return memoryPromise;
}

function createMastraEmbedder() {
  let provider: EmbeddingProvider;
  try {
    provider = createEmbeddingProvider();
  } catch {
    provider = createEmbeddingProvider({
      provider: "mock",
      apiUrl: "",
      apiKey: "",
      model: "zhiyuan-mastra-fallback",
      apiDimension: MEMORY_EMBEDDING_DIMENSION,
      dimension: MEMORY_EMBEDDING_DIMENSION,
      maxRetries: 0,
    });
  }
  return {
    specificationVersion: "v3" as const,
    provider: "zhiyuan-memory",
    modelId: provider.model,
    maxEmbeddingsPerCall: Infinity,
    supportsParallelCalls: true,
    async doEmbed(input: { values: string[]; abortSignal?: AbortSignal }) {
      if (input.abortSignal?.aborted) throw new Error("Mastra memory embedding aborted");
      return { embeddings: await provider.embed(input.values), warnings: [] };
    },
  };
}

function messageId(resourceId: string, threadId: string, message: { role: string; content: string; createdAt?: string }): string {
  return createHash("sha256")
    .update(`${resourceId}\u0000${threadId}\u0000${message.role}\u0000${message.createdAt || ""}\u0000${message.content}`)
    .digest("hex");
}

function toMastraMessage(resourceId: string, threadId: string, message: { id?: string; role: string; content: string; createdAt?: string; metadata?: Record<string, unknown> }): MastraDBMessage {
  const supportedRoles = new Set(["user", "assistant", "system", "signal"]);
  const role = supportedRoles.has(message.role) ? message.role as "user" | "assistant" | "system" | "signal" : "signal";
  const metadata = role === message.role
    ? message.metadata
    : { ...(message.metadata || {}), __zhiyuanOriginalRole: message.role };
  const createdAt = message.createdAt ? new Date(message.createdAt) : new Date();
  return {
    id: message.id || messageId(resourceId, threadId, message),
    role,
    createdAt,
    threadId,
    resourceId,
    content: {
      format: 2 as const,
      parts: [{ type: "text" as const, text: message.content }],
      metadata,
    },
  };
}

function textContent(message: { content?: unknown }): string {
  const content = message.content;
  if (typeof content === "string") return content;
  if (!content || typeof content !== "object") return "";
  const value = content as { content?: unknown; parts?: unknown[] };
  if (typeof value.content === "string") return value.content;
  if (!Array.isArray(value.parts)) return "";
  return value.parts.map((part) => {
    if (!part || typeof part !== "object") return "";
    const text = (part as { text?: unknown }).text;
    return typeof text === "string" ? text : "";
  }).join("");
}

function contentMetadata(message: { content?: unknown; metadata?: Record<string, unknown> }): Record<string, unknown> | undefined {
  if (message.metadata && typeof message.metadata === "object") return message.metadata;
  if (!message.content || typeof message.content !== "object" || Array.isArray(message.content)) return undefined;
  const metadata = (message.content as { metadata?: unknown }).metadata;
  return metadata && typeof metadata === "object" && !Array.isArray(metadata) ? metadata as Record<string, unknown> : undefined;
}

function isMissingThreadError(error: unknown): boolean {
  return error instanceof Error && /no thread found/i.test(error.message);
}

function fromMastraMessage(message: { id?: string; role?: string; content?: unknown; createdAt?: Date | string; metadata?: Record<string, unknown> }) {
  const metadata = contentMetadata(message);
  const originalRole = typeof metadata?.__zhiyuanOriginalRole === "string" ? metadata.__zhiyuanOriginalRole : undefined;
  return {
    id: message.id,
    role: originalRole || message.role || "assistant",
    content: textContent(message),
    createdAt: message.createdAt ? new Date(message.createdAt).toISOString() : undefined,
    metadata,
  };
}

type MastraModelPromptMessage = { role?: string; content?: unknown };
type MastraMemoryModelCall = {
  prompt: MastraModelPromptMessage[];
  temperature?: number;
  maxTokens?: number;
  abortSignal?: AbortSignal;
  mode?: { type?: string; tools?: Array<Record<string, unknown>> };
};

function toGatewayMessage(message: MastraModelPromptMessage): GatewayMessage {
  const role = message.role === "system" || message.role === "user" || message.role === "assistant" || message.role === "tool"
    ? message.role
    : "user";
  if (typeof message.content === "string") return { role, content: message.content };
  if (!Array.isArray(message.content)) return { role, content: "" };
  const parts: Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }> = [];
  for (const part of message.content) {
    if (!part || typeof part !== "object") continue;
    const item = part as Record<string, unknown>;
    if (item.type === "text" && typeof item.text === "string") parts.push({ type: "text", text: item.text });
    else if (item.type === "image" && typeof item.image_url === "object" && item.image_url) {
      const imageUrl = (item.image_url as Record<string, unknown>).url;
      if (typeof imageUrl === "string") parts.push({ type: "image_url", image_url: { url: imageUrl } });
    } else {
      parts.push({ type: "text", text: JSON.stringify(item) });
    }
  }
  return { role, content: parts.length ? parts : "" };
}

function createMastraMemoryModel(): MastraModelConfig {
  const run = async (options: { prompt: MastraModelPromptMessage[]; temperature?: number; maxTokens?: number; abortSignal?: AbortSignal; mode?: { type?: string; tools?: Array<Record<string, unknown>> } }) => {
    const result = await complete({
      messages: options.prompt.map(toGatewayMessage),
      temperature: options.temperature,
      maxTokens: options.maxTokens,
      stream: false,
      signal: options.abortSignal,
      timeoutMs: 60_000,
      tools: options.mode?.tools?.filter((tool) => tool.type === "function").map((tool) => ({
        type: "function",
        function: tool,
      })),
    });
    return result;
  };
  const model = {
    specificationVersion: "v1" as const,
    provider: "zhiyuan-model-gateway",
    modelId: "deepseek-flash",
    defaultObjectGenerationMode: "json" as const,
    supportsStructuredOutputs: false,
    async doGenerate(options: unknown) {
      const typedOptions = options as MastraMemoryModelCall;
      const result = await run(typedOptions);
      return {
        text: result.text,
        toolCalls: result.toolCalls.map((toolCall) => ({ type: "function", toolCallId: toolCall.id, toolName: toolCall.name, args: toolCall.arguments })),
        finishReason: (result.finishReason || "stop") as "stop",
        usage: { promptTokens: 0, completionTokens: 0 },
        rawCall: { rawPrompt: typedOptions.prompt, rawSettings: {} },
        response: { modelId: result.modelUsed },
      };
    },
    async doStream(options: unknown) {
      const typedOptions = options as MastraMemoryModelCall;
      const result = await run(typedOptions);
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue({ type: "response-metadata", modelId: result.modelUsed });
          if (result.text) controller.enqueue({ type: "text-delta", textDelta: result.text });
          for (const toolCall of result.toolCalls) {
            controller.enqueue({ type: "tool-call", toolCallType: "function", toolCallId: toolCall.id, toolName: toolCall.name, args: toolCall.arguments });
          }
          controller.enqueue({ type: "finish", finishReason: result.finishReason || "stop", usage: { promptTokens: 0, completionTokens: 0 } });
          controller.close();
        },
      });
      return { stream, rawCall: { rawPrompt: typedOptions.prompt, rawSettings: {} }, response: { modelId: result.modelUsed } };
    },
  };
  return model as unknown as MastraModelConfig;
}

export function createMastraSessionContract(): MastraSessionContract {
  return {
    async append(input) {
      const memory = await getMemory();
      if (!input.messages.length) return;
      if (input.requestId) {
        try {
          const existing = await memory.recall({ threadId: input.threadId, resourceId: input.resourceId, perPage: false, hideSignals: true });
          if (existing.messages.some((message) => contentMetadata(message)?.__zhiyuanRequestId === input.requestId)) return;
        } catch (error) {
          if (!isMissingThreadError(error)) throw error;
        }
      }
      await memory.saveMessages({
        messages: input.messages.map((message) => toMastraMessage(
          input.resourceId,
          input.threadId,
          {
            ...message,
            metadata: { ...(message.metadata || {}), ...(input.requestId ? { __zhiyuanRequestId: input.requestId } : {}) },
          },
        )),
      });
      await memory.settled();
    },
    async load(input) {
      const memory = await getMemory();
      try {
        const result = await memory.recall({ threadId: input.threadId, resourceId: input.resourceId, perPage: false, hideSignals: true });
        return result.messages.map(fromMastraMessage);
      } catch (error) {
        if (isMissingThreadError(error)) return [];
        throw error;
      }
    },
    async eraseTarget(input) {
      const target = input.targetText.trim();
      if (!target) throw new Error("Target text is required for targeted session erasure");
      const memory = await getMemory();
      const messagePage = await memory.recall({ threadId: input.threadId, resourceId: input.resourceId, perPage: false, hideSignals: false });
      const messageIds = messagePage.messages
        .filter((message) => JSON.stringify(message).includes(target))
        .map((message) => message.id)
        .filter((id): id is string => typeof id === "string" && id.length > 0);
      if (messageIds.length) {
        const deleteMessageVectors = (memory as unknown as { deleteMessageVectors?: (ids: string[]) => Promise<void> }).deleteMessageVectors;
        if (typeof deleteMessageVectors !== "function") throw new Error("Mastra message vector erasure is unavailable");
        await memory.deleteMessages(messageIds);
        await deleteMessageVectors.call(memory, messageIds);
      }
      let redactedCount = 0;
      const workingMemory = await memory.getWorkingMemory({ threadId: input.threadId, resourceId: input.resourceId });
      if (workingMemory?.includes(target)) {
        await memory.updateWorkingMemory({
          threadId: input.threadId,
          resourceId: input.resourceId,
          workingMemory: workingMemory.split(target).join("[已删除]"),
        });
        redactedCount += 1;
      }
      const memoryStore = await memory.storage.getStore("memory");
      if (!memoryStore) throw new Error("Mastra memory storage domain is unavailable");
      const observationalRecords = await Promise.all([
        memoryStore.getObservationalMemory(input.threadId, input.resourceId),
        memoryStore.getObservationalMemory(null, input.resourceId),
      ]);
      for (const record of observationalRecords.filter((item, index, all): item is NonNullable<typeof item> => Boolean(item) && all.findIndex((candidate) => candidate?.id === item?.id) === index)) {
        const fields = [record.activeObservations, record.bufferedObservations, record.bufferedReflection, ...(record.bufferedObservationChunks || []).map((chunk) => chunk.observations)];
        if (!fields.some((value) => typeof value === "string" && value.includes(target))) continue;
        if (record.bufferedObservations?.includes(target) || record.bufferedReflection?.includes(target) || (record.bufferedObservationChunks || []).some((chunk) => chunk.observations.includes(target))) {
          throw new Error("Mastra observational memory has buffered target content and cannot be safely redacted");
        }
        await memoryStore.updateActiveObservations({
          id: record.id,
          observations: record.activeObservations.split(target).join("[已删除]"),
          tokenCount: record.observationTokenCount,
          lastObservedAt: record.lastObservedAt || new Date(),
          observedMessageIds: record.observedMessageIds,
        });
        redactedCount += 1;
      }
      await memory.settled();
      const readBackMessages = await memory.recall({ threadId: input.threadId, resourceId: input.resourceId, perPage: false, hideSignals: false });
      if (readBackMessages.messages.some((message) => JSON.stringify(message).includes(target))) {
        throw new Error("Mastra message erasure read-back still contains target");
      }
      const readBackWorkingMemory = await memory.getWorkingMemory({ threadId: input.threadId, resourceId: input.resourceId });
      if (readBackWorkingMemory?.includes(target)) throw new Error("Mastra working memory erasure read-back still contains target");
      const activeRecords = await Promise.all([
        memoryStore.getObservationalMemory(input.threadId, input.resourceId),
        memoryStore.getObservationalMemory(null, input.resourceId),
      ]);
      if (activeRecords.some((record) => record && [record.activeObservations, record.bufferedObservations, record.bufferedReflection, ...(record.bufferedObservationChunks || []).map((chunk) => chunk.observations)].some((value) => typeof value === "string" && value.includes(target)))) {
        throw new Error("Mastra observational memory erasure read-back still contains target");
      }
      return { redactedCount };
    },
  };
}
