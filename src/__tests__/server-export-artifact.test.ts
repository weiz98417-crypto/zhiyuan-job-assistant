import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import {
  createBinaryExportArtifact,
  createExportArtifact,
  readExportArtifact,
} from "@/lib/server/export-artifact-service";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("server export artifacts", () => {
  it("writes, hashes, and reads back a user-scoped durable artifact", async () => {
    const rootDir = await mkdtemp(path.join(tmpdir(), "zhiyuan-artifact-"));
    roots.push(rootDir);

    const created = await createExportArtifact(
      { userId: "user-1" },
      { content: "# 简历\n\nAI 产品经理", filename: "我的简历", format: "md" },
      { rootDir },
    );
    const readBack = await readExportArtifact({ userId: "user-1" }, created.artifactId, { rootDir });
    const denied = await readExportArtifact({ userId: "user-2" }, created.artifactId, { rootDir });

    expect(created).toMatchObject({ readBackVerified: true, filename: "我的简历.md" });
    expect(created.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(readBack?.bytes.toString("utf8")).toContain("AI 产品经理");
    expect(denied).toBeNull();
  });

  it("preserves and verifies a user-scoped PDF artifact", async () => {
    const rootDir = await mkdtemp(path.join(tmpdir(), "zhiyuan-pdf-artifact-"));
    roots.push(rootDir);
    const pdf = Buffer.from("%PDF-1.4\n%%EOF\n", "utf8");

    const created = await createBinaryExportArtifact(
      { userId: "user-1" },
      {
        bytes: pdf,
        filename: "report-12.pdf",
        format: "pdf",
        contentType: "application/pdf",
      },
      { rootDir },
    );
    const readBack = await readExportArtifact({ userId: "user-1" }, created.artifactId, { rootDir });

    expect(created).toMatchObject({
      readBackVerified: true,
      filename: "report-12.pdf",
      format: "pdf",
      contentType: "application/pdf",
      size: pdf.length,
    });
    expect(readBack?.bytes.equals(pdf)).toBe(true);
  });
});
