import fs from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import pg from "pg";

const connectionString = process.env.SPEC40_BROWSER_DATABASE_URL;
if (!connectionString) throw new Error("SPEC40_BROWSER_DATABASE_URL is required");
const location = new URL(connectionString);
if (location.hostname !== "127.0.0.1" || location.port !== "55440" || location.pathname !== "/spec40_isolated") {
  throw new Error("Refusing to seed outside the Spec 40 local fixture database");
}
const client = new pg.Client({ connectionString });
await client.connect();
try {
  const actual = await client.query("SELECT current_database() AS name");
  if (actual.rows[0].name !== "spec40_isolated") throw new Error("Fixture database identity mismatch");
  await client.query("CREATE EXTENSION IF NOT EXISTS vector");
  await client.query(fs.readFileSync("src/lib/postgres-schema.sql", "utf8"));
  const password = randomBytes(24).toString("base64url");
  const passwordHash = await bcrypt.hash(password, 10);
  const users = {
    a: { id: "spec40-browser-A", username: "spec40ownerA", password, displayName: "SPEC40_MEMBER_A" },
    b: { id: "spec40-browser-B", username: "spec40ownerB", password, displayName: "SPEC40_MEMBER_B" },
  };
  const cv = { activeVersion: "v1", versions: { v1: { id: "v1", label: "Fixture CV", createdAt: "2026-10-13T00:00:00.000Z", source: "manual",
    sections: [{ id: "summary", title: "个人概述", content: "SPEC40_A_CV: synthetic learning and test evidence only." }] } } };
  for (const user of Object.values(users)) {
    await client.query(`INSERT INTO users (id, username, password_hash, display_name, role, status)
      VALUES ($1, $2, $3, $4, 'member', 'active') ON CONFLICT (id) DO UPDATE SET password_hash = EXCLUDED.password_hash,
      status = 'active', token_version = 0`, [user.id, user.username, passwordHash, user.displayName]);
    const value = user.id === users.a.id ? cv : { activeVersion: "v1", versions: { v1: { ...cv.versions.v1, sections: [{ id: "summary", title: "个人概述", content: "SPEC40_B_CV" }] } } };
    await client.query("INSERT INTO cv_data (user_id, data_json) VALUES ($1, $2) ON CONFLICT (user_id) DO UPDATE SET data_json = EXCLUDED.data_json", [user.id, JSON.stringify(value)]);
  }
  const directory = path.resolve(".private/spec40");
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, "browser-fixture.json"), JSON.stringify({
    connectionString, jwtSecret: randomBytes(48).toString("base64url"), users, cv,
  }), { mode: 0o600 });
  console.log("Spec 40 synthetic browser accounts seeded; private fixture saved without printing credentials");
} finally { await client.end(); }
