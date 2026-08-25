import { existsSync, readFileSync } from "node:fs";
import { extname, isAbsolute, normalize, resolve, sep } from "node:path";
import yaml from "js-yaml";
import {
  getDataRepositories,
  type ApplicationListFilters,
} from "@/lib/data-repositories";
import type { AppRow, JDRow, ReferenceResumeRow, ReferenceResumeSummary, ReportRow } from "@/lib/server-db";
import type { ExecutionPrincipal } from "@/lib/agent/runtime/durable-agent-run";
import { redactReferenceResumeText } from "@/lib/reference-resume-vector";
import { sanitizeDealBreakers } from "@/lib/profile-skill-quality";
import { isGarbledText } from "@/lib/agent/loop/text-quality";

const ALLOWED_PROJECT_FILE_EXTENSIONS = new Set([".md", ".yml", ".yaml", ".json", ".txt"]);
const MAX_PROJECT_FILE_CHARS = 2000;

export interface AgentReadServiceAdapter {
  listApplications(filters: ApplicationListFilters, userId: string): Promise<AppRow[]>;
  getCv?(userId: string): Promise<{ data_json: string } | undefined>;
  getActiveResumeDocument?(userId: string): Promise<AgentResumeDocumentRow | undefined>;
  getResumeArtifact?(documentId: string, userId: string): Promise<AgentResumeArtifactRow | undefined>;
  listResumeChunks?(documentId: string, userId: string): Promise<AgentResumeChunkRow[]>;
  getProfile?(userId: string): Promise<AgentProfileRow | undefined>;
  getReferenceResume?(id: number, userId: string): Promise<ReferenceResumeRow | undefined>;
  listReferenceResumes?(userId: string): Promise<ReferenceResumeSummary[]>;
  searchReferenceResumes?(query: string, limit: number, userId: string): Promise<ReferenceResumeRow[]>;
  listJds?(userId: string): Promise<JDRow[]>;
  getJd?(id: number, userId: string): Promise<JDRow | undefined>;
  listReports?(userId: string): Promise<ReportRow[]>;
  getReport?(reportNum: number, userId: string): Promise<ReportRow | undefined>;
  getOfferReport?(id: number, userId: string): Promise<Record<string, unknown> | undefined>;
}

interface AgentProfileRow {
  data_json: unknown;
  goals_json: unknown;
  history_json: unknown;
  last_updated: string;
}

interface AgentResumeDocumentRow {
  id: string;
  version_id: string;
  label: string;
  status: string;
  sections_json: unknown;
  content_hash: string;
  integrity_json: unknown;
}

interface AgentResumeArtifactRow {
  id: string;
  source_type: string;
  filename?: string | null;
  mime_type?: string | null;
  source_hash: string;
  raw_text: string;
  extraction_json: unknown;
}

interface AgentResumeChunkRow {
  id: string;
  chunk_index: number;
  start_offset: number;
  end_offset: number;
  content: string;
  content_hash: string;
}

export interface PipelineStatus {
  total: number;
  byStatus: Record<string, number>;
  avgScore: number;
}

export interface ReferenceResumeReadModel {
  id: number;
  name: string;
  source: string;
  sections: Array<{ id: string; title: string; content: string }>;
  tags: unknown[];
  notes: string;
  roleCategory: string;
  visibility: string;
  status: string;
  qualityScore: number;
  anonymized: boolean;
  ownedByUser: boolean;
  created_at: string;
  updated_at?: string;
}

export type ReferenceResumeSummaryReadModel = Omit<ReferenceResumeReadModel, "sections">;

export interface JdReadModel {
  id?: number;
  company: string;
  role: string;
  sourceType: string;
  sourceUrl?: string;
  body: string;
  keywords: unknown[];
  reportId?: number;
  createdAt: string;
}

export class AgentReadService {
  constructor(private readonly adapter: AgentReadServiceAdapter) {}

  listApplications(
    principal: ExecutionPrincipal,
    filters: ApplicationListFilters = {},
  ): Promise<AppRow[]> {
    return this.adapter.listApplications(filters, principal.userId);
  }

  async getPipelineStatus(
    principal: ExecutionPrincipal,
    filters: ApplicationListFilters = {},
  ): Promise<PipelineStatus> {
    const applications = await this.listApplications(principal, filters);
    const byStatus: Record<string, number> = {};
    let scoreTotal = 0;
    for (const application of applications) {
      byStatus[application.status] = (byStatus[application.status] || 0) + 1;
      scoreTotal += Number(application.score || 0);
    }
    return {
      total: applications.length,
      byStatus,
      avgScore: applications.length > 0
        ? Math.round((scoreTotal / applications.length) * 10) / 10
        : 0,
    };
  }

  async getCurrentResume(
    principal: ExecutionPrincipal,
    options: { includeSource?: boolean } = {},
  ): Promise<Record<string, unknown>> {
    const getCv = requireAdapter(this.adapter.getCv, "getCv");
    const getActiveResumeDocument = requireAdapter(
      this.adapter.getActiveResumeDocument,
      "getActiveResumeDocument",
    );
    const [row, activeDocument] = await Promise.all([
      getCv(principal.userId),
      getActiveResumeDocument(principal.userId),
    ]);
    const data = row?.data_json ? parseObject(row.data_json) : {};
    if (!activeDocument) return data;

    const versions = parseObject(data.versions);
    const existingVersion = parseObject(versions[activeDocument.version_id]);
    versions[activeDocument.version_id] = {
      ...existingVersion,
      id: activeDocument.version_id,
      label: activeDocument.label,
      sections: parseArray(activeDocument.sections_json),
      documentId: activeDocument.id,
      integrityStatus: parseObject(activeDocument.integrity_json).status || "needs_review",
    };
    data.activeVersion = activeDocument.version_id;
    data.versions = versions;
    data.resumeDocument = {
      id: activeDocument.id,
      versionId: activeDocument.version_id,
      status: activeDocument.status,
      contentHash: activeDocument.content_hash,
      integrity: parseObject(activeDocument.integrity_json),
    };

    if (options.includeSource) {
      const getResumeArtifact = requireAdapter(this.adapter.getResumeArtifact, "getResumeArtifact");
      const listResumeChunks = requireAdapter(this.adapter.listResumeChunks, "listResumeChunks");
      const [artifact, chunks] = await Promise.all([
        getResumeArtifact(activeDocument.id, principal.userId),
        listResumeChunks(activeDocument.id, principal.userId),
      ]);
      data.resumeDocument = {
        ...parseObject(data.resumeDocument),
        sourceText: artifact?.raw_text || "",
        sourceArtifact: artifact ? {
          id: artifact.id,
          sourceType: artifact.source_type,
          filename: artifact.filename,
          mimeType: artifact.mime_type,
          sourceHash: artifact.source_hash,
          extraction: parseObject(artifact.extraction_json),
        } : null,
        chunks: chunks.map((chunk) => ({
          id: chunk.id,
          index: chunk.chunk_index,
          start: chunk.start_offset,
          end: chunk.end_offset,
          content: chunk.content,
          contentHash: chunk.content_hash,
        })),
      };
    }

    return data;
  }

  async getProfile(principal: ExecutionPrincipal): Promise<{
    data: Record<string, unknown>;
    goals: Record<string, unknown>;
    history: unknown[];
    lastUpdated: string;
  } | null> {
    const getProfile = requireAdapter(this.adapter.getProfile, "getProfile");
    const profile = await getProfile(principal.userId);
    if (!profile) return null;
    return {
      data: parseObject(profile.data_json),
      goals: sanitizeProfileGoals(parseObject(profile.goals_json)),
      history: parseArray(profile.history_json),
      lastUpdated: profile.last_updated,
    };
  }

  getProfileDnaSummary(_principal: ExecutionPrincipal): string {
    const filePath = resolve(process.cwd(), "config", "profile.yml");
    if (!existsSync(filePath)) return "";
    const config = yaml.load(readFileSync(filePath, "utf-8"));
    if (!config || typeof config !== "object" || Array.isArray(config)) return "";
    return formatProfileDna(config as Record<string, unknown>);
  }

  async getReferenceResume(
    principal: ExecutionPrincipal,
    id: number,
  ): Promise<ReferenceResumeReadModel | null> {
    const getReferenceResume = requireAdapter(this.adapter.getReferenceResume, "getReferenceResume");
    const resume = await getReferenceResume(id, principal.userId);
    if (!resume) return null;
    const ownedByUser = !resume.user_id || resume.user_id === principal.userId;
    return {
      id: resume.id,
      name: resume.name,
      source: resume.source,
      sections: ownedByUser
        ? parseSections(resume.sections_json)
        : buildSharedSections(resume),
      tags: parseArray(resume.tags),
      notes: ownedByUser ? resume.notes : "",
      roleCategory: resume.role_category || "",
      visibility: resume.visibility || "private",
      status: resume.status || "active",
      qualityScore: Number(resume.quality_score || 0),
      anonymized: Boolean(resume.anonymized),
      ownedByUser,
      created_at: resume.created_at,
      updated_at: resume.updated_at,
    };
  }

  async listReferenceResumes(
    principal: ExecutionPrincipal,
    options: { search?: string; limit?: number } = {},
  ): Promise<ReferenceResumeSummaryReadModel[]> {
    const resumes = options.search?.trim()
      ? await requireAdapter(this.adapter.searchReferenceResumes, "searchReferenceResumes")(
        options.search.trim(),
        options.limit || 20,
        principal.userId,
      )
      : await requireAdapter(this.adapter.listReferenceResumes, "listReferenceResumes")(principal.userId);
    return resumes.map((resume) => toReferenceResumeSummary(resume, principal.userId));
  }

  async listJds(principal: ExecutionPrincipal): Promise<JdReadModel[]> {
    const listJds = requireAdapter(this.adapter.listJds, "listJds");
    return (await listJds(principal.userId)).map(toJdReadModel);
  }

  async getJd(principal: ExecutionPrincipal, id: number): Promise<JdReadModel | null> {
    const getJd = requireAdapter(this.adapter.getJd, "getJd");
    const jd = await getJd(id, principal.userId);
    return jd ? toJdReadModel(jd) : null;
  }

  listReports(principal: ExecutionPrincipal): Promise<ReportRow[]> {
    return requireAdapter(this.adapter.listReports, "listReports")(principal.userId);
  }

  async getReport(principal: ExecutionPrincipal, reportNum: number): Promise<ReportRow | null> {
    const report = await requireAdapter(this.adapter.getReport, "getReport")(reportNum, principal.userId);
    return report || null;
  }

  async getOfferReport(
    principal: ExecutionPrincipal,
    id: number,
  ): Promise<Record<string, unknown> | null> {
    const report = await requireAdapter(this.adapter.getOfferReport, "getOfferReport")(id, principal.userId);
    return report || null;
  }

  async readProjectFile(relativePath: string): Promise<{
    content: string;
    truncated: boolean;
    charCount: number;
    source: "fs";
  }> {
    const normalizedPath = normalize(relativePath);
    if (isAbsolute(relativePath) || normalizedPath.split(/[\\/]/).includes("..")) {
      throw new Error("不支持的文件路径");
    }
    const extension = extname(normalizedPath).toLowerCase();
    if (!ALLOWED_PROJECT_FILE_EXTENSIONS.has(extension)) {
      throw new Error(`不支持的文件类型: ${extension}。支持: ${Array.from(ALLOWED_PROJECT_FILE_EXTENSIONS).join(", ")}`);
    }
    const projectRoot = resolve(process.cwd());
    const fullPath = resolve(projectRoot, normalizedPath);
    if (fullPath !== projectRoot && !fullPath.startsWith(`${projectRoot}${sep}`)) {
      throw new Error("不支持的文件路径");
    }
    if (!existsSync(fullPath)) throw new Error(`文件不存在: ${relativePath}`);
    const raw = readFileSync(fullPath, "utf-8");
    if (isGarbledText(raw)) {
      throw new Error(`文件编码异常，无法读取: ${relativePath}。建议将文件另存为 UTF-8 编码后重试。`);
    }
    return {
      content: raw.slice(0, MAX_PROJECT_FILE_CHARS),
      truncated: raw.length > MAX_PROJECT_FILE_CHARS,
      charCount: raw.length,
      source: "fs",
    };
  }
}

export function getAgentReadService(): AgentReadService {
  const repositories = getDataRepositories();
  return new AgentReadService({
    listApplications: (filters, userId) => repositories.applications.list(filters, userId),
    getCv: (userId) => repositories.cv.get(userId),
    getActiveResumeDocument: (userId) => repositories.resumeDocuments.getActive(userId),
    getResumeArtifact: (documentId, userId) => repositories.resumeDocuments.getArtifact(documentId, userId),
    listResumeChunks: (documentId, userId) => repositories.resumeDocuments.listChunks(documentId, userId),
    getProfile: (userId) => repositories.profiles.get(userId),
    getReferenceResume: (id, userId) => repositories.referenceResumes.get(id, userId),
    listReferenceResumes: (userId) => repositories.referenceResumes.list(userId),
    searchReferenceResumes: (query, limit, userId) => repositories.referenceResumes.search(query, limit, userId),
    listJds: (userId) => repositories.jds.list(userId),
    getJd: (id, userId) => repositories.jds.get(id, userId),
    listReports: (userId) => repositories.reports.list(userId),
    getReport: (reportNum, userId) => repositories.reports.get(reportNum, userId),
    getOfferReport: (id, userId) => repositories.offerReports.get(id, userId),
  });
}

function requireAdapter<T>(value: T | undefined, name: string): T {
  if (!value) throw new Error(`Agent read adapter ${name} is unavailable`);
  return value;
}

function parseObject(value: unknown): Record<string, unknown> {
  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

function parseArray(value: unknown): unknown[] {
  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseSections(value: unknown): Array<{ id: string; title: string; content: string }> {
  return parseArray(value).flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const section = item as Record<string, unknown>;
    return [{
      id: String(section.id || ""),
      title: String(section.title || section.id || ""),
      content: String(section.content || ""),
    }];
  });
}

function buildSharedSections(
  resume: Pick<ReferenceResumeRow, "raw_text" | "shared_text_redacted">,
): Array<{ id: string; title: string; content: string }> {
  const content = resume.shared_text_redacted?.trim()
    || redactReferenceResumeText(resume.raw_text || "");
  return content ? [{ id: "shared-summary", title: "共享摘要", content }] : [];
}

function formatProfileDna(config: Record<string, unknown>): string {
  const candidate = parseObject(config.candidate);
  const targetRoles = parseObject(config.target_roles);
  const compensation = parseObject(config.compensation);
  const narrative = parseObject(config.narrative);
  const dealBreakers = parseArray(config.deal_breakers).map(String).filter(Boolean);
  const parts: string[] = [];
  if (candidate.full_name) parts.push(`姓名: ${candidate.full_name}`);
  if (candidate.location) parts.push(`地点: ${candidate.location}`);
  if (Array.isArray(targetRoles.primary) && targetRoles.primary.length > 0) {
    parts.push(`目标岗位: ${targetRoles.primary.map(String).join("、")}`);
  }
  if (Array.isArray(targetRoles.archetypes) && targetRoles.archetypes.length > 0) {
    const archetypes = targetRoles.archetypes.flatMap((value) => {
      const item = parseObject(value);
      if (!item.name) return [];
      const fit = item.fit === "primary" ? "主攻" : item.fit === "secondary" ? "次选" : "可尝试";
      return [`${item.name}(${item.level || ""}, ${fit})`];
    });
    if (archetypes.length > 0) parts.push(`岗位定位: ${archetypes.join(" | ")}`);
  }
  if (compensation.target_monthly_salary_min || compensation.target_monthly_salary_max) {
    parts.push(`薪资期望: ${compensation.target_monthly_salary_min || "?"}K-${compensation.target_monthly_salary_max || "?"}K/月`);
  }
  if (dealBreakers.length > 0) parts.push(`底线: ${dealBreakers.join("、")}`);
  const narrativeParts: string[] = [];
  if (narrative.superpower) narrativeParts.push(`优势: ${narrative.superpower}`);
  if (narrative.passion) narrativeParts.push(`热爱: ${narrative.passion}`);
  if (narrative.best_achievement) narrativeParts.push(`最佳成就: ${narrative.best_achievement}`);
  if (narrativeParts.length > 0) parts.push(narrativeParts.join(" | "));
  return parts.join("\n");
}

function sanitizeProfileGoals(goals: Record<string, unknown>): Record<string, unknown> {
  const result = { ...goals };
  if (!Array.isArray(result.dealBreakers)) return result;
  const cleaned = sanitizeDealBreakers(result.dealBreakers);
  if (cleaned.length > 0) result.dealBreakers = cleaned;
  else delete result.dealBreakers;
  return result;
}

function toJdReadModel(jd: JDRow): JdReadModel {
  return {
    id: jd.id,
    company: jd.company,
    role: jd.role,
    sourceType: jd.source_type,
    sourceUrl: jd.source_url || undefined,
    body: jd.body,
    keywords: parseArray(jd.keywords_json),
    reportId: jd.report_id,
    createdAt: jd.created_at || new Date().toISOString(),
  };
}

function toReferenceResumeSummary(
  resume: ReferenceResumeSummary,
  userId: string,
): ReferenceResumeSummaryReadModel {
  return {
    id: resume.id,
    name: resume.name,
    source: resume.source,
    tags: parseArray(resume.tags),
    notes: resume.notes,
    roleCategory: resume.role_category || "",
    visibility: resume.visibility || "private",
    status: resume.status || "active",
    qualityScore: Number(resume.quality_score || 0),
    anonymized: Boolean(resume.anonymized),
    ownedByUser: !resume.user_id || resume.user_id === userId,
    created_at: resume.created_at,
    updated_at: resume.updated_at,
  };
}
