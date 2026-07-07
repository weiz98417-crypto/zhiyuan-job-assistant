export const APPLICATION_STATUSES = [
  "evaluated",
  "applied",
  "responded",
  "interview",
  "offer",
  "rejected",
  "discarded",
  "skip",
] as const;

export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

const STATUS_ALIASES: Record<string, ApplicationStatus> = {
  evaluated: "evaluated",
  evaluate: "evaluated",
  评估: "evaluated",
  已评估: "evaluated",
  applied: "applied",
  apply: "applied",
  投递: "applied",
  已投递: "applied",
  responded: "responded",
  reply: "responded",
  replied: "responded",
  有回复: "responded",
  已回复: "responded",
  interview: "interview",
  面试: "interview",
  offer: "offer",
  rejected: "rejected",
  reject: "rejected",
  拒绝: "rejected",
  已拒绝: "rejected",
  discarded: "discarded",
  discard: "discarded",
  放弃: "discarded",
  已放弃: "discarded",
  skip: "skip",
  skipped: "skip",
  跳过: "skip",
};

export function normalizeApplicationStatus(input?: string | null): ApplicationStatus {
  const value = String(input || "evaluated").trim().toLowerCase();
  return STATUS_ALIASES[value] || "evaluated";
}

export function isApplicationStatus(input: string): input is ApplicationStatus {
  return APPLICATION_STATUSES.includes(input as ApplicationStatus);
}

export function normalizeApplicationRow<T extends { status?: string | null }>(row: T): T & { status: ApplicationStatus } {
  return { ...row, status: normalizeApplicationStatus(row.status) };
}

