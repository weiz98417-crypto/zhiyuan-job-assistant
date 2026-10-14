import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

export function requireInterviewEvidenceId(value) {
  if (typeof value !== "string" || !/^[a-zA-Z0-9_-]+$/.test(value)) {
    throw new Error("SPEC40_INTERVIEW_EVIDENCE_ID must be an explicit, safe, unique ID");
  }
  return value;
}

export function reserveInterviewEvidence({ evidenceRoot, evidenceId, environment = process.env, processId = process.pid, parentId = process.ppid }) {
  const validatedId = requireInterviewEvidenceId(evidenceId);
  const root = path.resolve(evidenceRoot);
  const outputDirectory = path.join(root, validatedId);
  const oracleDirectory = path.join(root, "oracles", validatedId);
  const reservationDirectory = path.join(root, ".reservations");
  const markerPath = path.join(reservationDirectory, validatedId + ".json");
  const environmentKey = "SPEC40_INTERVIEW_EVIDENCE_RESERVATION";
  if (fs.existsSync(markerPath)) {
    const reservation = JSON.parse(fs.readFileSync(markerPath, "utf8"));
    const sameRun = environment[environmentKey] === reservation.token
      && (processId === reservation.processId || parentId === reservation.processId);
    if (sameRun) return { outputDirectory, oracleDirectory };
    throw new Error("Interview evidence ID is already reserved; choose a new ID: " + validatedId);
  }
  if (fs.existsSync(outputDirectory) || fs.existsSync(oracleDirectory)) {
    throw new Error("Interview evidence already exists; choose a new ID: " + validatedId);
  }
  fs.mkdirSync(reservationDirectory, { recursive: true });
  const token = randomUUID();
  let descriptor;
  try {
    descriptor = fs.openSync(markerPath, "wx");
  } catch (error) {
    if (error.code === "EEXIST") throw new Error("Interview evidence ID is already reserved; choose a new ID: " + validatedId);
    throw error;
  }
  try {
    fs.writeFileSync(descriptor, JSON.stringify({ evidenceId: validatedId, processId, token, reservedAt: new Date().toISOString() }, null, 2));
  } finally { fs.closeSync(descriptor); }
  environment[environmentKey] = token;
  return { outputDirectory, oracleDirectory };
}

export function writeImmutableInterviewEvidence(filePath, value) {
  const content = JSON.stringify(value, null, 2);
  try {
    fs.writeFileSync(filePath, content, { flag: "wx" });
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
    if (fs.readFileSync(filePath, "utf8") !== content) throw new Error("Refusing to overwrite interview evidence: " + filePath);
  }
}
