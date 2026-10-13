import { captureOwnerDatabase } from "@/lib/db";
import { assertBrowserOwner, requireBrowserOwner } from "@/lib/browser-owner";
import { parseApplicationsMDWithDiagnostics } from "@/lib/parsers";

export async function importApplicationsMarkdown(markdown: string): Promise<{ added: number; duplicated: number; invalid: number }> {
  const owner = requireBrowserOwner();
  const database = captureOwnerDatabase(owner);
  const parsed = parseApplicationsMDWithDiagnostics(markdown);
  if (!parsed.headerFound) throw new Error("未找到有效的 applications.md 表头；没有写入数据。");
  let added = 0;
  let duplicated = 0;
  await database.transaction("rw", database.applications, async () => {
    for (const application of parsed.applications) {
      const exists = await database.applications.where({ company: application.company, role: application.role }).first();
      if (exists) duplicated++;
      else {
        await database.applications.add(application);
        added++;
      }
    }
    assertBrowserOwner(owner);
  });
  return { added, duplicated, invalid: parsed.invalidRows };
}
