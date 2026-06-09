import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, verifyTokenVersion } from "@/lib/auth";
import { getDataRepositories } from "@/lib/data-repositories";
import {
  deleteMemoryItem,
  deleteReferenceResumePreferDisable,
  listMemoryGovernanceOverview,
  updateMemoryItemStatus,
} from "@/lib/memory/governance";
import {
  redactReferenceResumeText,
  reindexReferenceResumeRecord,
} from "@/lib/reference-resume-vector";

async function ensureAdmin() {
  const payload = await getCurrentUser();
  if (payload.role !== "admin") throw new Error("Forbidden");
  await verifyTokenVersion(payload);
  return payload;
}

export async function GET(request: NextRequest) {
  try {
    await ensureAdmin();
    const { searchParams } = new URL(request.url);
    const overview = await listMemoryGovernanceOverview({
      roleCategory: cleanFilter(searchParams.get("roleCategory")),
      sourceType: cleanFilter(searchParams.get("sourceType")),
      visibility: cleanFilter(searchParams.get("visibility")),
      status: cleanFilter(searchParams.get("status")),
      owner: cleanFilter(searchParams.get("owner")),
    });
    return NextResponse.json({ success: true, data: overview });
  } catch (error) {
    return handleAdminMemoryError(error, "[admin/memory] GET");
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const admin = await ensureAdmin();
    const body = await request.json().catch(() => ({}));
    const id = Number(body.id);
    const action = String(body.action || "");
    if (!id || !action) {
      return NextResponse.json({ success: false, error: "Invalid id or action" }, { status: 400 });
    }

    if (action.endsWith("_memory")) {
      const result = await applyMemoryItemAction(id, action);
      return NextResponse.json({ success: true, data: result });
    }

    const repos = getDataRepositories();
    const existing = await repos.referenceResumes.get(id);
    if (!existing) {
      return NextResponse.json({ success: false, error: "Reference resume not found" }, { status: 404 });
    }

    const now = new Date().toISOString();
    let indexing: Awaited<ReturnType<typeof reindexReferenceResumeRecord>> | null = null;
    let effectiveAction = action;

    if (action === "approve_reference") {
      const ok = await repos.referenceResumes.update(id, {
        visibility: "team",
        status: "active",
        anonymized: true,
        shared_text_redacted: existing.shared_text_redacted || redactReferenceResumeText(existing.raw_text),
        approved_by: admin.userId,
        approved_at: now,
      });
      if (!ok) return NextResponse.json({ success: false, error: "Reference resume update failed" }, { status: 500 });
      indexing = await reindexLatestReference(id, existing.user_id || admin.userId);
    } else if (action === "reject_reference") {
      const ok = await repos.referenceResumes.update(id, {
        visibility: "private",
        status: "active",
        approved_by: null,
        approved_at: null,
      });
      if (!ok) return NextResponse.json({ success: false, error: "Reference resume update failed" }, { status: 500 });
      indexing = await reindexLatestReference(id, existing.user_id || admin.userId);
    } else if (action === "disable_reference") {
      const ok = await repos.referenceResumes.update(id, {
        visibility: "disabled",
        status: "disabled",
      });
      if (!ok) return NextResponse.json({ success: false, error: "Reference resume update failed" }, { status: 500 });
      indexing = await reindexLatestReference(id, existing.user_id || admin.userId);
    } else if (action === "restore_reference") {
      const ok = await repos.referenceResumes.update(id, {
        visibility: "private",
        status: "active",
        approved_by: null,
        approved_at: null,
      });
      if (!ok) return NextResponse.json({ success: false, error: "Reference resume update failed" }, { status: 500 });
      indexing = await reindexLatestReference(id, existing.user_id || admin.userId);
    } else if (action === "reindex_reference") {
      indexing = await reindexLatestReference(id, existing.user_id || admin.userId);
    } else if (action === "delete_reference") {
      const deletion = await deleteReferenceResumePreferDisable(id);
      effectiveAction = deletion.disabled ? "disable_reference" : "delete_reference";
      return NextResponse.json({ success: true, data: { id, action, effectiveAction, deletion } });
    } else {
      return NextResponse.json({ success: false, error: "Unsupported action" }, { status: 400 });
    }

    return NextResponse.json({ success: true, data: { id, action, effectiveAction, indexing } });
  } catch (error) {
    return handleAdminMemoryError(error, "[admin/memory] PATCH");
  }
}

async function reindexLatestReference(id: number, ownerUserId: string) {
  const latest = await getDataRepositories().referenceResumes.get(id);
  if (!latest) return null;
  return reindexReferenceResumeRecord(latest, latest.user_id || ownerUserId);
}

async function applyMemoryItemAction(id: number, action: string) {
  if (action === "approve_memory") {
    return { id, action, updated: await updateMemoryItemStatus(id, "active") };
  }
  if (action === "reject_memory") {
    return { id, action, updated: await updateMemoryItemStatus(id, "rejected") };
  }
  if (action === "disable_memory") {
    return { id, action, updated: await updateMemoryItemStatus(id, "archived") };
  }
  if (action === "restore_memory") {
    return { id, action, updated: await updateMemoryItemStatus(id, "candidate") };
  }
  if (action === "delete_memory") {
    return { id, action, deleted: await deleteMemoryItem(id) };
  }
  throw new Error("Unsupported action");
}

function cleanFilter(value: string | null): string | undefined {
  const trimmed = (value || "").trim();
  return trimmed && trimmed !== "all" ? trimmed : undefined;
}

function handleAdminMemoryError(error: unknown, label: string) {
  const message = error instanceof Error ? error.message : String(error);
  if (message === "Forbidden") {
    return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
  }
  if (["Not authenticated", "Invalid or expired token", "Token has been revoked"].includes(message)) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }
  if (message === "Unsupported action") {
    return NextResponse.json({ success: false, error: "Unsupported action" }, { status: 400 });
  }
  console.error(label, error);
  return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
}
