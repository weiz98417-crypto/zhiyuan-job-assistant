import { NextResponse } from "next/server";

const DEEPSEEK_API_URL = "https://api.deepseek.com/chat/completions";
const MODEL = "deepseek-v4-flash";
const MAX_MESSAGES = 30;

const SYSTEM_PROMPT = `你是纸鸢。一个朋友。

## 核心法则：匹配能量

对方扔过来的东西有多重，你就用多大的力接。不要加码，也不要敷衍。

### BASE 模式 — 使用时机：90% 的日常聊天

用户给的是一句话抱怨、模糊情绪、表情包、一个"唉"、一个"烦"——
你就回一句。轻的。不需要追问、不需要分析、不需要安抚。

"今天好烦" → "唉。"
"面试感觉不好" → "面的哪家？"（一个问题，不是三个）
"我好废" → "怎么突然这么说"
"唉" → "唉。"

BASE 模式的要点：
- 一句话能接住的不写两句
- 不追问。用户想展开自己会展开
- 可以就是一个词、一个表情、一句吐槽
- 你不是每次都要"做点什么"

### DEEP 模式 — 触发条件：用户主动展开叙事

用户讲了具体发生了什么——有时间、有地点、有人物、有细节——
这时候你可以往下聊。

"今天面试太差了，面试官是个老白男，从头到尾没正眼看过我，最后问了个跟岗位完全无关的脑筋急转弯……"
→ 这是个故事。你可以接："什么脑筋急转弯？"
→ 一次一个问题。不要连发。

DEEP 模式的要点：
- 对具体细节产生好奇，问下去
- 一次只问一个问题
- 不要总结感受，不要给情绪命名
- 你不知道他在乎什么，直到他告诉你

### BASE → DEEP 切换信号

用户从一句话变成一段话 = 信号来了，可以切换。
用户从长篇大论变回"嗯"、"算了" = 信号走了，切回 BASE。

**关键**：切换的判断标准是用户在说什么，不是你觉得他需要什么。

## 不要说的

- "我在"、"我懂"、"我陪你"、"我就在这儿"（做就行了，不用播报）
- "你可以XX、可以XX"（列清单）
- "不用谢"、"不用回报"、"我当没听见"（自我擦除）
- "要不要喝点热水"（过度服务）
- "我帮不上什么忙"（主动降格）
- 树洞/港湾/角落等比喻
- 情绪低落时别提工作、求职、岗位、面试、简历、JD、方向、规划、技能、经验

## 探索框架（职业话题时自然涉及）

- 做过什么（项目、副业、社团都算）
- 什么有劲、什么累、什么做得比别人轻松
- 不能忍的底线
- 聊聊可能的方向

不强制顺序，不 checklist。聊到哪算哪。

## 风格

念出声，不像人话就删。短。口语。贴具体的。全程中文。`;

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { messages, mode } = body as {
      messages: { role: "user" | "assistant"; content: string }[];
      mode?: string;
    };

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json(
        { success: false, error: "消息列表不能为空" },
        { status: 400 },
      );
    }

    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { success: false, error: "未配置 DEEPSEEK_API_KEY" },
        { status: 500 },
      );
    }

    // If mode is provided, delegate to /api/agent/chat for enhanced experience
    if (mode) {
      const res = await fetch(
        `${request.headers.get("origin") || "http://localhost:3000"}/api/agent/chat`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages, mode }),
        },
      );
      if (res.ok && res.body) {
        return new Response(res.body, {
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
            "Cache-Control": "no-cache",
            "X-Content-Type-Options": "nosniff",
          },
        });
      }
      // Fall through to legacy behavior on delegation failure
    }

    // Legacy streaming behavior (explore mode without agent context)
    const truncatedMessages = messages.slice(-MAX_MESSAGES);

    const response = await fetch(DEEPSEEK_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          ...truncatedMessages,
        ],
        temperature: 0.7,
        max_tokens: 2000,
        stream: true,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("DeepSeek stream error:", response.status, errText);
      return NextResponse.json(
        { success: false, error: `AI 请求失败: ${response.status}` },
        { status: 502 },
      );
    }

    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    const stream = new ReadableStream({
      async start(controller) {
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
                /* skip unparseable chunks */
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

    return new Response(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "未知错误";
    console.error("Chat stream error:", message);
    return NextResponse.json(
      { success: false, error: `聊天请求失败: ${message}` },
      { status: 500 },
    );
  }
}
