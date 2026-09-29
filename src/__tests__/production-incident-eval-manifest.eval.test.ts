import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  productionIncidentEvalManifest,
  type ProductionIncidentEval,
} from "@/__tests__/fixtures/production-incident-eval-manifest";
import {
  CRITICAL_CROSS_TASK_BROWSER_JOURNEYS,
  PRODUCTION_BROWSER_EVAL_DOMAINS,
} from "@/lib/agent/production-browser-eval-catalog";

const root = process.cwd();

function testSource(item: ProductionIncidentEval): string {
  return item.testFiles
    .filter((file) => existsSync(path.join(root, file)))
    .map((file) => readFileSync(path.join(root, file), "utf8"))
    .join("\n");
}

describe("production incident eval manifest", () => {
  it("keeps every incident uniquely addressable and fully specified", () => {
    expect(productionIncidentEvalManifest.length).toBeGreaterThanOrEqual(40);
    expect(new Set(productionIncidentEvalManifest.map((item) => item.id)).size)
      .toBe(productionIncidentEvalManifest.length);

    const clusters = new Set(productionIncidentEvalManifest.map((item) => item.cluster));
    expect(clusters).toEqual(new Set([
      "release", "network", "auth", "visual", "session", "conversation", "resume",
      "jd", "score", "runtime", "model", "memory", "journey",
    ]));

    for (const item of productionIncidentEvalManifest) {
      expect(item.title.trim(), item.id).not.toBe("");
      expect(item.sourceIncident.trim(), item.id).not.toBe("");
      expect(item.fixture.trim(), item.id).not.toBe("");
      expect(item.expected.trim(), item.id).not.toBe("");
      expect(item.observed.trim(), item.id).not.toBe("");
      expect(item.evidence.length, item.id).toBeGreaterThanOrEqual(1);
      expect(item.requiredProductionEvidence.length, item.id).toBeGreaterThanOrEqual(2);
      expect(item.status, item.id).toMatch(/^(covered|partial|missing|manual|blocked)$/);

      if (item.status === "covered" || item.status === "partial") {
        expect(item.testFiles.length + (item.catalogIds?.length ?? 0), item.id).toBeGreaterThan(0);
      }
      if (item.status === "blocked") {
        expect(item.releaseGate, item.id).toBe("hard");
        expect(item.requiredProductionEvidence.length, item.id).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it("does not point at missing local evidence files", () => {
    for (const item of productionIncidentEvalManifest) {
      for (const file of item.testFiles) {
        expect(existsSync(path.join(root, file)), `${item.id}: ${file}`).toBe(true);
      }
    }
  });

  it("binds every catalog reference to a real browser scenario", () => {
    const catalogIds = new Set([
      ...PRODUCTION_BROWSER_EVAL_DOMAINS.flatMap((domain) => domain.cases.map((item) => item.id)),
      ...CRITICAL_CROSS_TASK_BROWSER_JOURNEYS.map((item) => item.id),
    ]);
    for (const item of productionIncidentEvalManifest) {
      for (const catalogId of item.catalogIds ?? []) {
        expect(catalogIds.has(catalogId), `${item.id}: ${catalogId}`).toBe(true);
      }
    }
  });

  it("binds every declared test marker to executable local evidence", () => {
    for (const item of productionIncidentEvalManifest.filter((entry) => entry.testIds?.length)) {
      const source = testSource(item);
      expect(source, item.id).not.toBe("");
      for (const testId of item.testIds ?? []) {
        expect(source, `${item.id}: ${testId}`).toContain(testId);
      }
    }
  });

  it("keeps the missing reply and duplicate greeting incidents as production hard gates", () => {
    for (const id of ["RELEASE-MODEL-001", "CHAT-INPUT-001"]) {
      const incident = productionIncidentEvalManifest.find((item) => item.id === id);
      expect(incident, id).toBeDefined();
      expect(incident?.releaseGate, id).toBe("hard");
      expect(["partial", "covered"], id).toContain(incident?.status);
      expect(incident?.testIds?.length, id).toBeGreaterThan(0);
      expect(incident?.requiredProductionEvidence.length, id).toBeGreaterThanOrEqual(4);
    }
  });

  it("reports every unresolved hard gate and never calls it release-ready", () => {
    const unresolvedHardGates = productionIncidentEvalManifest.filter((item) =>
      item.releaseGate === "hard" && ["blocked", "missing", "manual", "partial"].includes(item.status),
    );
    expect(unresolvedHardGates.length).toBeGreaterThan(0);
    expect(unresolvedHardGates.every((item) => item.requiredProductionEvidence.length > 0)).toBe(true);
    const releaseReady = productionIncidentEvalManifest.every((item) =>
      item.releaseGate !== "hard" || item.status === "covered",
    );
    expect(releaseReady).toBe(false);
    expect(productionIncidentEvalManifest.some((item) => item.id === "RELEASE-UI-002" && item.status === "blocked")).toBe(true);
    expect(productionIncidentEvalManifest.some((item) => item.id === "FLOW-UI-001" && item.status === "blocked")).toBe(true);
  });
});
