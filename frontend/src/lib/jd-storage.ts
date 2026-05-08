import db from "@/lib/db";
import type { JDRecord, JDSourceType } from "@/types";

export interface CreateJDDTO {
  company: string;
  role: string;
  sourceType: JDSourceType;
  sourceUrl?: string;
  body: string;
  keywords: string[];
  reportId?: number;
}

export async function createJD(data: CreateJDDTO): Promise<number> {
  const id = await db.jds.add({
    ...data,
    createdAt: new Date(),
  });
  if (id == null) throw new Error("Failed to create JD record");
  return id;
}

export async function updateJD(id: number, data: Partial<CreateJDDTO>): Promise<void> {
  await db.jds.update(id, data);
}

export async function deleteJD(id: number): Promise<void> {
  await db.jds.delete(id);
}

export async function getJDById(id: number): Promise<JDRecord | undefined> {
  return db.jds.get(id);
}

export async function getAllJDs(): Promise<JDRecord[]> {
  return db.jds.orderBy("createdAt").reverse().toArray();
}

export async function searchJDs(query: string): Promise<JDRecord[]> {
  const q = query.toLowerCase();
  const all = await getAllJDs();
  if (!q) return all;
  return all.filter(
    (jd) =>
      jd.company.toLowerCase().includes(q) ||
      jd.role.toLowerCase().includes(q) ||
      jd.body.toLowerCase().includes(q) ||
      jd.keywords.some((k) => k.toLowerCase().includes(q))
  );
}

export async function findJDByBodyPrefix(body: string): Promise<JDRecord | undefined> {
  const prefix = body.trim().slice(0, 200).toLowerCase();
  const all = await getAllJDs();
  return all.find(
    (jd) => jd.body.trim().slice(0, 200).toLowerCase() === prefix
  );
}

export async function updateJDReportId(jdId: number, reportId: number): Promise<void> {
  await db.jds.update(jdId, { reportId });
}

export async function clearJDReportId(jdId: number): Promise<void> {
  await db.jds.update(jdId, { reportId: undefined });
}
