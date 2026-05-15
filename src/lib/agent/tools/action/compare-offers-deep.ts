import type { ToolDefinition, ToolResult } from "../types";

interface OfferData {
  company: string;
  role: string;
  salary?: string;
  bonus?: string;
  equity?: string;
  location?: string;
  level?: string;
  benefits?: string;
  monthlySalary?: number;
  monthsPerYear?: number;
}

async function handler(params: Record<string, unknown>): Promise<ToolResult> {
  let { offers } = params as { offers: OfferData[] };
  const offerIds = (params.offerIds as number[]) || [];

  // Support offerIds: fetch stored offers from API
  if ((!offers || !Array.isArray(offers) || offers.length === 0) && offerIds.length > 0) {
    try {
      const fetched: OfferData[] = [];
      for (const id of offerIds) {
        const res = await fetch(`/api/offers/${id}`);
        if (res.ok) {
          const json = await res.json();
          if (json.success && json.data) {
            fetched.push(json.data as OfferData);
          }
        }
      }
      if (fetched.length > 0) offers = fetched;
    } catch { /* fall through */ }
  }

  if (!offers || !Array.isArray(offers) || offers.length < 1) {
    return { success: false, data: null, error: "至少需要 1 个 offer（传 offers 数组或 offerIds 从数据库读取）", errorCategory: "need_user_input" };
  }

  try {
    // Persist each offer to SQLite via API
    const saved: number[] = [];
    for (const o of offers) {
      try {
        const res = await fetch("/api/offers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            company: o.company || "未知公司",
            role: o.role || "未知岗位",
            monthly_salary: o.monthlySalary || 0,
            bonus: o.bonus || null,
            equity: o.equity || null,
            location: o.location || null,
            level: o.level || null,
            benefits: o.benefits ? (typeof o.benefits === "string" ? JSON.parse(o.benefits) : o.benefits) : {},
          }),
        });
        const json = await res.json();
        if (json.success) saved.push(json.data.id);
      } catch { /* individual save failure is non-fatal */ }
    }

    // Load ofertas mode framework for comparison dimensions
    const modeRes = await fetch("/api/agent/mode/ofertas");
    const modeJson = modeRes.ok ? await modeRes.json() : null;
    const framework = modeJson?.data?.content || "";

    return {
      success: true,
      data: { offers, framework, savedIds: saved },
      errorCategory: "ok",
    };
  } catch {
    return { success: true, data: { offers, framework: "" }, errorCategory: "ok" };
  }
}

function formatResult(result: ToolResult): string {
  if (!result.success) return `对比失败: ${result.error}`;
  const d = result.data as { offers: OfferData[]; framework: string; savedIds?: number[] };

  const rows = d.offers.map((o, i) =>
    `| ${i + 1} | ${o.company || "未知"} | ${o.role || "未知"} | ${o.salary || o.monthlySalary || "未提供"} | ${o.location || "未提供"} | ${o.level || "未提供"} |`
  ).join("\n");

  const savedNote = d.savedIds?.length
    ? `\n已保存到数据库，ID: ${d.savedIds.join(", ")}`
    : "";

  return `## 📊 Offer 对比${savedNote}

| # | 公司 | 岗位 | 薪资 | 地点 | 职级 |
|---|------|------|------|------|------|
${rows}

请从以下 6 个维度对上述 offer 进行对比分析：
1. **薪资福利** — 税前/税后、公积金、补贴、期权
2. **职级成长** — 级别含金量、晋升通道、技术栈
3. **稳定性** — 公司阶段、资金状况、裁员风险
4. **文化氛围** — 工作强度(996/大小周/双休)、团队氛围
5. **地理位置** — 通勤、生活成本、落户政策
6. **长期价值** — 品牌背书、人脉积累、行业前景

请给出加权推荐和谈判策略。`;
}

export const compareOffersDeep: ToolDefinition = {
  name: "compare_offers_deep",
  description: "深度对比2个或更多 offer。用户粘贴2个offer、说'选哪个''对比''比较'时调用。单个offer评估用 evaluate_offer。",
  matchHints: ["对比", "比较", "选哪个", "两个offer", "2个offer", "多个offer", "选offer"],
  parameters: {
    offers: { type: "array", required: false, description: "Offer 列表（与 offerIds 二选一）" },
    offerIds: { type: "array", required: false, description: "已存储 Offer 的 ID 列表，自动从数据库读取（与 offers 二选一）" },
  },
  category: "action",
  toolCtxCap: 3000,
  handler,
  formatResult,
};
