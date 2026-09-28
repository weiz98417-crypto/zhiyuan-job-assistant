import type { CVSection } from "@/types";

export function sectioningPreviewHash(sections: CVSection[]): string {
  return sections.map((section) => `${section.id}:${section.content}`).join("|");
}

export function canUndoSectioningPreview(sections: CVSection[], previewHash: string): boolean {
  return sectioningPreviewHash(sections) === previewHash;
}

export function separateCvExperienceProjects(sections: CVSection[]): { sections: CVSection[]; movedText: string } {
  const experience = sections.find((section) => section.id === "experience");
  if (!experience) return { sections, movedText: "" };
  const separated = splitEmbeddedProjects(experience.content);
  if (!separated.projects) return { sections, movedText: "" };
  const projectSection = sections.find((section) => section.id === "projects");
  const updated = sections.map((section) => {
    if (section.id === "experience") return { ...section, content: separated.experience };
    if (section.id === "projects") return { ...section, content: mergeSectionText(section.content, separated.projects) };
    return section;
  });
  if (!projectSection) {
    const experienceIndex = updated.findIndex((section) => section.id === "experience");
    updated.splice(experienceIndex + 1, 0, { id: "projects", title: "项目经验", content: separated.projects });
  }
  return { sections: updated, movedText: separated.projects };
}

export function splitEmbeddedProjects(experience: string): { experience: string; projects: string } {
  const lines = cleanText(experience).split("\n");
  const projectStarts = new Set<number>();
  for (let index = 0; index < lines.length; index += 1) {
    const normalized = normalizeSectionLine(lines[index]);
    if (!isProjectHeading(normalized) && !isProjectStartField(normalized)) continue;
    let start = index;
    if (isProjectStartField(normalized)) {
      let previous = index - 1;
      while (previous >= 0 && !lines[previous].trim()) previous -= 1;
      if (previous >= 0 && /^【[^】]{2,80}】$/.test(lines[previous].trim())) start = previous;
    }
    projectStarts.add(start);
  }
  if (!projectStarts.size) return { experience: cleanText(experience), projects: "" };

  const workLines: string[] = [];
  const projectLines: string[] = [];
  let section: "experience" | "projects" = "experience";
  for (let index = 0; index < lines.length; index += 1) {
    if (projectStarts.has(index)) section = "projects";
    else if (section === "projects" && isWorkBoundary(lines, index)) section = "experience";
    (section === "projects" ? projectLines : workLines).push(lines[index]);
  }
  return { experience: cleanText(workLines.join("\n")), projects: cleanText(projectLines.join("\n")) };
}

function normalizeSectionLine(line: string): string {
  return line.trim().replace(/^#{1,6}\s*/, "").replace(/^(?:[-•*]|[（(]?\d+[)）.、])\s*/, "").trim();
}

function isProjectHeading(line: string): boolean {
  return /^(?:项目经历|项目经验|项目实践|代表项目|主要项目|项目案例|Projects?)\s*[:：]?\s*$/i.test(line);
}

function isProjectStartField(line: string): boolean {
  return /^(?:项目经历|项目经验|项目实践|代表项目|主要项目|项目案例|项目名称|项目背景|项目描述|项目概况|项目简介)\s*[:：]/i.test(line);
}

function isWorkBoundary(lines: string[], index: number): boolean {
  const line = normalizeSectionLine(lines[index]);
  const dateIndex = lines.slice(index, index + 4).findIndex((candidate) => hasDateMarker(normalizeSectionLine(candidate)));
  if (dateIndex < 0) return /^(?:工作经历|任职经历|实习经历|工作经验)\s*[:：]?\s*$/i.test(line);
  const header = lines.slice(index, index + dateIndex + 1).map(normalizeSectionLine).filter(Boolean).join(" ");
  const hasRoleMarker = /(?:经理|工程师|总监|主管|专员|顾问|开发|设计|运营|产品|分析|研究|助理|实习|负责人|岗位|测试|QA|SDET|CEO|CTO|PM)/i.test(header);
  const looksLikeProject = /(?:项目|平台项目|项目平台|风控平台|招聘平台|系统方案)/i.test(header);
  return /^(?:工作经历|任职经历|实习经历|工作经验)\s*[:：]?\s*$/i.test(line)
    || (line.length <= 100 && !/[：:]/.test(line) && /(?:公司|集团|银行|研究院|事务所|工作室)/.test(line)
      && !looksLikeProject
      && hasRoleMarker);
}

function hasDateMarker(line: string): boolean {
  return /(?:19|20)\d{2}\s*(?:[./年-]\s*\d{1,2})/.test(line)
    || /(?:19|20)\d{2}\s*年/.test(line);
}

export function mergeSectionText(existingValue: string, additionValue: string): string {
  const existing = cleanText(existingValue);
  const addition = cleanText(additionValue);
  if (!addition) return existing;
  if (!existing) return addition;
  const comparableExisting = normalizeComparable(existing);
  const comparableAddition = normalizeComparable(addition);
  if (comparableExisting.includes(comparableAddition)) return existing;
  if (comparableAddition.includes(comparableExisting)) return addition;

  const existingLines = existing.split("\n");
  const additionLines = addition.split("\n");
  let overlap = 0;
  const maxOverlap = Math.min(existingLines.length, additionLines.length, 12);
  for (let size = maxOverlap; size > 0; size -= 1) {
    const tail = normalizeComparable(existingLines.slice(-size).join("\n"));
    const head = normalizeComparable(additionLines.slice(0, size).join("\n"));
    if (tail && tail === head) { overlap = size; break; }
  }
  const separator = overlap > 0 ? "\n" : "\n\n";
  return cleanText(`${existing}${separator}${additionLines.slice(overlap).join("\n")}`);
}

export function normalizeComparable(value: string): string {
  return value.toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, "");
}

export function cleanText(value: string): string {
  return String(value || "").replace(/\r\n/g, "\n").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}
