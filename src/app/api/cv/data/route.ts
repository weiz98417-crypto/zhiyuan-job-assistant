import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { CvWriteConflictError, getDataRepositories } from "@/lib/data-repositories";
import { getAgentReadService } from "@/lib/agent/runtime/agent-read-service";

export async function GET(request?: Request) {
  try {
    const user = await getCurrentUser();
    const includeSource = request ? new URL(request.url).searchParams.get("includeSource") === "1" : false;
    const data = await getAgentReadService().getCurrentResume(
      { userId: user.userId },
      { includeSource },
    );
    return NextResponse.json({ success: true, data });
  } catch (err) {
    if (err instanceof Error && err.message === "Not authenticated") {
      return NextResponse.json({ success: false, error: "未登录" }, { status: 401 });
    }
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const user = await getCurrentUser();
    const body = await request.json();
    const data = body?.data && typeof body.data === "object" ? body.data : body;
    const expectedActiveVersion = typeof body?.expectedActiveVersion === "string" ? body.expectedActiveVersion : "";
    const expectedBaseHash = typeof body?.expectedBaseHash === "string" ? body.expectedBaseHash : "";
    const repositories = getDataRepositories();
    if (expectedActiveVersion && expectedBaseHash) {
      await repositories.cv.upsertIfCurrent(user.userId, data, {
        activeVersion: expectedActiveVersion,
        baseHash: expectedBaseHash,
      });
    } else {
      await repositories.cv.upsert(user.userId, data);
    }
    const readBack = await repositories.cv.get(user.userId);
    if (!readBack?.data_json) throw new Error("CV 写入后读回失败");
    return NextResponse.json({ success: true, data: JSON.parse(readBack.data_json) });
  } catch (err) {
    if (err instanceof CvWriteConflictError) {
      return NextResponse.json({
        success: false,
        code: "base_version_conflict",
        error: "简历已在其他页面或 Agent 中更新，已阻止旧页面覆盖新内容。请刷新后重试。",
        data: { currentVersion: err.currentVersion, currentHash: err.currentHash },
      }, { status: 409 });
    }
    if (err instanceof Error && err.message === "Not authenticated") {
      return NextResponse.json({ success: false, error: "未登录" }, { status: 401 });
    }
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}
