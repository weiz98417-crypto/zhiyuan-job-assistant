import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { runLegacyRunMigrationCli } from "@/lib/agent/runtime/legacy-run-migration-cli";

let directory: string | undefined;

afterEach(() => {
  vi.unstubAllEnvs();
  if (directory) {
    for (const filename of fs.readdirSync(directory)) fs.unlinkSync(path.join(directory, filename));
    fs.rmdirSync(directory);
    directory = undefined;
  }
});

function fixtureDirectory() {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), "spec40-legacy-cli-"));
  return directory;
}

describe("legacy Run maintenance CLI boundary", () => {
  it("requires an explicit database target even when a general DATABASE_URL is configured", async () => {
    vi.stubEnv("DATABASE_URL", "postgresql://unapproved-target.invalid/production");
    await expect(runLegacyRunMigrationCli(["inspect", "--owner", "owner", "--operator", "maintainer", "--run", "run"]))
      .rejects.toThrow("--database-url");
  });

  it("requires an explicit stable scope and output artifact before any database work", async () => {
    await expect(runLegacyRunMigrationCli(["inspect", "--database-url", "postgresql://unapproved-target.invalid/database", "--owner", "owner", "--operator", "maintainer"]))
      .rejects.toThrow(/--run|--output/);
  });

  it("rejects an owner mismatch in a reviewed artifact before connecting", async () => {
    const location = fixtureDirectory();
    const manifestPath = path.join(location, "manifest.json");
    const approvalPath = path.join(location, "approval.json");
    fs.writeFileSync(manifestPath, JSON.stringify({ version: 1, operation: "apply", userId: "other-owner", operatorId: "maintainer" }));
    fs.writeFileSync(approvalPath, "{}");
    await expect(runLegacyRunMigrationCli(["apply", "--database-url", "postgresql://unapproved-target.invalid/database", "--owner", "owner",
      "--operator", "maintainer", "--manifest", manifestPath, "--approval", approvalPath, "--output", path.join(location, "result.json")]))
      .rejects.toThrow(/owner/);
    expect(fs.existsSync(path.join(location, "result.json"))).toBe(false);
  });

  it("refuses to overwrite an existing review artifact before any database work", async () => {
    const location = fixtureDirectory();
    const outputPath = path.join(location, "review.json");
    fs.writeFileSync(outputPath, "original-evidence");
    await expect(runLegacyRunMigrationCli(["inspect", "--database-url", "postgresql://unapproved-target.invalid/database", "--owner", "owner",
      "--operator", "maintainer", "--run", "run", "--output", outputPath])).rejects.toThrow(/exist|overwrite/i);
    expect(fs.readFileSync(outputPath, "utf8")).toBe("original-evidence");
  });
});
