import { NextResponse } from "next/server";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

export async function GET() {
  try {
    const cvPath = resolve(process.cwd(), "..", "cv.md");
    if (!existsSync(cvPath)) {
      return NextResponse.json({ success: false, error: "cv.md not found" }, { status: 404 });
    }

    const cvRaw = readFileSync(cvPath, "utf-8");
    // Extract structured info: roles, companies, education, skills
    const parts: string[] = [];

    // Extract ## headers as sections
    const sections = cvRaw.split(/\n## /);
    for (const section of sections) {
      const lines = section.split("\n");
      const title = lines[0]?.trim().toLowerCase();
      const body = lines.slice(1).join("\n").trim().slice(0, 500);

      if (!title || !body) continue;

      if (title.includes("经历") || title.includes("经验") || title.includes("experience")) {
        // Extract company names and role titles
        const companies = body.match(/\*\*([^*]+)\*\*/g)?.map((s) => s.replace(/\*/g, "")) || [];
        const roles = body.match(/(?:产品|运营|开发|工程|设计|数据|AI|前端|后端|全栈|架构|管理|负责人|总监|经理|主管|高级|资深)[^\n，,]{0,15}/g) || [];
        if (companies.length) parts.push(`工作经历: ${companies.slice(0, 3).join(" → ")}`);
        if (roles.length) parts.push(`担任角色: ${[...new Set(roles)].slice(0, 3).join("、")}`);
      }

      if (title.includes("教育") || title.includes("education")) {
        const schools = body.match(/\*\*([^*]+)\*\*/g)?.map((s) => s.replace(/\*/g, "")) || [];
        if (schools.length) parts.push(`教育: ${schools[0]}`);
      }

      if (title.includes("技能") || title.includes("skill")) {
        const skills = body.match(/[A-Za-z+#.\-]+|[\u4e00-\u9fff]{2,6}/g) || [];
        const unique = [...new Set(skills)].filter((s) => s.length > 1).slice(0, 15);
        if (unique.length) parts.push(`技能: ${unique.join("、")}`);
      }

      if (title.includes("概述") || title.includes("总结") || title.includes("summary")) {
        parts.push(`概述: ${body.slice(0, 200)}`);
      }
    }

    const summary = parts.length > 0 ? parts.join("\n") : "CV 摘要暂不可用";
    return NextResponse.json({ success: true, data: { summary } });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}
