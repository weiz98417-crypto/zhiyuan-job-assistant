import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

export function memoryFixtureTextDigest(text) {
  return createHash("sha256").update(text.normalize("NFC").trim(), "utf8").digest("hex");
}

export function readMemoryBrowserFixture(directory, identity = process.env.SPEC40_MEMORY_BROWSER_FIXTURE_ID) {
  if (!identity || !/^[a-f0-9]+$/.test(identity)) throw new Error("An explicit safe memory fixture identity is required");
  const content = fs.readFileSync(path.join(directory, "fixture-" + identity + ".json"), "utf8");
  const fixture = JSON.parse(content);
  if (fixture.fixtureIdentity !== identity) throw new Error("Memory fixture identity mismatch");
  return { fixture, manifestSha256: createHash("sha256").update(content).digest("hex") };
}

function digestDirectory(directory, hash, prefix, excludeTests = false) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name))) {
    const relative = prefix + entry.name;
    const source = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (!excludeTests || entry.name !== "__tests__") digestDirectory(source, hash, relative + "/", excludeTests);
    }
    else if (entry.isFile()) hash.update(relative).update("\0").update(fs.readFileSync(source)).update("\0");
  }
}

export function sourceDigest(directory, excludeTests = false) {
  const hash = createHash("sha256");
  digestDirectory(directory, hash, "", excludeTests);
  return hash.digest("hex");
}

export function productionBuildDigest(appDirectory) {
  const hash = createHash("sha256");
  for (const name of ["server", "static"]) digestDirectory(path.join(appDirectory, ".next", name), hash, name + "/");
  hash.update("BUILD_ID\0").update(fs.readFileSync(path.join(appDirectory, ".next/BUILD_ID")));
  for (const entry of fs.readdirSync(path.join(appDirectory, ".next"), { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name))) {
    if (entry.isFile() && entry.name !== "BUILD_ID") hash.update(entry.name).update("\0").update(fs.readFileSync(path.join(appDirectory, ".next", entry.name))).update("\0");
  }
  for (const name of ["next.config.ts", "package.json", "postcss.config.mjs"]) {
    if (fs.existsSync(path.join(appDirectory, name))) hash.update(name).update("\0").update(fs.readFileSync(path.join(appDirectory, name))).update("\0");
  }
  return hash.digest("hex");
}
