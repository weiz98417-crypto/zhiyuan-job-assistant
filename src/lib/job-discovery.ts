export type JobDiscoveryStatus = "new" | "viewed" | "saved" | "evaluating" | "evaluated" | "dismissed";

export type JobDiscoveryMergeItem = {
  id?: number | string;
  url?: string;
  status?: JobDiscoveryStatus;
  jd_id?: number | null;
  discovered_at?: string | null;
};

export type JobDiscoveryWeakMatchItem = JobDiscoveryMergeItem & {
  company?: string | null;
  title?: string | null;
  location?: string | null;
};

export type DiscoveryJDDetail = {
  body: string;
  company: string;
  role: string;
  sourceUrl: string;
  title?: string;
};

export type DiscoveryJobActionTarget = {
  id: number | string;
  company?: string | null;
  title?: string | null;
  url?: string | null;
};

export const DISCOVERY_VISIBLE_STATUSES: JobDiscoveryStatus[] = ["new", "viewed", "saved", "evaluating", "evaluated"];

export const DISCOVERY_JOB_STATUS_BADGES: Record<JobDiscoveryStatus, { label: string; className: string }> = {
  new: {
    label: "新发现",
    className: "bg-[var(--color-primary)] text-white",
  },
  viewed: {
    label: "已查看",
    className: "bg-sky-50 text-sky-700 border border-sky-100",
  },
  saved: {
    label: "已保存",
    className: "bg-emerald-50 text-emerald-700 border border-emerald-100",
  },
  evaluating: {
    label: "评估中",
    className: "bg-amber-50 text-amber-700 border border-amber-100",
  },
  evaluated: {
    label: "已评估",
    className: "bg-violet-50 text-violet-700 border border-violet-100",
  },
  dismissed: {
    label: "已跳过",
    className: "bg-[var(--color-surface)] text-[var(--color-muted)] border border-[var(--color-border)]",
  },
};

const TRACKING_PARAM_NAMES = new Set([
  "campaign",
  "fbclid",
  "from",
  "gclid",
  "msclkid",
  "ref",
  "ref_src",
  "share",
  "share_source",
  "source",
  "spm",
  "track",
  "tracking",
]);

const STATUS_PRIORITY: Record<JobDiscoveryStatus, number> = {
  dismissed: 1,
  new: 2,
  viewed: 3,
  saved: 4,
  evaluating: 5,
  evaluated: 6,
};

function isTrackingParam(name: string) {
  const key = name.toLowerCase();
  return key.startsWith("utm_") || TRACKING_PARAM_NAMES.has(key);
}

export function normalizeJobUrlForFingerprint(url: string) {
  const input = String(url || "").trim();
  if (!input) return "";

  try {
    const parsed = new URL(input);
    parsed.protocol = parsed.protocol.toLowerCase();
    parsed.hostname = parsed.hostname.toLowerCase();
    parsed.hash = "";
    if (
      (parsed.protocol === "https:" && parsed.port === "443") ||
      (parsed.protocol === "http:" && parsed.port === "80")
    ) {
      parsed.port = "";
    }
    if (parsed.pathname.length > 1) parsed.pathname = parsed.pathname.replace(/\/+$/, "");

    const params: [string, string][] = [];
    parsed.searchParams.forEach((value, key) => {
      if (!isTrackingParam(key)) params.push([key, value]);
    });
    params.sort(([leftKey, leftValue], [rightKey, rightValue]) =>
      leftKey.localeCompare(rightKey) || leftValue.localeCompare(rightValue),
    );

    parsed.search = "";
    for (const [key, value] of params) parsed.searchParams.append(key, value);
    return parsed.toString();
  } catch {
    return input.replace(/#.*$/, "").replace(/\/+$/, "");
  }
}

export function jobFingerprint(job: Pick<JobDiscoveryMergeItem, "id" | "url">) {
  const normalizedUrl = normalizeJobUrlForFingerprint(job.url || "");
  if (normalizedUrl) return `url:${normalizedUrl}`;
  return `id:${String(job.id ?? "")}`;
}

export function mergeJobDiscoveryItems<T extends JobDiscoveryMergeItem>(jobs: T[]) {
  const merged = new Map<string, T>();
  for (const job of jobs) {
    const fingerprint = jobFingerprint(job);
    const existing = merged.get(fingerprint);
    if (!existing || shouldPreferJob(job, existing)) merged.set(fingerprint, job);
  }
  return Array.from(merged.values());
}

export function getWeakDuplicateHintCounts<T extends JobDiscoveryWeakMatchItem>(jobs: T[]) {
  const groups = new Map<string, Map<string, T>>();
  for (const job of jobs) {
    const key = weakDuplicateKey(job);
    if (!key) continue;
    const fingerprint = jobFingerprint(job);
    const group = groups.get(key) || new Map<string, T>();
    group.set(fingerprint, job);
    groups.set(key, group);
  }

  const counts = new Map<string, number>();
  for (const group of groups.values()) {
    if (group.size < 2) continue;
    for (const fingerprint of group.keys()) counts.set(fingerprint, group.size - 1);
  }
  return counts;
}

export function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "刚刚";
  if (mins < 60) return `${mins}分钟前`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}小时前`;
  return `${Math.floor(hours / 24)}天前`;
}

export function jobStatusBadge(status: JobDiscoveryStatus) {
  return DISCOVERY_JOB_STATUS_BADGES[status] || DISCOVERY_JOB_STATUS_BADGES.new;
}

export async function fetchDiscoveryJobDetail(job: DiscoveryJobActionTarget) {
  const res = await fetch(`/api/scan/jobs/${job.id}/jd`);
  const json = await res.json();
  if (!res.ok || !json.success) throw new Error(json.error || "JD 加载失败");
  const data = json.data || {};
  if (data.jd) {
    const detail: DiscoveryJDDetail = {
      body: data.jd.body,
      company: data.jd.company || job.company || "",
      role: data.jd.role || job.title || "",
      sourceUrl: data.jd.sourceUrl || job.url || "",
    };
    return { detail, manualBody: detail.body, error: "" };
  }
  if (data.fetched) {
    const detail = data.fetched as DiscoveryJDDetail;
    return { detail, manualBody: detail.body || "", error: "" };
  }
  return {
    detail: null,
    manualBody: "",
    error: data.error || "没有抓到 JD 正文，可以手动粘贴。",
  };
}

export async function saveDiscoveryJobJD(
  jobId: number | string,
  input: { jdBody: string; company?: string; role?: string; evaluate?: boolean },
) {
  const res = await fetch(`/api/scan/jobs/${jobId}/jd`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const json = await res.json();
  if (!res.ok || !json.success) throw new Error(json.error || "保存 JD 失败");
  return { jdId: Number(json.jdId), reused: Boolean(json.reused), data: json.data };
}

export function getAgentEvaluationUrl(jdId: number | string) {
  return `/agent?jdId=${encodeURIComponent(String(jdId))}&intent=evaluate`;
}

function shouldPreferJob(candidate: JobDiscoveryMergeItem, existing: JobDiscoveryMergeItem) {
  if (candidate.jd_id && !existing.jd_id) return true;
  const candidateStatus = candidate.status ? STATUS_PRIORITY[candidate.status] : 0;
  const existingStatus = existing.status ? STATUS_PRIORITY[existing.status] : 0;
  if (candidateStatus !== existingStatus) return candidateStatus > existingStatus;

  const candidateTime = candidate.discovered_at ? new Date(candidate.discovered_at).getTime() : 0;
  const existingTime = existing.discovered_at ? new Date(existing.discovered_at).getTime() : 0;
  return candidateTime > existingTime;
}

function weakDuplicateKey(job: JobDiscoveryWeakMatchItem) {
  const company = normalizeWeakText(job.company || "");
  const title = normalizeWeakText(job.title || "");
  const location = normalizeWeakText(job.location || "");
  if (!company || !title || !location) return "";
  return `${company}|${title}|${location}`;
}

function normalizeWeakText(value: string) {
  return value
    .toLowerCase()
    .replace(/[（(].*?[)）]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
