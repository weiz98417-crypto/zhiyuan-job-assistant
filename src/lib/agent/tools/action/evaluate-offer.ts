import type { ToolDefinition, ToolResult } from "../types";

async function handler(params: Record<string, unknown>): Promise<ToolResult> {
  const offerText = String(params.offerText || "");
  if (offerText.length < 20) {
    return { success: false, data: null, error: "请提供完整的 Offer 文本（至少20字）", errorCategory: "need_user_input" };
  }

  try {
    // Save to SQLite
    let savedId: number | null = null;
    try {
      const res = await fetch("/api/offers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company: "待提取", role: "待提取", monthly_salary: 0, benefits: {} }),
      });
      const json = await res.json();
      if (json.success) savedId = json.data.id;
    } catch { /* non-fatal */ }

    // Load oferta mode as analysis framework
    const modeRes = await fetch("/api/agent/mode/oferta");
    const modeJson = modeRes.ok ? await modeRes.json() : null;
    const framework = modeJson?.data?.content || "";

    return { success: true, data: { offerText, framework, savedId }, errorCategory: "ok" };
  } catch {
    return { success: true, data: { offerText, framework: "" }, errorCategory: "ok" };
  }
}

function formatResult(result: ToolResult): string {
  if (!result.success) return `Offer 评估失败: ${result.error}`;
  const d = result.data as { offerText: string; framework: string };
  const preview = d.offerText.slice(0, 2000);

  return `## 📋 Offer 评估请求

以下是用户提供的 Offer 内容：

${preview}${d.offerText.length > 2000 ? "\n...(已截断)" : ""}

请从以下维度对该 Offer 进行全面评估：

1. **薪资结构** — 月薪/年薪/税前税后、13薪/14薪、奖金结构、期权/股票
2. **福利待遇** — 五险一金基数与比例、公积金、补充医保、年假、餐补交通补
3. **职级与成长** — 职级含金量、汇报线、团队规模、晋升通道
4. **公司风险** — 融资阶段、裁员历史、业务稳定性
5. **法律条款** — 竞业限制、试用期时长与薪资、劳动合同期限
6. **市场竞争力** — 对标同行业同级别薪资水平

请给每个维度打分 (1-5)，输出综合评分和是否建议接受的推荐。`;
}

export const evaluateOffer: ToolDefinition = {
  name: "evaluate_offer",
  description: "评估单个录取 Offer，从薪资/福利/成长/风险/法律/市场 6 个维度分析。用户说'评估offer''这个offer怎么样''帮我看下offer'时调用。",
  matchHints: ["offer", "Offer", "录取", "薪资", "offer评估"],
  parameters: {
    offerText: { type: "string", required: true, description: "Offer 文本内容（粘贴完整 offer 原文）" },
    company: { type: "string", required: false, description: "公司名预填（提高数据库记录质量）" },
    role: { type: "string", required: false, description: "岗位名预填" },
  },
  category: "action",
  toolCtxCap: 3000,
  handler,
  formatResult,
};
