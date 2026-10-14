import fs from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import pg from "pg";
import { test, type Browser } from "@e2e-dev/web";
import { credentials, expect, type Screen } from "e2e";
import { requireInterviewEvidenceId, writeImmutableInterviewEvidence } from "../../scripts/lib/spec40-interview-evidence.mjs";
import { memoryFixtureTextDigest, readMemoryBrowserFixture } from "../../scripts/lib/spec40-memory-browser-build.mjs";

type FixtureSource = { sourceSha256: string; createdAt: string; sourceId: string; canonicalText: string };
type FixtureUser = { id: string; username: string; facts: Array<FixtureSource & { id: number; partition: string; predicate: string }>;
  candidates: Array<FixtureSource & { id: number; sensitivity: string }> };
type MemorySnapshot = { facts: Array<Record<string, unknown>>; decisions: Array<Record<string, unknown>>;
  episodes: Array<Record<string, unknown>>; candidates: Array<Record<string, unknown>>; settings: Array<Record<string, unknown>>;
  derived: Record<string, Array<Record<string, unknown>>> };
const directory = path.resolve(".private/spec40/memory-browser");
const { fixture, manifestSha256 } = readMemoryBrowserFixture(directory);
const fixtureIdentity = fixture.fixtureIdentity;
const evidenceId = requireInterviewEvidenceId(process.env.SPEC40_MEMORY_BROWSER_EVIDENCE_ID);
const evidenceDirectory = path.resolve(".e2e/spec40-fourth-memory/oracles", evidenceId);
fs.mkdirSync(evidenceDirectory, { recursive: true });
writeImmutableInterviewEvidence(path.join(evidenceDirectory, "metadata.json"), {
  fixtureIdentity, sourceVersion: fixture.sourceVersion, sourceHash: fixture.sourceHash, buildHash: fixture.buildHash,
  buildId: fixture.buildId, database: "spec40_memory_browser", runtime: "production-next-start", manifestSha256,
  clock: fixture.clock, caseIds: fixture.caseIds, modelConfigured: false, workerConfigured: false,
  mockedCase: "BROWSER-MOCK: GET /api/memory/candidates 503 only in unavailable case; restored before retry",
});

async function request<Value>(browser: Browser, route: string, body?: unknown, method = body === undefined ? "GET" : "POST") {
  return browser.evaluate(async (serialized) => {
    const { route, body, method } = JSON.parse(String(serialized)) as { route: string; body?: unknown; method: string };
    const response = await fetch(route, { method, headers: { "Content-Type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: response.status, body: await response.json() };
  }, JSON.stringify({ route, body, method })) as Promise<{ status: number; body: Value }>;
}

async function login(app: { open(path: string): Promise<unknown> }, screen: Screen, browser: Browser, userName: string) {
  const runtime = JSON.parse(fs.readFileSync(path.join(directory, "runtime-" + evidenceId + ".json"), "utf8"));
  if (runtime.fixtureIdentity !== fixtureIdentity || runtime.sourceHash !== fixture.sourceHash
    || runtime.buildHash !== fixture.buildHash || runtime.manifestSha256 !== manifestSha256) {
    throw new Error("Memory browser runtime and fixture evidence binding mismatch");
  }
  writeImmutableInterviewEvidence(path.join(evidenceDirectory, "verified-runtime.json"), runtime);
  await app.open("/login");
  await screen.getByPlaceholder("输入用户名").fill(credentials.user(userName).username);
  await screen.getByPlaceholder("输入密码").fill(credentials.user(userName).password);
  const loginResponse = browser.waitForResponse("**/api/auth/login");
  await screen.getByRole("button", "登 录").tap();
  expect((await loginResponse).status).toBe(200);
  await expect(browser).toHaveURL("/");
  await expect(screen.getByRole("heading", "今日手账", { level: 1 })).toBeVisible();
  await browser.goto("/memory");
  await expect(screen.getByRole("heading", "我的记忆", { level: 1 })).toBeVisible();
  await expect(screen.getByRole("heading", "待确认候选（2）")).toBeVisible();
  await expect(screen.getByRole("heading", "已生效事实（7）")).toBeVisible();
}

async function independentReadback(user: FixtureUser, evidenceName: string): Promise<MemorySnapshot> {
  const client = new pg.Client({ connectionString: fixture.connectionString });
  await client.connect();
  try {
    expect((await client.query("SELECT current_database() AS name")).rows[0].name).toBe("spec40_memory_browser");
    const snapshot: MemorySnapshot = {
      facts: (await client.query("SELECT id,user_id,partition,subject,predicate,object_json,canonical_text,created_at,invalid_at,superseded_by,source_episode_id,decision_id,invalidation_reason FROM memory_facts WHERE user_id=$1 ORDER BY id", [user.id])).rows,
      decisions: (await client.query("SELECT * FROM memory_fact_decisions WHERE user_id=$1 ORDER BY id", [user.id])).rows,
      episodes: (await client.query("SELECT * FROM memory_episodes WHERE user_id=$1 ORDER BY id", [user.id])).rows,
      candidates: (await client.query("SELECT * FROM memory_admission_candidates WHERE user_id=$1 ORDER BY id", [user.id])).rows,
      settings: (await client.query("SELECT * FROM memory_discovery_settings WHERE user_id=$1", [user.id])).rows,
      derived: {},
    };
    for (const table of ["memory_fact_chunks", "memory_entities", "profile_blocks", "memory_partitions", "memory_erasure_requests", "memory_erasure_suppressions"]) {
      snapshot.derived[table] = (await client.query("SELECT * FROM " + table + " WHERE user_id=$1 ORDER BY to_jsonb(" + table + ")::text", [user.id])).rows;
    }
    snapshot.derived.memory_entity_facts = (await client.query("SELECT linked.* FROM memory_entity_facts linked JOIN memory_entities entity ON entity.id=linked.entity_id WHERE entity.user_id=$1 ORDER BY linked.entity_id,linked.fact_id", [user.id])).rows;
    snapshot.derived.memory_profile_block_facts = (await client.query("SELECT linked.* FROM memory_profile_block_facts linked JOIN profile_blocks profile ON profile.id=linked.profile_block_id WHERE profile.user_id=$1 ORDER BY linked.profile_block_id,linked.fact_id", [user.id])).rows;
    writeImmutableInterviewEvidence(path.join(evidenceDirectory, evidenceName + ".json"), snapshot);
    return snapshot;
  } finally { await client.end(); }
}

function verifyBaselineSources(user: FixtureUser, snapshot: MemorySnapshot) {
  for (const expected of user.facts) {
    const actual = snapshot.facts.find((fact) => Number(fact.id) === expected.id)!;
    expect(actual.user_id).toBe(user.id);
    expect(memoryFixtureTextDigest(String(actual.canonical_text))).toBe(expected.sourceSha256);
    expect(new Date(String(actual.created_at)).toISOString()).toBe(expected.createdAt);
    const episode = snapshot.episodes.find((item) => Number(item.id) === Number(actual.source_episode_id))!;
    expect(episode.source_id).toBe(expected.sourceId);
    expect(memoryFixtureTextDigest((episode.content_json as { evidence: { quote: string } }).evidence.quote)).toBe(expected.sourceSha256);
  }
  for (const expected of user.candidates) {
    const actual = snapshot.candidates.find((candidate) => Number(candidate.id) === expected.id)!;
    expect(actual.user_id).toBe(user.id);
    expect(actual.source_id).toBe(expected.sourceId);
    expect(memoryFixtureTextDigest((actual.evidence_json as { quote: string }).quote)).toBe(expected.sourceSha256);
    expect(new Date(String(actual.created_at)).toISOString()).toBe(expected.createdAt);
  }
}

test("memory sensitive correction requires purpose consent, cancel is inert, confirm replaces privately and exact replay is idempotent", async ({ app, screen, browser }) => {
  const user = fixture.users.correction as FixtureUser;
  await login(app, screen, browser, "correction");
  const original = user.facts[0];
  const baseline = await independentReadback(user, "correction-before");
  verifyBaselineSources(user, baseline);
  const replacement = "我期望30K到40K";
  const sourceText = "SYNTHETIC_CORRECTION_SOURCE：我现在明确期望30K到40K，仅用于求职筛选与建议";
  const payload = { targetFactId: original.id, canonicalText: replacement, sourceText, object: { value: replacement } };
  const card = screen.getByRole("article").filter({ hasText: original.canonicalText });
  await expect(card).toContainText("分区：core · 来源：user_explicit_memory / " + original.sourceId);
  let dialogs: string[] = [];
  let writes: unknown[] = [];
  await browser.route("**/api/memory/correction", async (route) => {
    if (route.request.method === "POST") writes.push(JSON.parse(route.request.postData || "{}"));
    await route.continue();
  });
  let unsubscribe = await browser.onDialog(async (dialog) => {
    dialogs.push(dialog.message);
    if (dialogs.length === 1) await dialog.accept(replacement);
    else if (dialogs.length === 2) await dialog.accept(sourceText);
    else await dialog.dismiss();
  });
  const rejectedResponse = browser.waitForResponse("**/api/memory/correction");
  await card.getByRole("button", "纠正").tap();
  const rejected = await rejectedResponse;
  expect(rejected.status).toBe(422);
  expect(await rejected.json<{ success: boolean; code: string }>()).toMatchObject({ success: false, code: "sensitive_job_use_confirmation_required" });
  await expect.poll(() => dialogs.length).toBe(3);
  expect(dialogs[2]).toContain("保存到私人记忆");
  await expect(card.getByRole("button", "纠正")).toBeEnabled();
  await unsubscribe();
  expect(writes).toEqual([{ ...payload, confirmedJobUse: false }]);
  expect(await independentReadback(user, "correction-cancelled")).toEqual(baseline);
  dialogs = [];
  writes = [];
  unsubscribe = await browser.onDialog(async (dialog) => {
    dialogs.push(dialog.message);
    if (dialogs.length === 1) await dialog.accept(replacement);
    else if (dialogs.length === 2) await dialog.accept(sourceText);
    else await dialog.accept();
  });
  await card.getByRole("button", "纠正").tap();
  await expect(screen.getByRole("status").filter({ hasText: "已写入纠正后的事实，旧事实已失效" })).toBeVisible();
  await expect(screen.getByRole("heading", "已生效事实（7）")).toBeVisible();
  await unsubscribe();
  expect(writes).toEqual([{ ...payload, confirmedJobUse: false }, { ...payload, confirmedJobUse: true }]);
  const saved = await independentReadback(user, "correction-confirmed");
  const oldFact = saved.facts.find((fact) => Number(fact.id) === original.id)!;
  expect(oldFact.invalid_at).not.toBeNull();
  const newFact = saved.facts.find((fact) => Number(fact.id) === Number(oldFact.superseded_by))!;
  expect(newFact).toMatchObject({ partition: "private", predicate: "salary_preference", canonical_text: replacement, object_json: { value: replacement }, invalid_at: null });
  const episode = saved.episodes.find((item) => Number(item.id) === Number(newFact.source_episode_id))!;
  expect(episode.source_type).toBe("user_correction");
  expect(episode.content_json).toEqual({ targetFactId: original.id, sourceText, replacement, confirmedJobUse: true });
  expect(saved.decisions).toHaveLength(baseline.decisions.length + 1);
  expect(saved.episodes).toHaveLength(baseline.episodes.length + 1);
  expect(saved.facts.filter((fact) => Number(fact.id) !== original.id && Number(fact.id) !== Number(newFact.id))).toEqual(baseline.facts.filter((fact) => Number(fact.id) !== original.id));
  expect(saved.candidates).toEqual(baseline.candidates);
  expect(saved.settings).toEqual(baseline.settings);
  expect(saved.derived.memory_partitions).toEqual(baseline.derived.memory_partitions);
  await browser.reload();
  const replacementCard = screen.getByRole("article").filter({ hasText: replacement }).filter({ hasText: "分区：private" });
  await expect(replacementCard).toContainText("来源：user_correction / " + episode.source_id);
  await expect(screen.getByRole("article").filter({ hasText: original.canonicalText })).toHaveCount(0);
  const replay = await request<{ success: boolean; data: { recorded: Array<{ factId: number }> } }>(browser, "/api/memory/correction", { ...payload, confirmedJobUse: true });
  expect(replay.status).toBe(200);
  expect(replay.body.success).toBe(true);
  expect(replay.body.data.recorded.map((item) => item.factId)).toEqual([Number(newFact.id)]);
  expect(await independentReadback(user, "correction-exact-replay")).toEqual(saved);
  await browser.unroute("**/api/memory/correction");
});

test("salary candidate cancellation writes nothing and confirmed purpose survives refresh with exact original evidence", async ({ app, screen, browser }) => {
  const user = fixture.users.candidate as FixtureUser;
  await login(app, screen, browser, "candidate");
  const candidate = user.candidates[0];
  const baseline = await independentReadback(user, "candidate-before");
  verifyBaselineSources(user, baseline);
  const card = screen.getByRole("article").filter({ hasText: candidate.canonicalText });
  await expect(card).toContainText("求职敏感内容：确认前会要求你同意仅用于求职辅助。");
  let writes = 0;
  await browser.route("**/api/memory/candidates", async (route) => {
    if (route.request.method === "PATCH") writes += 1;
    await route.continue();
  });
  const dismiss = await browser.onDialog("dismiss");
  await card.getByRole("button", "确认记住").tap();
  await expect(card.getByRole("button", "确认记住")).toBeEnabled();
  await dismiss();
  expect(writes).toBe(0);
  expect(await independentReadback(user, "candidate-cancelled")).toEqual(baseline);
  const accept = await browser.onDialog("accept");
  await card.getByRole("button", "确认记住").tap();
  await expect(screen.getByRole("status").filter({ hasText: "已确认记忆" })).toBeVisible();
  await expect(screen.getByRole("heading", "待确认候选（1）")).toBeVisible();
  await expect(screen.getByRole("heading", "已生效事实（8）")).toBeVisible();
  await accept();
  expect(writes).toBe(1);
  const saved = await independentReadback(user, "candidate-confirmed");
  const resolved = saved.candidates.find((item) => Number(item.id) === candidate.id)!;
  const evidence = resolved.evidence_json as { quote: string; confirmedJobUse: boolean; metadata: Record<string, unknown> };
  expect(resolved).toMatchObject({ status: "confirmed", partition: "private", sensitivity: "job_sensitive" });
  expect(evidence.quote).toBe(candidate.canonicalText);
  expect(evidence.confirmedJobUse).toBe(true);
  expect(evidence.metadata).toMatchObject({ fixture: true, originalEvidence: "SYNTHETIC_ORIGINAL_SOURCE",
    jobUseConfirmation: { purpose: "job_seeking", userId: user.id, candidateId: candidate.id,
      sourceType: "user_explicit_memory", sourceId: candidate.sourceId,
      fact: { canonicalText: candidate.canonicalText, partition: "private" } } });
  const fact = saved.facts.find((item) => Number(item.id) === Number(resolved.fact_id))!;
  expect(fact).toMatchObject({ canonical_text: candidate.canonicalText, partition: "private", invalid_at: null });
  const episode = saved.episodes.find((item) => Number(item.id) === Number(fact.source_episode_id))!;
  expect(episode).toMatchObject({ source_type: "user_explicit_memory", source_id: candidate.sourceId });
  expect((episode.content_json as { evidence: unknown }).evidence).toEqual(evidence);
  expect(saved.facts.filter((item) => Number(item.id) !== Number(fact.id))).toEqual(baseline.facts);
  expect(saved.candidates.filter((item) => Number(item.id) !== candidate.id)).toEqual(baseline.candidates.filter((item) => Number(item.id) !== candidate.id));
  expect(saved.settings).toEqual(baseline.settings);
  expect(saved.derived.memory_partitions).toEqual(baseline.derived.memory_partitions);
  await browser.reload();
  const savedCard = screen.getByRole("article").filter({ hasText: candidate.canonicalText });
  await expect(savedCard).toContainText("分区：private · 来源：user_explicit_memory / " + candidate.sourceId);
  const replay = await request(browser, "/api/memory/candidates", { id: candidate.id, action: "confirm", confirmedJobUse: true }, "PATCH");
  expect(replay.status).toBe(200);
  expect(await independentReadback(user, "candidate-exact-replay")).toEqual(saved);
  await browser.unroute("**/api/memory/candidates");
});

test("BROWSER-MOCK unavailable memory is explicit, blocks writes and real retry restores exact seven facts and two pending candidates", async ({ app, screen, browser }) => {
  const user = fixture.users.unavailable as FixtureUser;
  await login(app, screen, browser, "unavailable");
  const baseline = await independentReadback(user, "unavailable-before");
  verifyBaselineSources(user, baseline);
  let simulatedReads = 0;
  let writes = 0;
  await browser.route("**/api/memory/**", async (route) => {
    if (route.request.method !== "GET") writes += 1;
    if (route.request.method === "GET" && new URL(route.request.url).pathname === "/api/memory/candidates") {
      simulatedReads += 1;
      await route.fulfill({ status: 503, json: { success: false, error: "BROWSER-MOCK memory unavailable" } });
    } else await route.continue();
  });
  await browser.reload();
  await expect(screen.getByRole("alert").filter({ hasText: "记忆读取暂不可用" })).toContainText("记忆读取暂不可用，候选和事实数量尚未确认。请重试后再操作。");
  await expect(screen.getByRole("heading", "待确认候选（不可用）")).toBeVisible();
  await expect(screen.getByRole("heading", "已生效事实（不可用）")).toBeVisible();
  await expect(screen.getByRole("heading", "待确认候选（0）")).toHaveCount(0);
  await expect(screen.getByRole("heading", "已生效事实（0）")).toHaveCount(0);
  await expect(screen.getByRole("button", "自动发现状态待确认")).toBeDisabled();
  for (const name of ["确认记住", "拒绝", "纠正", "清除记忆"]) await expect(screen.getByRole("button", name)).toHaveCount(0);
  expect(simulatedReads).toBeGreaterThan(0);
  expect(writes).toBe(0);
  expect(await independentReadback(user, "unavailable-after-mock")).toEqual(baseline);
  writeImmutableInterviewEvidence(path.join(evidenceDirectory, "unavailable-injection.json"), {
    case: "BROWSER-MOCK", route: "GET /api/memory/candidates", status: 503, simulatedReads, writes,
  });
  await browser.unroute("**/api/memory/**");
  const restoredResponse = browser.waitForResponse("**/api/memory/candidates");
  await screen.getByRole("button", "重试读取记忆").tap();
  expect((await restoredResponse).status).toBe(200);
  await expect(screen.getByRole("heading", "待确认候选（2）")).toBeVisible();
  await expect(screen.getByRole("heading", "已生效事实（7）")).toBeVisible();
  for (const fact of user.facts) {
    const factCard = screen.getByRole("article").filter({ hasText: fact.canonicalText });
    await expect(factCard).toContainText("分区：" + fact.partition + " · 来源：user_explicit_memory / " + fact.sourceId);
    await expect(factCard.getByRole("button", "纠正")).toBeEnabled();
  }
  for (const candidate of user.candidates) {
    await expect(screen.getByRole("article").filter({ hasText: candidate.canonicalText })).toContainText("来源：user_explicit_memory / " + candidate.sourceId);
  }
  expect(await independentReadback(user, "unavailable-real-retry")).toEqual(baseline);
  writeImmutableInterviewEvidence(path.join(evidenceDirectory, "complete-" + randomUUID() + ".json"), { recovered: true, pending: 2, active: 7, realRetryStatus: 200 });
});

test("FAULT real memory page excludes erased targets and a foreign source while preserving four unrelated facts and both candidates", async ({ app, screen, browser }) => {
  const user = fixture.users.suppression as FixtureUser;
  await login(app, screen, browser, "suppression");
  verifyBaselineSources(user, await independentReadback(user, "suppression-before"));
  const client = new pg.Client({ connectionString: fixture.connectionString });
  await client.connect();
  try {
    for (const [index, mode] of [[0, "content"], [1, "source_target"]] as const) {
      const fact = user.facts[index];
      const request = (await client.query("INSERT INTO memory_erasure_requests(user_id,target_type,target_id,target_hash,status,scope_json) VALUES($1,'fact',$2,'fixture','confirmed','{}'::jsonb) RETURNING id", [user.id, String(fact.id)])).rows[0];
      const targetKey = createHash("sha256").update(JSON.stringify(["job_search", fact.predicate])).digest("hex");
      await client.query("INSERT INTO memory_erasure_suppressions(user_id,target_hash,target_key,source_type,source_id,request_id) VALUES($1,$2,$3,'user_explicit_memory',$4,$5)",
        [user.id, mode === "content" ? memoryFixtureTextDigest(fact.canonicalText) : "unrelated-hash", mode === "source_target" ? targetKey : null, fact.sourceId, request.id]);
    }
    const foreign = fixture.users.correction as FixtureUser;
    const foreignEpisode = (await client.query("SELECT source_episode_id FROM memory_facts WHERE id=$1 AND user_id=$2", [foreign.facts[1].id, foreign.id])).rows[0].source_episode_id;
    await client.query("UPDATE memory_facts SET source_episode_id=$3 WHERE id=$1 AND user_id=$2", [user.facts[2].id, user.id, foreignEpisode]);
  } finally { await client.end(); }
  const injected = await independentReadback(user, "suppression-injected");
  writeImmutableInterviewEvidence(path.join(evidenceDirectory, "suppression-injection.json"), {
    level: "FAULT", contentFactId: user.facts[0].id, sourceTargetFactId: user.facts[1].id,
    foreignEpisodeFactId: user.facts[2].id, scope: "synthetic PostgreSQL rows only; no model, HTTP, or erasure flow mock",
  });
  await browser.reload();
  await expect(screen.getByRole("heading", "已生效事实（4）")).toBeVisible();
  await expect(screen.getByRole("heading", "待确认候选（2）")).toBeVisible();
  for (const fact of user.facts.slice(0, 3)) await expect(screen.getByRole("article").filter({ hasText: fact.canonicalText })).toHaveCount(0);
  for (const fact of user.facts.slice(3)) await expect(screen.getByRole("article").filter({ hasText: fact.canonicalText })).toContainText("来源：user_explicit_memory / " + fact.sourceId);
  const restored = await request<{ success: boolean; data: { facts: Array<{ id: number }>; candidates: Array<{ id: number }> } }>(browser, "/api/memory/candidates");
  expect(restored.status).toBe(200);
  expect(restored.body.data.facts.map(fact => fact.id).sort((left, right) => left - right)).toEqual(user.facts.slice(3).map(fact => fact.id).sort((left, right) => left - right));
  expect(restored.body.data.candidates.map(candidate => candidate.id).sort((left, right) => left - right)).toEqual(user.candidates.map(candidate => candidate.id).sort((left, right) => left - right));
  expect(await independentReadback(user, "suppression-after-read")).toEqual(injected);
});
