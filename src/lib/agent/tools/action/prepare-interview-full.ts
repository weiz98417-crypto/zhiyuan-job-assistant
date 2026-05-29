import type { ToolDefinition, ToolResult } from "../types";

interface InterviewPrepParams {
  company?: string;
  role?: string;
}

async function handler(params: Record<string, unknown>): Promise<ToolResult> {
  const { company, role } = params as InterviewPrepParams;

  const [interviewRes, storyRes] = await Promise.all([
    fetch("/api/agent/mode/interview-prep"),
    fetch("/api/agent/mode/interview-prep"), // story-bank loaded separately below
  ]);

  let prepFramework = "";
  if (interviewRes.ok) {
    const json = await interviewRes.json();
    prepFramework = json.data?.content || "";
  }

  // Load story bank via API
  let storyBank = "";
  try {
    const sbRes = await fetch("/api/agent/mode/interview-prep");
    // story-bank.md is in interview-prep/ not modes/zh/
    // Use separate fetch
    const storyFetch = await fetch("/api/data/story-bank");
    if (storyFetch.ok) {
      const sbJson = await storyFetch.json();
      storyBank = sbJson.data?.content || "";
    }
  } catch { /* best-effort */ }

  const target = company ? `${company} ${role || ""}`.trim() : "通用";

  return {
    success: true,
    data: {
      target,
      prepFramework,
      storyBank,
      hasPrepFramework: !!prepFramework,
      hasStoryBank: !!storyBank,
    },
  };
}

function formatResult(result: ToolResult): string {
  if (!result.success) return `面试准备生成失败: ${result.error}`;
  const d = result.data as { target: string; hasPrepFramework: boolean; hasStoryBank: boolean };

  let output = `## 🎯 面试准备方案\n\n**目标：${d.target}**\n\n`;
  if (!d.hasPrepFramework) output += "⚠️ 面试准备模式文件未加载（系统维护中），以下为通用框架。\n\n";

  output += "### 请生成以下内容：\n";
  output += "1. **技术/专业面**：与目标岗位直接相关的知识点和常见问题\n";
  output += "2. **行为面**：基于 STAR 法则的行为问题及回答框架\n";
  output += "3. **HR 面**：薪资期望、离职原因、职业规划等标准问题\n";
  output += "4. **群面/案例分析**：（如适用）常见群面题型和应对策略\n";
  output += "5. **薪资谈判**：谈判话术、时机、底线策略\n";
  output += "6. **反问建议**：面试结束时可问面试官的问题\n";

  if (d.hasStoryBank) output += "\n📚 STAR 故事库已加载，请从中匹配用户经历对应目标岗位。\n";

  return output;
}

export const prepareInterviewFull: ToolDefinition = {
  name: "prepare_interview_full",
  description: "生成完整面试准备方案：技术面/行为面/HR面/群面题目 + 薪资谈判策略 + 反问建议 + STAR故事匹配。当用户说'准备面试''面XX准备什么''怎么准备XX面试'时调用此工具。",
  parameters: {
    company: { type: "string", required: false, description: "目标公司名，如'字节跳动'" },
    role: { type: "string", required: false, description: "目标岗位，如'AI产品经理'" },
    focus: { type: "string", required: false, description: "聚焦方向: technical/behavioral/case/hr/all，默认 all" },
    difficulty: { type: "string", required: false, description: "难度: junior/mid/senior/staff，默认 mid" },
  },
  category: "action",
  handler,
  formatResult,
};
