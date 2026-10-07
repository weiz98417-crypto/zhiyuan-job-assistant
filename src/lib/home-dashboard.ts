import { normalizeApplicationStatus } from "@/lib/application-status";
import type { Application, InterviewSchedule } from "@/types";

export interface HomeAction {
  id: string; kind: "interview" | "followup" | "apply"; company: string; role: string;
  reason: string; dueLabel: string; href: string; actionLabel: string; priority: number; sortTime: number;
}

function validDate(value: string | Date | undefined): Date | null {
  if (!value) return null;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(value)) ? new Date(`${value}T00:00:00`) : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}
function calendarDay(date: Date) { return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400000; }

export function buildHomeActions(applications: Application[], interviews: InterviewSchedule[], now = new Date()): HomeAction[] {
  const actions: HomeAction[] = []; const today = calendarDay(now);
  for (const interview of interviews) {
    const date = validDate(interview.date); if (!date) continue;
    const days = calendarDay(date) - today; if (days < 0 || days > 7) continue;
    const scheduled = interview.time ? validDate(`${interview.date}T${interview.time}`) : null;
    if (scheduled && scheduled < now) continue;
    actions.push({ id: `interview-${interview.id ?? `${interview.company}-${interview.role}-${interview.round}`}-${interview.date}`, kind: "interview", company: interview.company, role: interview.role, reason: days === 0 ? "今天有面试，打开清单整理回答素材。" : `${days} 天后有面试，给准备留一点从容的时间。`, dueLabel: days === 0 ? "今天有面试" : `${days} 天后面试`, href: "/interview", actionLabel: "准备面试", priority: days <= 2 ? 0 : 2, sortTime: (scheduled || date).getTime() });
  }
  for (const application of applications) {
    const status = normalizeApplicationStatus(application.status); const persisted = application as Application & { updated_at?: string };
    const date = status === "interview" ? validDate(persisted.updatedAt) || validDate(persisted.updated_at) || validDate(application.date) : validDate(application.date);
    if (!date) continue; const days = today - calendarDay(date); const id = application.id ?? `${application.num}-${application.company}-${application.role}`;
    if (status === "interview" && days > 3) actions.push({ id: `followup-${id}`, kind: "followup", company: application.company, role: application.role, reason: `面试中记录已有 ${days} 天未更新，可以确认进度或发送跟进。`, dueLabel: `${days} 天未更新`, href: "/tracker?status=interview", actionLabel: "查看并跟进", priority: 1, sortTime: date.getTime() });
    if (status === "evaluated" && days > 7) actions.push({ id: `apply-${id}`, kind: "apply", company: application.company, role: application.role, reason: `评估后 ${days} 天未投递，确认意愿后决定是否继续推进。`, dueLabel: `${days} 天待决定`, href: "/tracker?status=evaluated", actionLabel: "决定下一步", priority: 3, sortTime: date.getTime() });
  }
  return actions.sort((left, right) => left.priority - right.priority || left.sortTime - right.sortTime || left.id.localeCompare(right.id));
}

export function getHomeSnapshot(applications: Application[], reportCount: number, offerCount: number, now = new Date()) {
  const statuses = applications.map((application) => normalizeApplicationStatus(application.status));
  const countStatus = (status: string) => statuses.filter((value) => value === status).length;
  const scored = applications.filter((application) => Number.isFinite(application.score) && application.score > 0);
  const today = calendarDay(now);
  const weeklyNew = applications.filter((application) => { const date = validDate(application.date); if (!date) return false; const days = today - calendarDay(date); return days >= 0 && days < 7; }).length;
  return { evaluated: Math.max(reportCount, countStatus("evaluated")), applied: statuses.filter((status) => ["applied", "responded", "interview", "offer"].includes(status)).length, interviewing: countStatus("interview"), offers: offerCount > 0 ? offerCount : countStatus("offer"), avgScore: scored.length ? scored.reduce((total, application) => total + application.score, 0) / scored.length : null, weeklyNew, active: statuses.filter((status) => !["rejected", "discarded", "skip"].includes(status)).length, isEmpty: applications.length === 0 && reportCount === 0 && offerCount === 0 };
}
