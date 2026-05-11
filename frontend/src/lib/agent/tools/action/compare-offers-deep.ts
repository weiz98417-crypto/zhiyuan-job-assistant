import type { ToolDefinition, ToolResult } from "../types";

interface OfferData {
  company: string;
  role: string;
  salary: string;
  bonus?: string;
  equity?: string;
  location?: string;
  level?: string;
  benefits?: string;
}

interface OfferCompareParams {
  offers: OfferData[];
}

async function handler(params: Record<string, unknown>): Promise<ToolResult> {
  const { offers } = params as OfferCompareParams;
  if (!offers || !Array.isArray(offers) || offers.length < 2) {
    return { success: false, data: null, error: "至少需要 2 个 offer 进行对比" };
  }

  try {
    // Load ofertas mode framework for comparison dimensions
    const modeRes = await fetch("/api/agent/mode/ofertas");
    const modeJson = modeRes.ok ? await modeRes.json() : null;
    const framework = modeJson?.data?.content || "";

    return {
      success: true,
      data: { offers, framework },
    };
  } catch {
    return { success: true, data: { offers, framework: "" } };
  }
}

function formatResult(result: ToolResult): string {
  if (!result.success) return `对比失败: ${result.error}`;
  const d = result.data as { offers: OfferData[]; framework: string };

  const rows = d.offers.map((o, i) =>
    `| ${i + 1} | ${o.company} | ${o.role} | ${o.salary} | ${o.location || "未提供"} | ${o.level || "未提供"} |`
  ).join("\n");

  return `## 📊 Offer 对比\n\n| # | 公司 | 岗位 | 薪资 | 地点 | 职级 |\n|---|------|------|------|------|------|\n${rows}\n\n请从以下 6 个维度对上述 offer 进行对比分析：\n1. **薪资福利** — 税前/税后、公积金、补贴、期权\n2. **职级成长** — 级别含金量、晋升通道、技术栈\n3. **稳定性** — 公司阶段、资金状况、裁员风险\n4. **文化氛围** — 工作强度(996/大小周/双休)、团队氛围\n5. **地理位置** — 通勤、生活成本、落户政策\n6. **长期价值** — 品牌背书、人脉积累、行业前景\n\n请给出加权推荐和谈判策略。`;
}

export const compareOffersDeep: ToolDefinition = {
  name: "compare_offers_deep",
  description: "深度对比多个 offer，从薪资/职级/成长/稳定性/文化/地点 6 个维度分析，给出加权推荐和谈判策略。当用户说'选哪个offer''对比offer'时调用此工具。",
  parameters: {
    offers: { type: "array", required: true, description: "Offer 列表，每项包含 { company, role, salary, bonus?, equity?, location?, level? }" },
  },
  category: "action",
  handler,
  formatResult,
};
