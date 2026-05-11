import { NextResponse } from "next/server";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import yaml from "js-yaml";

export async function GET() {
  try {
    const path = resolve(process.cwd(), "..", "config", "profile.yml");
    if (!existsSync(path)) {
      return NextResponse.json({ success: false, error: "profile.yml not found" }, { status: 404 });
    }

    const raw = readFileSync(path, "utf-8");
    const config = yaml.load(raw) as Record<string, unknown> | null;
    if (!config?.candidate) {
      return NextResponse.json({ success: false, error: "Invalid profile.yml" }, { status: 500 });
    }

    const candidate = config.candidate as Record<string, string>;
    const targetRoles = config.target_roles as Record<string, unknown> | undefined;
    const comp = config.compensation as Record<string, unknown> | undefined;
    const dealBreakers = config.deal_breakers as string[] | undefined;
    const narrative = config.narrative as Record<string, string> | undefined;

    const parts: string[] = [];

    // Basic info
    if (candidate.full_name) parts.push(`姓名: ${candidate.full_name}`);
    if (candidate.location) parts.push(`地点: ${candidate.location}`);

    // Target roles — the critical info
    if (targetRoles?.primary && Array.isArray(targetRoles.primary)) {
      parts.push(`目标岗位: ${targetRoles.primary.join("、")}`);
    }
    if (targetRoles?.archetypes && Array.isArray(targetRoles.archetypes)) {
      const archStrs = (targetRoles.archetypes as Array<{ name: string; level: string; fit: string }>)
        .map((a) => `${a.name}(${a.level}, ${a.fit === "primary" ? "主攻" : a.fit === "secondary" ? "次选" : "可尝试"})`);
      parts.push(`岗位定位: ${archStrs.join(" | ")}`);
    }

    // Compensation
    if (comp) {
      if (comp.target_monthly_salary_min || comp.target_monthly_salary_max) {
        parts.push(`薪资期望: ${comp.target_monthly_salary_min || "?"}K-${comp.target_monthly_salary_max || "?"}K/月`);
      }
    }

    // Deal breakers
    if (dealBreakers?.length) {
      parts.push(`底线: ${dealBreakers.join("、")}`);
    }

    // Narrative — condensed
    if (narrative) {
      const narrativeParts: string[] = [];
      if (narrative.superpower) narrativeParts.push(`优势: ${narrative.superpower}`);
      if (narrative.passion) narrativeParts.push(`热爱: ${narrative.passion}`);
      if (narrative.best_achievement) narrativeParts.push(`最佳成就: ${narrative.best_achievement}`);
      if (narrativeParts.length) parts.push(narrativeParts.join(" | "));
    }

    const summary = parts.join("\n");
    return NextResponse.json({ success: true, data: { summary } });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}
