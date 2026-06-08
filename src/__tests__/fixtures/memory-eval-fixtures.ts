import type { ImageIntakeResult } from "@/lib/agent/image-intake";
import type { MemoryEvalReference, MemoryEvalSource, PatternGuidanceCandidate } from "@/lib/memory/eval-harness";
import type { ReferenceResumeSection } from "@/lib/reference-resume-vector";

export const aiPmExcellentResumeSections: ReferenceResumeSection[] = [
  {
    id: "summary",
    title: "Summary",
    content: "AI Product Manager with 4 years of experience shipping RAG assistants, agent workflow tools, analytics dashboards, and prompt evaluation systems for B2B users.",
  },
  {
    id: "projects",
    title: "Projects",
    content: [
      "Owned a 0-to-1 RAG knowledge base for enterprise support. Defined retrieval metrics, prompt evaluation workflow, permission model, and launch roadmap; improved answer accuracy by 28% across 12 pilot teams.",
      "Designed an agent workflow console that automated data labeling, quality review, and exception routing. Partnered with engineering, operations, and sales to reduce manual review time by 35%.",
    ].join("\n"),
  },
  {
    id: "experience",
    title: "Experience",
    content: "Led roadmap planning, PRD writing, stakeholder alignment, dashboard instrumentation, and post-launch experiments for AI product features used by 80k monthly active users.",
  },
  {
    id: "skills",
    title: "Skills",
    content: "AI product strategy, RAG, Agent workflow design, Prompt Engineering, SQL, dashboard metrics, A/B experiments, user research, launch planning.",
  },
  {
    id: "education",
    title: "Education",
    content: "MSc Computer Science, focus on machine learning and software engineering.",
  },
];

export const aiPmExcellentResumeText = aiPmExcellentResumeSections
  .map((section) => `[${section.title}]\n${section.content}`)
  .join("\n\n");

export const targetUserResumeSection = [
  "BioLid health device project: built computer vision and hardware prototype for physiological state monitoring.",
  "Used camera signals and model inference to detect fatigue and provide intervention suggestions.",
  "Current wording lacks product goal, business metric, stakeholder process, and JD-facing AI product framing.",
].join(" ");

export const targetAiPmJd = [
  "Role: AI Product Manager",
  "Responsibilities: build AI agent workflows for data generation, evaluation, labeling, retrieval, and dashboard monitoring.",
  "Requirements: RAG knowledge base experience, prompt engineering, product metrics, cross-functional delivery, and user research.",
].join("\n");

export const referenceEvalFixtures: MemoryEvalReference[] = [
  {
    id: 101,
    ownerUserId: "user-a",
    name: "Redacted AI PM Reference A",
    roleCategory: "ai_product_manager",
    sectionType: "projects",
    text: aiPmExcellentResumeSections[1].content,
    visibility: "private",
    status: "active",
    quality: 0.92,
    acceptedCount: 2,
    rejectedCount: 0,
  },
  {
    id: 102,
    ownerUserId: "user-a",
    name: "Redacted AI PM Reference B",
    roleCategory: "ai_product_manager",
    sectionType: "experience",
    text: aiPmExcellentResumeSections[2].content,
    visibility: "private",
    status: "active",
    quality: 0.86,
  },
  {
    id: 103,
    ownerUserId: "user-b",
    name: "Other User Private Reference",
    roleCategory: "ai_product_manager",
    sectionType: "projects",
    text: "Private AI Product Manager resume with RAG agent metrics that must not cross users.",
    visibility: "private",
    status: "active",
    quality: 0.99,
  },
  {
    id: 104,
    ownerUserId: "user-b",
    name: "Approved Team AI PM Reference",
    roleCategory: "ai_product_manager",
    sectionType: "projects",
    text: "Redacted team reference: launched an AI agent dashboard for prompt evaluation, risk review, and workflow analytics.",
    visibility: "team",
    status: "active",
    quality: 0.84,
    redacted: true,
  },
  {
    id: 105,
    ownerUserId: "user-b",
    name: "Pending Team Reference",
    roleCategory: "ai_product_manager",
    sectionType: "projects",
    text: "Pending team reference with useful RAG agent wording but no admin approval.",
    visibility: "team_pending",
    status: "active",
    quality: 0.91,
  },
  {
    id: 106,
    ownerUserId: "user-a",
    name: "Offer Negotiation Reference",
    roleCategory: "general",
    sectionType: "offer",
    text: "Offer negotiation notes about salary, stock, benefits, and start date.",
    visibility: "private",
    status: "active",
    quality: 0.7,
  },
];

export const boundaryImageFixtures: Record<string, ImageIntakeResult> = {
  resume: {
    documentType: "resume",
    confidence: 0.94,
    quality: "clear",
    extractedText: aiPmExcellentResumeText,
    structured: { roleCategory: "AI Product Manager", name: "Redacted Candidate" },
  },
  jd: {
    documentType: "jd",
    confidence: 0.95,
    quality: "clear",
    extractedText: targetAiPmJd,
  },
  offer: {
    documentType: "offer",
    confidence: 0.95,
    quality: "clear",
    extractedText: "Company: Acme AI\nRole: AI Product Manager\nCompensation: 30k x 15 plus bonus.",
  },
  unrelated: {
    documentType: "chat_screenshot",
    confidence: 0.9,
    quality: "clear",
    extractedText: "Team dinner starts at 7pm. Please bring the projector.",
  },
};

export const memoryEvalSources: MemoryEvalSource[] = [
  {
    id: "ref-101",
    type: "reference_resume_raw",
    ownerUserId: "user-a",
    visibility: "private",
    status: "active",
    text: referenceEvalFixtures[0].text,
  },
  {
    id: "pattern-201",
    type: "excellent_resume_pattern",
    ownerUserId: "user-a",
    visibility: "private",
    status: "candidate",
    text: "Frame AI product experience as business goal -> technical workflow -> evaluation loop -> measurable result.",
  },
];

export const noMemoryOptimizationOutput = "Built a computer vision health device prototype and detected fatigue from camera signals.";

export const memoryEnabledOptimizationOutput = [
  "Reframed the BioLid health device as an AI product workflow: defined the user fatigue-monitoring goal, mapped camera signals into an agent-style detect -> decide -> intervene loop, and created dashboard metrics for detection accuracy and intervention completion.",
  "Partnered with hardware and algorithm stakeholders to turn the prototype into a measurable product story aligned with the JD's RAG, agent workflow, evaluation, and data-product requirements.",
].join(" ");

export const copiedOptimizationOutput = [
  "Owned a 0 to 1 RAG knowledge base for enterprise support defined retrieval metrics prompt evaluation workflow permission model and launch roadmap improved answer accuracy by 28 percent across 12 pilot teams.",
].join(" ");

export const patternGuidanceFixtures: PatternGuidanceCandidate[] = [
  {
    id: "active-good",
    status: "active",
    text: "Frame AI product projects as goal, workflow, evaluation loop, and measurable product impact.",
    confidence: 0.82,
    importance: 0.8,
    evidenceCount: 2,
  },
  {
    id: "candidate-weak",
    status: "candidate",
    text: "Good communication.",
    confidence: 0.5,
    importance: 0.4,
    evidenceCount: 0,
  },
  {
    id: "rejected",
    status: "rejected",
    text: "Copy the reference resume wording directly.",
    confidence: 0.9,
    importance: 0.9,
    evidenceCount: 3,
  },
];
