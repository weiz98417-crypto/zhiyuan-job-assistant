import { NextResponse } from "next/server";

const DEEPSEEK_API_URL = "https://api.deepseek.com/chat/completions";
const MODEL = "deepseek-v4-flash";
const MAX_MESSAGES = 10;
const MAX_MSG_LEN = 2000;
const MAX_TOTAL_CHARS = 15000;

function sse(event: { type: string } & Record<string, unknown>): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { systemPrompt, messages } = body as {
      systemPrompt?: string;
      messages?: { role: string; content: string }[];
    };

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ success: false, error: "消息列表不能为空" }, { status: 400 });
    }

    console.log("[think] msgs:", messages.length, "last:", messages[messages.length - 1]?.content?.slice(-200));
    console.log("[think] systemPrompt length:", systemPrompt?.length || 0);

    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ success: false, error: "未配置 DEEPSEEK_API_KEY" }, { status: 500 });
    }

    // Sanitize messages for DeepSeek V4 compatibility
    let truncated = messages.slice(-MAX_MESSAGES).map((m) => {
      let role = m.role as string;
      let content = typeof m.content === "string" ? m.content : "";
      // DeepSeek V4 requires tool_call_id for any message with role="tool"
      // Convert tool messages to user messages to avoid 400 error
      if (role === "tool") {
        role = "user";
        content = `<!-- tool_result:${(m as Record<string,unknown>).toolName || "unknown"} -->\n${content}`;
      }
      // Skip sanitization for messages containing research protocol (has format examples)
      if (!content.includes("【最高优先级指令")) {
        content = content.replace(/<<TOOL>>[\s\S]*?<<\/TOOL>>/g, "");
      }
      content = content.slice(0, MAX_MSG_LEN);
      return { role, content };
    });
    // Cap total context size to avoid overwhelming the model
    let totalChars = truncated.reduce((sum, m) => sum + (typeof m.content === "string" ? m.content.length : 0), 0);
    while (totalChars > MAX_TOTAL_CHARS && truncated.length > 2) {
      truncated = truncated.slice(1);
      totalChars = truncated.reduce((sum, m) => sum + (typeof m.content === "string" ? m.content.length : 0), 0);
    }

    console.log("[think] sending to DeepSeek, msg count:", truncated.length + (systemPrompt ? 1 : 0));

    // Retry up to 2 times on failure (DeepSeek occasionally rate-limits)
    let response: Response | null = null;
    let lastError = "";
    for (let attempt = 0; attempt < 2; attempt++) {
      response = await fetch(DEEPSEEK_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: MODEL,
          messages: [
            ...(systemPrompt ? [{ role: "system", content: systemPrompt }] : []),
            ...truncated,
          ],
          temperature: 0.7,
          max_tokens: 16384,
          stream: true,
        }),
      });

      if (response.ok) break;
      lastError = `${response.status}`;
      if (response.status !== 429 && response.status !== 503) break; // Don't retry non-rate-limit errors
      await new Promise((r) => setTimeout(r, 1000)); // Wait 1s before retry
    }

    if (!response || !response.ok) {
      const errText = response ? await response.text().catch(() => "") : "no response";
      console.error("DeepSeek think error:", lastError, errText.slice(0, 500));
      return NextResponse.json(
        { success: false, error: `DeepSeek API ${lastError}: ${errText.slice(0, 200)}` },
        { status: 502 },
      );
    }

    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        // thinking phase
        controller.enqueue(encoder.encode(sse({ type: "phase", phase: "thinking" })));

        const reader = response.body!.getReader();
        const decoder = new TextDecoder();
        let buffered = "";
        let phaseSent = false;

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const text = decoder.decode(value, { stream: true });
            const lines = text.split("\n");
            for (const line of lines) {
              if (!line.startsWith("data: ")) continue;
              const data = line.slice(6);
              if (data === "[DONE]") continue;
              try {
                const parsed = JSON.parse(data);
                const content = parsed.choices?.[0]?.delta?.content;
                if (content) {
                  buffered += content;
                  // Log first content chunks for debugging
                  if (buffered.length <= 100 && buffered.length + content.length >= 6) {
                    console.log("[think] first content:", buffered.slice(0, 100));
                  }
                  // Wait until 6 chars before switching out of "thinking" phase
                  if (!phaseSent && buffered.length < 6) continue;
                  if (!phaseSent) {
                    controller.enqueue(encoder.encode(sse({ type: "phase", phase: "responding" })));
                    phaseSent = true;
                    // Flush accumulated buffer on first threshold crossing
                    controller.enqueue(encoder.encode(sse({ type: "text", content: buffered })));
                  } else {
                    controller.enqueue(encoder.encode(sse({ type: "text", content })));
                  }
                }
              } catch {
                /* skip */
              }
            }
          }
          controller.enqueue(encoder.encode(sse({ type: "done" })));
        } catch (err) {
          console.error("Think stream error:", err);
        } finally {
          reader.releaseLock();
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "未知错误";
    console.error("Think proxy error:", message);
    return NextResponse.json(
      { success: false, error: `Think 代理失败: ${message}` },
      { status: 500 },
    );
  }
}
