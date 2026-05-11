/* ── DeepSeek v4 Flash JD Evaluation API ── */

import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const DEEPSEEK_API_URL = "https://api.deepseek.com/chat/completions";
const MODEL = "deepseek-v4-flash";

interface BlockScores {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
  g: string;
}

interface EvalResult {
  success: boolean;
  data?: {
    reportNum: number;
    date: string;
    company: string;
    role: string;
    archetype: string;
    overallScore: number;
    legitimacy: string;
    blocks: Record<string, string>;
    scores: BlockScores;
    keywords: string[];
    keywordCoverage?: { overall: number; items: { keyword: string; status: string }[] };
    skillGaps?: { skill: string; importance: string; substitution: string }[];
    levelMatch?: { level: string; match: string; note: string };
    differentiationTips?: { jdEmphasis: string; resumeWeakness: string; tip: string }[];
    fullMarkdown: string;
  };
  error?: string;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { jdText, language, cvText, userProfile } = body as {
      jdText: string;
      language?: "zh" | "en";
      cvText?: string;
      userProfile?: {
        superpowers: string[];
        headline: string;
        exitStory: string;
        targetRoles: { name: string; fit: string }[];
      };
    };

    if (!jdText || jdText.trim().length < 50) {
      return NextResponse.json(
        { success: false, error: "JD 文本太短，请粘贴完整的职位描述（至少 50 字）" },
        { status: 400 }
      );
    }

    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { success: false, error: "未配置 DEEPSEEK_API_KEY 环境变量" },
        { status: 500 }
      );
    }

    // Load the evaluation prompt — English or Chinese
    const isEnglish = language === "en";
    const modesDir = isEnglish ? path.join(process.cwd(), "modes") : path.join(process.cwd(), "modes", "zh");
    const sharedPath = path.join(modesDir, "_shared.md");
    const evalPath = path.join(modesDir, isEnglish ? "oferta.md" : "jianzhi.md");
    const profilePath = path.join(modesDir, "_profile.md");

    let systemContext = "";
    if (fs.existsSync(sharedPath)) systemContext += fs.readFileSync(sharedPath, "utf-8") + "\n\n";
    if (fs.existsSync(evalPath)) systemContext += fs.readFileSync(evalPath, "utf-8") + "\n\n";
    if (fs.existsSync(profilePath)) systemContext += fs.readFileSync(profilePath, "utf-8");

    // Build the system prompt
    const systemPrompt = isEnglish
      ? `You are an AI job search evaluation engine. Evaluate the job description according to the rules below and generate a report.

${systemContext}

Output format:
Return JSON with this structure:
{
  "company": "Company name",
  "role": "Job title",
  "archetype": "Matched archetype",
  "overallScore": 4.2,
  "legitimacy": "Real/Suspicious/Uncertain",
  "scores": {
    "a": 4.0,
    "b": 4.5,
    "c": 4.0,
    "d": 3.5,
    "e": 4.0,
    "f": 4.5,
    "g": "Real"
  },
  "blocks": {
    "a": "Block A role overview markdown...",
    "b": "Block B CV match markdown...",
    "c": "Block C level & strategy markdown...",
    "d": "Block D compensation markdown...",
    "e": "Block E tailored approach markdown...",
    "f": "Block F interview prep markdown...",
    "g": "Block G legitimacy check markdown..."
  },
  "keywords": ["keyword1", "keyword2", ...],
  "keywordCoverage": {
    "overall": 65,
    "items": [
      { "keyword": "Python", "status": "covered" },
      { "keyword": "Kubernetes", "status": "missing" },
      { "keyword": "Figma", "status": "weak" }
    ]
  },
  "skillGaps": [
    { "skill": "Kubernetes", "importance": "required", "substitution": "Can explain willingness to learn based on Docker experience" }
  ],
  "levelMatch": { "level": "P6-P7", "match": "match", "note": "Your YOE matches this JD's requirements" },
  "differentiationTips": [
    { "jdEmphasis": "0-to-1 experience", "resumeWeakness": "Resume focuses on maintenance", "tip": "Add build-from-scratch project descriptions if applicable" }
  ]
}`
      : `你是一个 AI 求职评估引擎。根据以下规则评估职位描述并生成中文报告。

${systemContext}

输出格式要求：
返回 JSON，结构如下：
{
  "company": "公司名称",
  "role": "岗位名称",
  "archetype": "匹配的archetype类型",
  "overallScore": 4.2,
  "legitimacy": "真实/疑似/不确定",
  "scores": {
    "a": 4.0,
    "b": 4.5,
    "c": 4.0,
    "d": 3.5,
    "e": 4.0,
    "f": 4.5,
    "g": "真实"
  },
  "blocks": {
    "a": "Block A 职位概览的 markdown 内容...",
    "b": "Block B 简历匹配的 markdown 内容...",
    "c": "Block C 职级与策略的 markdown 内容...",
    "d": "Block D 薪资与市场的 markdown 内容...",
    "e": "Block E 定制化方案的 markdown 内容...",
    "f": "Block F 面试准备的 markdown 内容...",
    "g": "Block G 职位合法性的 markdown 内容..."
  },
  "keywords": ["关键词1", "关键词2", ...],
  "keywordCoverage": {
    "overall": 65,
    "items": [
      { "keyword": "Python", "status": "covered" },
      { "keyword": "Kubernetes", "status": "missing" },
      { "keyword": "Figma", "status": "weak" }
    ]
  },
  "skillGaps": [
    { "skill": "Kubernetes", "importance": "required", "substitution": "可用Docker经验解释学习意愿" }
  ],
  "levelMatch": { "level": "P6-P7", "match": "match", "note": "你的经验年限与该JD要求相符" },
  "differentiationTips": [
    { "jdEmphasis": "0到1搭建经验", "resumeWeakness": "简历侧重维护和迭代", "tip": "如有搭建经历建议补充到项目描述" }
  ]
}`;

    const response = await fetch(DEEPSEEK_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: (isEnglish
            ? `${userProfile ? `Candidate profile — Skills: ${userProfile.superpowers.join(", ") || "N/A"}. Headline: ${userProfile.headline || "N/A"}. Story: ${userProfile.exitStory || "N/A"}. Target roles: ${userProfile.targetRoles.map(r => r.name).join(", ") || "N/A"}.\n\n` : ""}${cvText ? `Candidate's full CV:\n${cvText}\n\n` : "NOTE: No CV data available. For Block B (CV Match), output a placeholder message (score b=0) stating that CV matching requires the user to first fill in their resume on the CV Optimization page.\n\n"}Evaluate this job description:\n\n${jdText}`
            : `${userProfile ? `求职者信息 — 技能: ${userProfile.superpowers.join(", ") || "未知"}。头衔: ${userProfile.headline || "未知"}。职业故事: ${userProfile.exitStory || "未知"}。目标方向: ${userProfile.targetRoles.map(r => r.name).join(", ") || "未知"}。\n\n` : ""}${cvText ? `候选人完整简历：\n${cvText}\n\n` : "注意：没有简历数据。Block B（简历匹配）请输出占位说明（评分 b=0），提示用户需先在简历优化页面完善简历。\n\n"}请评估以下职位描述：\n\n${jdText}`) },
        ],
        temperature: 0.3,
        max_tokens: 12000,
        response_format: { type: "json_object" },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("DeepSeek API error:", response.status, errText);
      return NextResponse.json(
        { success: false, error: `AI 评估请求失败: ${response.status}` },
        { status: 502 }
      );
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      return NextResponse.json(
        { success: false, error: "AI 返回为空" },
        { status: 500 }
      );
    }

    // Parse the JSON response
    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch {
      // Try extracting JSON from markdown code block
      const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[1]);
      } else {
        return NextResponse.json(
          { success: false, error: "AI 返回格式解析失败" },
          { status: 500 }
        );
      }
    }

    const result: EvalResult = {
      success: true,
      data: {
        reportNum: 0, // Will be assigned by frontend
        date: new Date().toISOString().split("T")[0],
        company: parsed.company || "未知公司",
        role: parsed.role || "未知岗位",
        archetype: parsed.archetype || "未检测",
        overallScore: parsed.overallScore || 0,
        legitimacy: parsed.legitimacy || "不确定",
        blocks: parsed.blocks || {},
        scores: parsed.scores || { a: 0, b: 0, c: 0, d: 0, e: 0, f: 0, g: "" },
        keywords: parsed.keywords || [],
        keywordCoverage: parsed.keywordCoverage || { overall: 0, items: [] },
        skillGaps: parsed.skillGaps || [],
        levelMatch: parsed.levelMatch || { level: "", match: "unknown", note: "" },
        differentiationTips: parsed.differentiationTips || [],
        fullMarkdown: content,
      },
    };

    return NextResponse.json(result);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "未知错误";
    console.error("Evaluate API error:", message);
    return NextResponse.json(
      { success: false, error: `评估失败: ${message}` },
      { status: 500 }
    );
  }
}
