import type { ToolDefinition } from "@/lib/agent/tools/types";

/* ── Client-side search: Wikipedia API ── */
async function searchWikipedia(query: string): Promise<string> {
  const langs = ["zh", "en"];
  for (const lang of langs) {
    try {
      const base = lang === "zh"
        ? "https://zh.wikipedia.org/w/api.php?origin=*"
        : "https://en.wikipedia.org/w/api.php?origin=*";
      const url = `${base}&action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&srlimit=5&srprop=snippet`;
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) continue;
      const data = await res.json();
      const items: { title: string; snippet: string }[] = data?.query?.search || [];
      if (items.length === 0) continue;

      const prefix = lang === "en" ? "https://en.wikipedia.org/wiki/" : "https://zh.wikipedia.org/wiki/";
      const keywords = query.split(/\s+/).filter(k => k.length >= 2);
      const relevant = keywords.length > 0
        ? items.filter((item) => keywords.some(kw => item.title.includes(kw)))
        : items;
      if (relevant.length === 0) continue;
      return relevant
        .map((item, i) => {
          const snippet = stripHtml(item.snippet || "").slice(0, 200);
          return `${i + 1}. ${item.title}\n   ${snippet}\n   ${prefix}${encodeURIComponent(item.title.replace(/ /g, "_"))}`;
        })
        .join("\n\n");
    } catch {
      continue;
    }
  }
  return "";
}

function stripHtml(text: string): string {
  return text.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
}

/* ── Server-side knowledge lookup ── */
async function llmKnowledgeLookup(query: string): Promise<string> {
  try {
    const res = await fetch("/api/agent/search?q=" + encodeURIComponent(query), {
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) return "";
    const json = await res.json();
    if (json.success && typeof json.data === "string" && json.data !== "未找到相关结果") {
      return json.data;
    }
    return "";
  } catch {
    return "";
  }
}

/* ── Tool definition ── */
export const webSearch: ToolDefinition = {
  name: "web_search",
  description: "万能网络搜索，用于查询公司信息、薪资行情、政策法规等求职相关信息。同时调用AI知识库和维基百科。",
  category: "query",
  parameters: {
    query: { type: "string", required: true, description: "搜索关键词" },
  },
  handler: async (params) => {
    const query = params.query as string;

    // Run LLM and Wikipedia in parallel for best coverage
    const [llm, wiki] = await Promise.all([
      llmKnowledgeLookup(query),
      searchWikipedia(query),
    ]);

    // Merge: LLM knowledge (richer) + Wikipedia (verifiable)
    const parts: string[] = [];
    if (llm) parts.push(llm);
    if (wiki) parts.push("【维基百科】\n" + wiki);

    if (parts.length === 0) return { success: true, data: "未找到相关结果" };
    return { success: true, data: parts.join("\n\n") };
  },
  formatResult: (result) => {
    if (!result.success) return `搜索失败: ${result.error}`;
    return String(result.data).slice(0, 1200);
  },
};
