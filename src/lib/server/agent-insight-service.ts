import type { ExecutionPrincipal } from "@/lib/agent/runtime/durable-agent-run";
import { getAgentReadService } from "@/lib/agent/runtime/agent-read-service";
import { assembleAgentMemoryContext } from "@/lib/agent/memory-context";
import { getDataRepositories } from "@/lib/data-repositories";
import type { ReportRow } from "@/lib/server-db";

export async function getPipelineHealthForUser(
  principal: ExecutionPrincipal,
  thresholdDays = 7,
) {
  const applications = await getAgentReadService().listApplications(principal, {});
  const threshold = Number.isFinite(thresholdDays) ? Math.max(1, Math.min(90, Math.floor(thresholdDays))) : 7;
  const now = Date.now();
  const terminalStatuses = new Set(["已拒", "已入职", "已放弃", "Rejected", "Hired", "Withdrawn"]);
  const overdue = applications.flatMap((application) => {
    const timestamp = application.date ? new Date(application.date).getTime() : Number.NaN;
    if (!Number.isFinite(timestamp) || terminalStatuses.has(application.status)) return [];
    const daysSince = Math.floor((now - timestamp) / 86_400_000);
    return daysSince > threshold
      ? [{
          company: application.company || "未知",
          role: application.role || "未知",
          date: application.date,
          daysSince,
          status: application.status || "未知",
        }]
      : [];
  }).sort((left, right) => right.daysSince - left.daysSince);
  return { overdue, healthy: applications.length - overdue.length, total: applications.length };
}

export async function getSkillGapContextForUser(
  principal: ExecutionPrincipal,
  input: { jdText?: string; cvText?: string; reportNum?: number },
) {
  const reads = getAgentReadService();
  let jdText = input.jdText?.trim() || "";
  if (!jdText && input.reportNum) {
    const [report, jds] = await Promise.all([
      reads.getReport(principal, input.reportNum),
      reads.listJds(principal),
    ]);
    const linkedJd = jds.find((jd) => Number(jd.reportId) === Number(input.reportNum));
    jdText = linkedJd?.body || reportToJdContext(report);
  }
  if (jdText.length < 50) {
    throw new Error("JD 文本不足 50 字符。可传入 jd_text 参数，或传 reportNum 从已评估报告获取。");
  }
  const cvText = input.cvText?.trim() || extractResumeText(await reads.getCurrentResume(principal));
  if (cvText.length < 20) {
    throw new Error("CV 信息不完整，建议先完善简历，特别是技能和工作经历栏目。");
  }
  const memory = await assembleAgentMemoryContext({
    userId: principal.userId,
    task: "resume_optimization",
    agentId: "resume",
    query: `${jdText.slice(0, 900)}\n${cvText.slice(0, 900)}`,
    budgetChars: 900,
    semanticTopK: 4,
  }).catch(() => null);
  return { jdText, cvText, memorySummary: memory?.llmSummary || "" };
}

export async function getProfileInsightsForUser(principal: ExecutionPrincipal) {
  const [signals, profile, memory] = await Promise.all([
    getDataRepositories().signals.query({ limit: 1000 }, principal.userId),
    getAgentReadService().getProfile(principal),
    assembleAgentMemoryContext({
      userId: principal.userId,
      task: "career_positioning",
      agentId: "profile",
      query: "用户求职偏好 技能 薪资 岗位 行业 底线",
      budgetChars: 1200,
      semanticTopK: 6,
    }).catch(() => null),
  ]);
  const semanticContext = [
    memory?.llmSummary || "",
    profile ? formatProfile(profile.data, profile.goals) : "",
  ].filter(Boolean).join("\n");
  return {
    signalCount: signals.length,
    semanticContext,
    hasEnoughData: signals.length >= 10 || Boolean(semanticContext),
  };
}

export async function getRecommendationsForUser(
  principal: ExecutionPrincipal,
  input: { limit?: number; role?: string; archetype?: string },
) {
  const reads = getAgentReadService();
  const [profile, applications] = await Promise.all([
    reads.getProfile(principal),
    reads.listApplications(principal, { limit: 100 }),
  ]);
  if (!profile) throw new Error("用户画像未找到，请先创建画像");
  const limit = Number.isFinite(input.limit) ? Math.max(1, Math.min(20, Math.floor(input.limit || 10))) : 10;
  const roleFilter = input.role?.trim().toLowerCase() || "";
  const recentApps = applications
    .filter((application) => !roleFilter || application.role.toLowerCase().includes(roleFilter))
    .slice(0, limit)
    .map((application) => ({
      company: application.company,
      role: application.role,
      score: application.score,
      status: application.status,
      date: application.date,
    }));
  return {
    profile: {
      data: profile.data,
      goals: profile.goals,
      lastUpdated: profile.lastUpdated,
    },
    activity: { totalApplications: applications.length },
    recentApps,
  };
}

function extractResumeText(cvData: Record<string, unknown>): string {
  const versions = objectValue(cvData.versions);
  const activeVersion = stringValue(cvData.activeVersion);
  const active = objectValue(versions[activeVersion] || Object.values(versions)[0]);
  return arrayValue(active.sections).flatMap((section) => {
    const item = objectValue(section);
    const content = stringValue(item.content);
    return content ? [`${stringValue(item.title) || stringValue(item.id)}: ${content}`] : [];
  }).join("\n");
}

function reportToJdContext(report: ReportRow | null): string {
  if (!report) return "";
  const blocks = parseObject(report.blocks_json);
  const blockA = objectValue(blocks.a);
  const overview = stringValue(blockA.content || blocks.a);
  return [report.role, report.company, overview].map(stringValue).filter(Boolean).join(" - ");
}

function formatProfile(data: Record<string, unknown>, goals: Record<string, unknown>): string {
  return `画像数据: ${JSON.stringify(data).slice(0, 900)}\n求职目标: ${JSON.stringify(goals).slice(0, 600)}`;
}

function parseObject(value: unknown): Record<string, unknown> {
  try {
    return objectValue(typeof value === "string" ? JSON.parse(value) : value);
  } catch {
    return {};
  }
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}
