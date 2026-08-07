import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

function source(file: string): string {
  return readFileSync(path.join(process.cwd(), file), "utf-8");
}

describe("memory governance admin boundaries", () => {
  it("requires admin access before any governance action can run", () => {
    const route = source("src/app/api/admin/memory/route.ts");

    expect(route).toContain('import { requireAdmin } from "@/lib/security/auth-guards"');
    expect(route.match(/requireAdmin\(\)/g)?.length).toBe(2);
    expect(route).toContain("approve_reference");
    expect(route).toContain("reject_reference");
    expect(route).toContain("disable_reference");
    expect(route).toContain("restore_reference");
    expect(route).toContain("delete_reference");
    expect(route).toContain("reindex_reference");
    expect(route).toContain("approve_memory");
    expect(route).toContain("reject_memory");
    expect(route).toContain("disable_memory");
    expect(route).toContain("restore_memory");
    expect(route).toContain("delete_memory");
  });

  it("keeps normal reference material APIs lightweight and owner-scoped", () => {
    const listRoute = source("src/app/api/cv/references/route.ts");
    const detailRoute = source("src/app/api/cv/references/[id]/route.ts");
    const cvPage = source("src/app/cv/page.tsx");
    const viewer = source("src/app/cv/reference-viewer.tsx");

    expect(listRoute).toContain("ownedByUser");
    expect(listRoute).not.toContain("...r");
    expect(listRoute).not.toContain("memory_items");
    expect(listRoute).not.toContain("reference_resume_chunks");
    expect(listRoute).not.toContain("memory_chunks");

    expect(detailRoute).toContain("buildSharedSections(resume)");
    expect(detailRoute).toContain("状态由管理员治理流程控制");
    expect(detailRoute).toContain("applyUserReferenceAction(\"request_team_share\"");
    expect(detailRoute).toContain("return \"withdraw_team_share\"");
    expect(detailRoute).not.toContain("updates.status = status");
    expect(detailRoute).not.toContain("memory_items");
    expect(detailRoute).not.toContain("reference_resume_chunks");
    expect(detailRoute).not.toContain("memory_chunks");

    expect(cvPage).not.toContain("/api/admin/reference-resumes");
    expect(viewer).toContain("canEdit = resume.ownedByUser !== false");
    expect(viewer).toContain("申请团队共享");
    expect(viewer).toContain("撤回共享申请");
    expect(viewer).toContain("转回私有");
  });

  it("renders admin governance queues and safe actions", () => {
    const page = source("src/app/admin/memory/page.tsx");
    const shell = source("src/components/shell/AppShell.tsx");
    const route = source("src/app/api/admin/memory/route.ts");
    const governance = source("src/lib/memory/governance.ts");

    expect(shell).toContain("/admin/memory");
    expect(shell).toContain("记忆治理");
    expect(page).toContain("/api/admin/memory");
    expect(page).toContain("useToast");
    expect(page).toContain("actionSuccessMessage");
    expect(page).toContain("payload.data?.updated === false");
    expect(page).toContain('showToast(actionSuccessMessage(action))');
    expect(page).toContain('showToast(message, "error")');
    expect(page).toContain("团队共享待审核");
    expect(page).toContain("Embedding 健康队列");
    expect(page).toContain("候选记忆模式");
    expect(page).toContain("低质量或高拒绝材料");
    expect(page).toContain("全部优秀简历材料");
    expect(page).toContain("approve_reference");
    expect(page).toContain("reject_reference");
    expect(page).toContain("disable_reference");
    expect(page).toContain("restore_reference");
    expect(page).toContain("delete_reference");
    expect(page).toContain("approve_memory");
    expect(page).toContain("reject_memory");
    expect(page).toContain('busy={busyId === `memory:${item.id}:approve_memory`}');
    expect(page).toContain('busy={busyId === `memory:${item.id}:reject_memory`}');
    expect(page).toContain("disable_memory");
    expect(route).toContain("Memory item not found or not updated");
    expect(route).toContain("nextStatus");
    expect(route).toContain('nextStatus: "active"');
    expect(route).toContain('nextStatus: "rejected"');
    expect(route).toContain("{ status: 404 }");
    expect(governance).toContain("WHERE mi.status = 'candidate'");
    expect(governance).not.toContain("WHERE mi.status IN ('candidate', 'active', 'rejected', 'archived')");
  });

  it("degrades vector governance gracefully on SQLite and hides raw internals from users", () => {
    const governance = source("src/lib/memory/governance.ts");
    const adminRoute = source("src/app/api/admin/memory/route.ts");
    const userListRoute = source("src/app/api/cv/references/route.ts");
    const userDetailRoute = source("src/app/api/cv/references/[id]/route.ts");

    expect(governance).toContain('getDatabaseDriver() !== "postgres"');
    expect(governance).toContain("vectorStoreAvailable");
    expect(governance).toContain("reference_resume_usage");
    expect(governance).toContain("recent_usage");
    expect(governance).toContain("normalizeRecentUsage");
    expect(governance).toContain("reference_resume_chunks");
    expect(governance).toContain("memory_evidence");
    expect(governance).toContain("deleteReferenceResumePreferDisable");
    expect(governance).toContain("referenceHasUsage");
    expect(adminRoute).toContain("deleteReferenceResumePreferDisable");

    expect(userListRoute).not.toContain("raw_text");
    expect(userListRoute).not.toContain("chunk_text");
    expect(userListRoute).not.toContain("embedding_status");
    expect(userDetailRoute).not.toContain("chunk_text");
    expect(userDetailRoute).not.toContain("embedding_status");
  });
});
