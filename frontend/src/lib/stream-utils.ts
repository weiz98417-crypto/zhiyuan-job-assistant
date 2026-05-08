/* ── Streaming utilities — reusable SSE/DeepSeek helpers ── */

const DEEPSEEK_API_URL = "https://api.deepseek.com/chat/completions";
const DEFAULT_MODEL = "deepseek-v4-flash";

export interface DeepSeekStreamConfig {
  model?: string;
  messages: { role: string; content: string }[];
  temperature?: number;
  max_tokens?: number;
}

export interface DeepSeekJsonConfig {
  model?: string;
  messages: { role: string; content: string }[];
  temperature?: number;
  max_tokens?: number;
}

/* ── Shared: DeepSeek streaming chunk reader (fetch + line-buffer loop) ── */

export interface DeepSeekStreamCallbacks {
  onContent: (deltaContent: string) => void;
  onDone: () => void;
  onError: (status: number, body: string) => void;
}

export async function streamDeepSeekChunks(
  config: DeepSeekStreamConfig,
  callbacks: DeepSeekStreamCallbacks,
): Promise<void> {
  const apiKey = process.env.DEEPSEEK_API_KEY;

  let response: Response;
  try {
    response = await fetch(DEEPSEEK_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: config.model || DEFAULT_MODEL,
        messages: config.messages,
        temperature: config.temperature ?? 0.7,
        max_tokens: config.max_tokens ?? 2000,
        stream: true,
      }),
    });
  } catch (err) {
    callbacks.onError(0, String(err));
    return;
  }

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    callbacks.onError(response.status, errText);
    return;
  }

  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let lineBuf = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      lineBuf += decoder.decode(value, { stream: true });
      const lines = lineBuf.split("\n");
      lineBuf = lines.pop() || "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const data = line.slice(6);
        if (data === "[DONE]") {
          callbacks.onDone();
          continue;
        }
        try {
          const parsed = JSON.parse(data);
          const content = parsed.choices?.[0]?.delta?.content;
          if (content) {
            callbacks.onContent(content);
          }
        } catch {
          // skip unparseable chunks
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/* ── Raw text streaming (pass-through delta content) ── */

export function createDeepSeekStream(config: DeepSeekStreamConfig): ReadableStream<Uint8Array> {
  const apiKey = process.env.DEEPSEEK_API_KEY;

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  return new ReadableStream({
    async start(controller) {
      let response: Response;
      try {
        response = await fetch(DEEPSEEK_API_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: config.model || DEFAULT_MODEL,
            messages: config.messages,
            temperature: config.temperature ?? 0.7,
            max_tokens: config.max_tokens ?? 2000,
            stream: true,
          }),
        });
      } catch (err) {
        controller.error(err);
        return;
      }

      if (!response.ok) {
        const errText = await response.text().catch(() => "");
        console.error("DeepSeek stream error:", response.status, errText);
        controller.error(new Error(`AI 请求失败: ${response.status}`));
        return;
      }

      const reader = response.body!.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const text = decoder.decode(value, { stream: true });
          const lines = text.split("\n");

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const data = line.slice(6);
            if (data === "[DONE]") {
              controller.enqueue(encoder.encode("[DONE]\n"));
              continue;
            }
            try {
              const parsed = JSON.parse(data);
              const content = parsed.choices?.[0]?.delta?.content;
              if (content) {
                controller.enqueue(encoder.encode(content));
              }
            } catch {
              // skip unparseable chunks
            }
          }
        }
      } catch (err) {
        console.error("Stream read error:", err);
      } finally {
        reader.releaseLock();
        controller.close();
      }
    },
  });
}

/* ── Structured JSON streaming (emits EventSource-compatible SSE with JSON lines) ── */

export function streamSSE(
  readable: ReadableStream<Uint8Array>,
): Response {
  return new Response(readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export function sseEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

/* ── Non-streaming JSON call ── */

export async function callDeepSeekJson(config: DeepSeekJsonConfig): Promise<string> {
  const apiKey = process.env.DEEPSEEK_API_KEY;

  const response = await fetch(DEEPSEEK_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: config.model || DEFAULT_MODEL,
      messages: config.messages,
      temperature: config.temperature ?? 0.3,
      max_tokens: config.max_tokens ?? 4000,
      response_format: { type: "json_object" },
    }),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    throw new Error(`DeepSeek API error ${response.status}: ${errText}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("AI 返回为空");

  return content;
}

export function parseJsonResponse(content: string): Record<string, unknown> {
  try {
    return JSON.parse(content);
  } catch {
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) return JSON.parse(jsonMatch[1]);
    throw new Error("AI 返回格式解析失败");
  }
}

/* ── Structured streaming: emits typed sections as SSE ── */

export interface StructuredStreamConfig {
  model?: string;
  systemPrompt: string;
  userMessage: string;
  temperature?: number;
  max_tokens?: number;
}

export function createStructuredStream(config: StructuredStreamConfig): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let buffer = "";
  let anySectionEmitted = false;

  const readable = new ReadableStream({
    async start(controller) {
      await streamDeepSeekChunks(
        {
          model: config.model,
          messages: [
            { role: "system", content: config.systemPrompt },
            { role: "user", content: config.userMessage },
          ],
          temperature: config.temperature ?? 0.3,
          max_tokens: config.max_tokens ?? 8000,
        },
        {
          onContent: (content) => {
            buffer += content;
            const sections = tryExtractSections(buffer);
            for (const section of sections) {
              controller.enqueue(encoder.encode(JSON.stringify(section) + "\n"));
            }
            if (sections.length > 0) anySectionEmitted = true;
          },
          onDone: () => {
            // Raw fallback: if no structured sections were emitted, emit raw buffer
            if (!anySectionEmitted && buffer.trim()) {
              controller.enqueue(
                encoder.encode(JSON.stringify({ type: "section", key: "raw", content: buffer.trim() }) + "\n"),
              );
            }
            controller.enqueue(encoder.encode("[DONE]\n"));
            controller.close();
          },
          onError: (status) => {
            console.error("DeepSeek structured stream error:", status);
            controller.error(new Error(`AI 请求失败: ${status}`));
          },
        },
      );
    },
  });

  return readable;
}

interface SectionPacket {
  type: "section" | "done";
  key?: string;
  content?: string;
}

function tryExtractSections(buffer: string): SectionPacket[] {
  // For evaluate/jd streaming, the LLM emits:
  // <<SUMMARY>>...content...<</SUMMARY>>
  // <<SCORES>>...json...<</SCORES>>
  // <<RADAR>>...json...<</RADAR>>
  // <<SIGNALS>>...json...<</SIGNALS>>
  // <<SUGGESTION>>...content...<</SUGGESTION>>
  // <<DONE>>

  const results: SectionPacket[] = [];
  const regex = /<<(\w+)>>([\s\S]*?)<<\/\1>>/g;
  let match;

  while ((match = regex.exec(buffer)) !== null) {
    const key = match[1].toLowerCase();
    const content = match[2].trim();
    if (key === "done") {
      results.push({ type: "done" });
    } else {
      results.push({ type: "section", key, content });
    }
  }

  return results;
}

/* ── Coach-specific: section extraction with simplified format ── */

export interface ExtractedSection {
  key: string;
  label: string;
  content: string;
}

const SECTION_HEADING_RE = /^###\s+(.+)/m;

/** Extract sections from buffer using simplified `<<SECTION>>...<</SECTION>>` format.
 *  Section key is derived from the first `### Heading` in the content.
 *  Uses `emittedKeys` Set to avoid re-emitting completed sections. */
export function extractSectionsFromBuffer(
  buffer: string,
  emittedKeys: Set<string>,
): ExtractedSection[] {
  const results: ExtractedSection[] = [];
  const regex = /<<SECTION>>([\s\S]*?)<<\/SECTION>>/g;
  let match;

  while ((match = regex.exec(buffer)) !== null) {
    const rawContent = match[1].trim();
    if (!rawContent) continue;

    // Derive key and label from markdown heading, or use content hash
    const headingMatch = rawContent.match(SECTION_HEADING_RE);
    const label = headingMatch ? headingMatch[1].trim() : "AI 反馈";
    const key = headingMatch
      ? headingMatch[1].trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9一-鿿-]/g, "")
      : `section-${results.length}`;

    if (emittedKeys.has(key)) continue;
    emittedKeys.add(key);
    results.push({ key, label, content: rawContent });
  }

  return results;
}

/* ── Common: check API key ── */

export function checkApiKey(): { valid: true } | { valid: false; error: Response } {
  if (!process.env.DEEPSEEK_API_KEY) {
    return {
      valid: false,
      error: new Response(
        JSON.stringify({ success: false, error: "未配置 DEEPSEEK_API_KEY" }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      ),
    };
  }
  return { valid: true };
}
