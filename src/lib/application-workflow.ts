import type { AppRow, ApplicationEventRow, JDRow, ReportRow } from "@/lib/server-db";
import { getDataRepositories } from "@/lib/data-repositories";
import { APPLICATION_STATUSES, normalizeApplicationStatus, type ApplicationStatus } from "@/lib/application-status";

export interface PipelineAction {
  id: string;
  label: string;
  status?: ApplicationStatus;
  intent: string;
}

export interface TrackApplicationInput {
  company?: string;
  role?: string;
  score?: number;
  status?: string;
  date?: string;
  notes?: string;
  reportNum?: number;
  jdId?: number;
  sourceUrl?: string;
  source?: string;
  metadata?: Record<string, unknown>;
}

export interface UpdateApplicationStatusInput {
  id?: number;
  company?: string;
  role?: string;
  reportNum?: number;
  jdId?: number;
  status: string;
  note?: string;
  source?: string;
  metadata?: Record<string, unknown>;
}

export interface ApplicationContextInput {
  id?: number;
  company?: string;
  role?: string;
  reportNum?: number;
  jdId?: number;
}

export interface ApplicationContext {
  application?: AppRow;
  candidates?: AppRow[];
  events: ApplicationEventRow[];
  report?: ReportRow;
  jd?: JDRow;
  nextActions: PipelineAction[];
  ambiguous?: boolean;
  needsClarification?: boolean;
  message?: string;
}

export interface TrackApplicationResult {
  success: boolean;
  created: boolean;
  updated: boolean;
  data?: AppRow;
  event?: ApplicationEventRow;
  nextActions?: PipelineAction[];
  error?: string;
  errorCategory?: "need_user_input" | "permanent" | "transient";
}

export interface UpdateApplicationStatusResult {
  success: boolean;
  data?: AppRow;
  event?: ApplicationEventRow;
  candidates?: AppRow[];
  ambiguous?: boolean;
  nextActions?: PipelineAction[];
  error?: string;
  errorCategory?: "need_user_input" | "permanent" | "transient";
}

function sameIdentity(a?: AppRow, b?: AppRow): boolean {
  return Boolean(a?.id && b?.id && Number(a.id) === Number(b.id));
}

function clean(value?: string | null): string {
  return String(value || "").trim();
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function reportPath(reportNum?: number): string {
  if (!reportNum) return "";
  return `/reports/${String(reportNum).padStart(3, "0")}.md`;
}

function eventMetadata(input?: Record<string, unknown>): string {
  return JSON.stringify(input || {});
}

async function findExistingApplication(input: ApplicationContextInput, userId: string): Promise<{ application?: AppRow; candidates: AppRow[]; ambiguous: boolean }> {
  const repos = getDataRepositories();
  if (input.id) {
    const application = await repos.applications.get(Number(input.id), userId);
    return { application, candidates: application ? [application] : [], ambiguous: false };
  }

  const filters = {
    reportNum: input.reportNum,
    jdId: input.jdId,
    company: clean(input.company) || undefined,
    role: clean(input.role) || undefined,
    limit: 10,
  };
  const candidates = await repos.applications.list(filters, userId);
  if (candidates.length === 0) return { candidates: [], ambiguous: false };

  const exact = candidates.filter((row) => {
    const companyOk = !input.company || row.company.trim().toLowerCase() === clean(input.company).toLowerCase();
    const roleOk = !input.role || row.role.trim().toLowerCase() === clean(input.role).toLowerCase();
    return companyOk && roleOk;
  });
  if (exact.length === 1) return { application: exact[0], candidates: exact, ambiguous: false };
  if (candidates.length === 1) return { application: candidates[0], candidates, ambiguous: false };
  return { candidates, ambiguous: true };
}

export async function trackApplication(input: TrackApplicationInput, userId: string): Promise<TrackApplicationResult> {
  const company = clean(input.company);
  const role = clean(input.role);
  if (!company || !role) {
    return {
      success: false,
      created: false,
      updated: false,
      error: "缺少公司或岗位名称，不能创建空的投递追踪记录。",
      errorCategory: "need_user_input",
    };
  }

  const repos = getDataRepositories();
  const before = await findExistingApplication({ company, role }, userId);
  const status = normalizeApplicationStatus(input.status);
  const saved = await repos.applications.upsert({
    num: input.reportNum || before.application?.num || Date.now(),
    date: input.date || before.application?.date || today(),
    company,
    role,
    score: Number(input.score ?? before.application?.score ?? 0),
    status,
    pdf_generated: before.application?.pdf_generated || 0,
    report_path: before.application?.report_path || reportPath(input.reportNum),
    notes: input.notes || before.application?.notes || "",
    jd_id: input.jdId ?? before.application?.jd_id ?? null,
    source_url: input.sourceUrl || before.application?.source_url || "",
    metadata_json: eventMetadata(input.metadata),
  }, userId);

  if (!saved.id) {
    return { success: false, created: false, updated: false, error: "投递追踪写入后没有读回记录。", errorCategory: "permanent" };
  }
  const created = !before.application || !sameIdentity(before.application, saved);
  const event = await repos.applications.insertEvent({
    application_id: saved.id,
    event_type: created ? "tracked" : "updated",
    from_status: before.application?.status || null,
    to_status: saved.status,
    note: input.notes || (created ? "加入投递追踪" : "更新投递追踪"),
    source: input.source || "pipeline",
    metadata_json: eventMetadata({ ...input.metadata, reportNum: input.reportNum, jdId: input.jdId }),
  }, userId);
  const events = await repos.applications.listEvents(saved.id, userId);
  return {
    success: true,
    created,
    updated: !created,
    data: saved,
    event,
    nextActions: suggestNextActions(saved, events),
  };
}

export async function updateApplicationStatus(input: UpdateApplicationStatusInput, userId: string): Promise<UpdateApplicationStatusResult> {
  const status = normalizeApplicationStatus(input.status);
  if (!APPLICATION_STATUSES.includes(status)) {
    return { success: false, error: `不支持的投递状态: ${input.status}`, errorCategory: "need_user_input" };
  }
  const match = await findExistingApplication(input, userId);
  if (match.ambiguous) {
    return {
      success: false,
      ambiguous: true,
      candidates: match.candidates,
      error: "匹配到多个投递记录，请先说明要更新哪一条。",
      errorCategory: "need_user_input",
    };
  }
  if (!match.application?.id) {
    return { success: false, error: "没有找到可更新的投递追踪记录。", errorCategory: "need_user_input" };
  }
  const repos = getDataRepositories();
  const beforeStatus = normalizeApplicationStatus(match.application.status);
  const saved = await repos.applications.updateStatus(match.application.id, status, userId, input.note);
  if (!saved?.id) return { success: false, error: "状态更新后没有读回记录。", errorCategory: "permanent" };

  const event = await repos.applications.insertEvent({
    application_id: saved.id,
    event_type: "status_changed",
    from_status: beforeStatus,
    to_status: status,
    note: input.note || "",
    source: input.source || "pipeline",
    metadata_json: eventMetadata(input.metadata),
  }, userId);
  const events = await repos.applications.listEvents(saved.id, userId);
  return { success: true, data: saved, event, nextActions: suggestNextActions(saved, events) };
}

export async function getApplicationContext(input: ApplicationContextInput, userId: string): Promise<ApplicationContext> {
  const repos = getDataRepositories();
  const match = await findExistingApplication(input, userId);
  if (match.ambiguous) {
    return {
      candidates: match.candidates,
      events: [],
      nextActions: [],
      ambiguous: true,
      needsClarification: true,
      message: "匹配到多个投递记录，请选择具体公司/岗位或记录 ID。",
    };
  }
  if (!match.application?.id) {
    return { events: [], nextActions: [], needsClarification: true, message: "没有找到对应的投递追踪记录。" };
  }
  const events = await repos.applications.listEvents(match.application.id, userId);
  const report = match.application.num ? await repos.reports.get(match.application.num, userId) : undefined;
  const jd = match.application.jd_id ? await repos.jds.get(Number(match.application.jd_id), userId) : undefined;
  return {
    application: match.application,
    events,
    report,
    jd,
    nextActions: suggestNextActions(match.application, events),
  };
}

export function suggestNextActions(application: AppRow, events: ApplicationEventRow[] = []): PipelineAction[] {
  const status = normalizeApplicationStatus(application.status);
  const hasRecentFollowup = events.some((event) => event.event_type === "followup" || /跟进|follow/i.test(event.note || ""));
  if (status === "evaluated") {
    return [
      { id: "apply", label: "标记已投递", status: "applied", intent: "这个岗位我投了" },
      { id: "pitch", label: "生成投递话术", intent: "帮我生成这个岗位的投递话术" },
      { id: "discard", label: "放弃", status: "discarded", intent: "这个岗位先放弃" },
    ];
  }
  if (status === "applied") {
    return [
      { id: "followup", label: hasRecentFollowup ? "记录新的跟进" : "创建跟进提醒", intent: "帮我跟进这个岗位" },
      { id: "responded", label: "记录 HR 回复", status: "responded", intent: "这个岗位有 HR 回复了" },
      { id: "prepare", label: "准备面试", status: "interview", intent: "帮我准备这个岗位的面试" },
    ];
  }
  if (status === "responded") {
    return [
      { id: "prepare", label: "准备面试", status: "interview", intent: "帮我准备这个岗位的面试" },
      { id: "log-reply", label: "记录 HR 回复", intent: "记录这个岗位的 HR 回复" },
    ];
  }
  if (status === "interview") {
    return [
      { id: "retro", label: "面试复盘", intent: "帮我复盘这个岗位的面试" },
      { id: "offer", label: "标记 Offer", status: "offer", intent: "这个岗位拿到 offer 了" },
      { id: "rejected", label: "标记未通过", status: "rejected", intent: "这个岗位面试后未通过" },
    ];
  }
  if (status === "offer") {
    return [
      { id: "negotiate", label: "谈薪策略", intent: "帮我准备这个 offer 的谈薪策略" },
      { id: "hr-questions", label: "HR 问询点", intent: "帮我列这个 offer 的 HR 问询点" },
    ];
  }
  if (status === "rejected") return [{ id: "retro", label: "失败复盘", intent: "帮我复盘这个岗位为什么失败" }];
  if (status === "discarded" || status === "skip") return [{ id: "reopen", label: "重新评估", status: "evaluated", intent: "重新评估这个岗位" }];
  return [];
}
