import { randomUUID } from "node:crypto";
import { Pool, type QueryResult } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { admitMemory, resolveMemoryCandidate } from "@/lib/memory/admission";
import { correctMemoryFact } from "@/lib/memory/correction";
import { upsertProfileBlock } from "@/lib/memory/fact-ledger";
import { memoryContentHash, memoryTargetKey } from "@/lib/memory/erasure";
import { retrieveGovernedMemory } from "@/lib/memory/retrieval";
import { assembleAgentMemoryContext } from "@/lib/agent/memory-context";
import { getPostgresPool } from "@/lib/postgres";
import { POST as retrieveMemory } from "@/app/api/memory/retrieve/route";
import { POST as correctMemory } from "@/app/api/memory/correction/route";

const authenticated = vi.hoisted(() => ({ userId: "" }));
vi.mock("@/lib/auth", () => ({ getCurrentUser: async () => ({ userId: authenticated.userId, role: "member", username: "synthetic-fixture" }), verifyTokenVersion: async () => undefined }));

const connectionString = process.env.SPEC40_MEMORY_RETRIEVAL_DATABASE_URL;
let independent: Pool;
let owner: string;
const owners: string[] = [];

describe.skipIf(!connectionString)("Spec40 governed memory recovery with real PostgreSQL", () => {
  beforeAll(async () => {
    const target = new URL(connectionString!);
    if (target.hostname !== "127.0.0.1" || target.port !== "55440" || target.pathname !== "/spec40_memory_retrieval") {
      throw new Error("Memory retrieval fixture requires localhost:55440/spec40_memory_retrieval");
    }
    vi.stubEnv("DB_DRIVER", "postgres");
    vi.stubEnv("DATABASE_URL", connectionString!);
    independent = new Pool({ connectionString, max: 4 });
    expect((await independent.query("SELECT current_database() AS name")).rows[0].name).toBe("spec40_memory_retrieval");
  });
  beforeEach(async () => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.stubEnv("MEMORY_EMBEDDING_PROVIDER", "disabled");
    owner = "spec40-retrieval-" + randomUUID();
    authenticated.userId = owner;
    owners.push(owner);
    await independent.query("INSERT INTO users(id,username,password_hash,display_name,status) VALUES($1,$1,'fixture','Synthetic memory retrieval','active')", [owner]);
    await independent.query("INSERT INTO memory_partitions(user_id,partition,readable_agents,writable_agents) VALUES($1,'private',ARRAY['user','profile'],ARRAY['user','profile']),($1,'core',ARRAY['user','profile','evaluate'],ARRAY['user','profile'])", [owner]);
  });
  afterAll(async () => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    if (independent) {
      await independent.query("DELETE FROM profiles WHERE user_id=ANY($1::text[])", [owners]);
      await independent.query("DELETE FROM sessions WHERE user_id=ANY($1::text[])", [owners]);
      await independent.query("DELETE FROM memory_chunks WHERE user_id=ANY($1::text[])", [owners]);
      await independent.query("DELETE FROM memory_items WHERE user_id=ANY($1::text[])", [owners]);
      await independent.query("DELETE FROM memory_admission_candidates WHERE user_id=ANY($1::text[])", [owners]);
      await independent.query("UPDATE memory_facts SET decision_id=NULL,superseded_by=NULL WHERE user_id=ANY($1::text[])", [owners]);
      await independent.query("DELETE FROM memory_fact_decisions WHERE user_id=ANY($1::text[])", [owners]);
      await independent.query("DELETE FROM memory_facts WHERE user_id=ANY($1::text[])", [owners]);
      await independent.query("DELETE FROM users WHERE id=ANY($1::text[])", [owners]);
      await independent.end();
      await getPostgresPool().end();
    }
    vi.unstubAllEnvs();
  });

  it("returns a confirmed preference when embedding is disabled and discloses incomplete semantic retrieval", async () => {
    const admitted = await admitMemory({
      userId: owner, agentId: "profile", kind: "current_preference", sourceType: "user_explicit_memory", sourceId: randomUUID(),
      fact: { partition: "private", subject: "job_search", predicate: "profile_preference", object: { city: "上海" },
        canonicalText: "我只考虑上海远程岗位", confidence: 1, importance: 0.8 },
      evidence: { quote: "我只考虑上海远程岗位", directCurrentIntent: true },
    });
    expect(admitted.outcome).toBe("active");
    const result = await retrieveGovernedMemory({ principal: { userId: owner }, agentId: "profile", query: "我只考虑上海远程岗位", sourceTypes: ["profile_signal"] });
    expect(result.facts.map(fact => fact.factId)).toContain(admitted.recorded![0].factId);
    expect(result.facts[0].canonicalText).toBe("我只考虑上海远程岗位");
    expect(result.warnings).toContain("embedding:semantic_unavailable");
  });

  it("does not reveal a legacy private profile when governed reads fail", async () => {
    await independent.query("INSERT INTO profiles(user_id,data_json,goals_json) VALUES($1,$2,'{}')", [owner, JSON.stringify({ salary: "private-salary-marker" })]);
    await independent.query("DELETE FROM memory_partitions WHERE user_id=$1 AND partition='private'", [owner]);
    await independent.query("UPDATE memory_partitions SET readable_agents=ARRAY['evaluate'],writable_agents=ARRAY['user'] WHERE user_id=$1", [owner]);
    const before = (await independent.query("SELECT partition,readable_agents,writable_agents FROM memory_partitions WHERE user_id=$1 ORDER BY partition", [owner])).rows;
    const result = await assembleAgentMemoryContext({ userId: owner, task: "jd_evaluation", agentId: "evaluate", query: "salary" });
    expect(result.llmSummary).not.toContain("private-salary-marker");
    expect(result.structuredFacts).not.toEqual(expect.arrayContaining([expect.objectContaining({ sourceType: "profile" })]));
    expect(result.llmSummary).toContain("memory-retrieval-limitation");
    expect((await independent.query("SELECT partition,readable_agents,writable_agents FROM memory_partitions WHERE user_id=$1 ORDER BY partition", [owner])).rows).toEqual(before);
  });

  it("puts embedding degradation into the actual model context while retaining sourced facts", async () => {
    const result = await admitMemory({ userId: owner, agentId: "profile", kind: "current_preference", sourceType: "user_explicit_memory", sourceId: randomUUID(),
      fact: { partition: "private", subject: "job_search", predicate: "profile_preference", object: { location: "杭州" }, canonicalText: "我只考虑杭州岗位", confidence: 1, importance: 0.8 },
      evidence: { quote: "我只考虑杭州岗位", directCurrentIntent: true } });
    expect(result.outcome).toBe("active");
    const context = await assembleAgentMemoryContext({ userId: owner, task: "profile_growth", agentId: "profile", query: "我只考虑杭州岗位" });
    expect(context.structuredFacts).toEqual(expect.arrayContaining([expect.objectContaining({ text: "我只考虑杭州岗位", sourceId: result.recorded![0].factId, status: "active" })]));
    expect(context.llmSummary).toContain("我只考虑杭州岗位");
    expect(context.llmSummary).toContain("[memory-retrieval-limitation]");
    expect(context.llmSummary).toContain("未召回不能证明用户从未提供相关偏好");
  });

  it.each(["configuration", "rate_limited"])("recovers a Chinese salary preference under %s and never copies provider error text to the model", async reason => {
    vi.stubEnv("MEMORY_EMBEDDING_PROVIDER", "openai-compatible");
    vi.stubEnv("MEMORY_EMBEDDING_API_URL", reason === "configuration" ? "" : "http://127.0.0.1:1/synthetic-provider");
    vi.stubEnv("MEMORY_EMBEDDING_API_KEY", reason === "configuration" ? "" : "synthetic-fixture-key");
    vi.stubEnv("DASHSCOPE_API_KEY", "");
    vi.stubEnv("MEMORY_EMBEDDING_MODEL", "synthetic-fixture-model");
    const fetchProvider = vi.fn(async () => new Response("private-provider-error-marker", { status: 429 }));
    vi.stubGlobal("fetch", fetchProvider);
    const admitted = await admitMemory({ userId: owner, agentId: "profile", kind: "current_preference", sourceType: "user_explicit_memory", sourceId: randomUUID(),
      fact: { partition: "private", subject: "job_search", predicate: "salary", object: { salary: 30000 }, canonicalText: "我期望30K", confidence: 1, importance: 0.8 },
      evidence: { quote: "我期望30K", directCurrentIntent: true, confirmedJobUse: true } });
    expect(admitted.outcome).toBe("active");
    const result = await retrieveGovernedMemory({ principal: { userId: owner }, agentId: "profile", query: "我的薪资底线是多少", sourceTypes: ["profile_signal"] });
    expect(result.facts.map(fact => fact.factId)).toEqual([admitted.recorded![0].factId]);
    expect(result.warnings).toContain("embedding:" + reason);
    const context = await assembleAgentMemoryContext({ userId: owner, task: "profile_growth", agentId: "profile", query: "我的薪资底线是多少" });
    expect(context.llmSummary).toContain("我期望30K");
    expect(context.llmSummary).toContain("memory-retrieval-limitation");
    expect(context.llmSummary).not.toContain("private-provider-error-marker");
    expect((await independent.query("SELECT partition,canonical_text FROM memory_facts WHERE id=$1 AND user_id=$2", [admitted.recorded![0].factId, owner])).rows).toEqual([{ partition: "private", canonical_text: "我期望30K" }]);
    expect(fetchProvider.mock.calls.length > 0).toBe(reason === "rate_limited");
  });

  it("keeps pending and rejected candidates and obsolete or foreign facts out of degraded retrieval", async () => {
    const original = await admitMemory({ userId: owner, agentId: "profile", kind: "current_preference", sourceType: "user_explicit_memory", sourceId: randomUUID(),
      fact: { partition: "private", subject: "job_search", predicate: "profile_preference", object: { city: "北京" }, canonicalText: "只考虑北京岗位", confidence: 1, importance: 0.8 },
      evidence: { quote: "只考虑北京岗位", directCurrentIntent: true } });
    const correction = await correctMemoryFact({ userId: owner }, { targetFactId: original.recorded![0].factId, canonicalText: "只考虑深圳岗位", object: { city: "深圳" }, sourceText: "现在明确改为深圳" });
    const pending = await admitMemory({ userId: owner, agentId: "profile", kind: "remember_request", sourceType: "user_explicit_memory", sourceId: randomUUID(),
      fact: { partition: "private", subject: "pending_target", predicate: "profile_preference", object: {}, canonicalText: "深圳待确认偏好", confidence: 1, importance: 0.8 }, evidence: { quote: "深圳待确认偏好" } });
    const rejected = await admitMemory({ userId: owner, agentId: "profile", kind: "remember_request", sourceType: "user_explicit_memory", sourceId: randomUUID(),
      fact: { partition: "private", subject: "rejected_target", predicate: "profile_preference", object: {}, canonicalText: "深圳已拒绝偏好", confidence: 1, importance: 0.8 }, evidence: { quote: "深圳已拒绝偏好" } });
    await resolveMemoryCandidate(owner, rejected.candidate!.id, "reject");
    const foreign = owner + "-foreign";
    owners.push(foreign);
    await independent.query("INSERT INTO users(id,username,password_hash,display_name,status) VALUES($1,$1,'fixture','Foreign fixture','active')", [foreign]);
    const foreignEpisode = (await independent.query("INSERT INTO memory_episodes(user_id,source_type,source_id,content_json) VALUES($1,'user_explicit_memory','foreign-fixture','{}') RETURNING id", [foreign])).rows[0].id;
    const foreignFact = (await independent.query("INSERT INTO memory_facts(user_id,partition,subject,predicate,object_json,canonical_text,source_episode_id) VALUES($1,'private','job_search','profile_preference','{}','深圳别人的偏好',$2) RETURNING id", [foreign, foreignEpisode])).rows[0].id;
    await independent.query("INSERT INTO memory_fact_chunks(fact_id,user_id,content) VALUES($1,$2,'深圳别人的偏好')", [foreignFact, foreign]);
    const result = await retrieveGovernedMemory({ principal: { userId: owner }, agentId: "profile", query: "深圳", sourceTypes: ["profile_signal"] });
    expect(result.facts.map(fact => fact.factId)).toEqual([correction[0].factId]);
    expect(result.facts[0]).toMatchObject({ sourceType: "user_correction", canonicalText: "只考虑深圳岗位" });
    expect((await independent.query("SELECT status,fact_id FROM memory_admission_candidates WHERE id=$1", [pending.candidate!.id])).rows[0]).toMatchObject({ status: "pending", fact_id: null });
    const context = await assembleAgentMemoryContext({ userId: owner, task: "profile_growth", query: "深圳" });
    expect(context.llmSummary).toContain("只考虑深圳岗位");
    expect(context.llmSummary).not.toContain("只考虑北京岗位");
    expect(context.llmSummary).not.toContain("深圳待确认偏好");
    expect(context.llmSummary).not.toContain("深圳已拒绝偏好");
    expect(context.llmSummary).not.toContain("深圳别人的偏好");
  });

  it("keeps explicit source restrictions and preserves admitted source provenance at the HTTP service seam", async () => {
    const admitted = await admitMemory({ userId: owner, agentId: "profile", kind: "current_preference", sourceType: "user_explicit_memory", sourceId: randomUUID(),
      fact: { partition: "private", subject: "job_search", predicate: "profile_preference", object: {}, canonicalText: "上海岗位优先", confidence: 1, importance: 0.8 }, evidence: { quote: "上海岗位优先", directCurrentIntent: true } });
    await upsertProfileBlock({ userId: owner }, { topic: "job_search", subTopic: "city", value: { city: "上海" }, source: "user_explicit_memory", agentId: "profile", factIds: [admitted.recorded![0].factId] });
    for (const sourceTypes of [[], ["cv"]] as Array<Array<"cv">>) {
      const filtered = await retrieveGovernedMemory({ principal: { userId: owner }, agentId: "profile", query: "上海", sourceTypes });
      expect(filtered.facts).toEqual([]);
      expect(filtered.profile).toEqual([]);
    }
    vi.stubEnv("AGENT_INTERNAL_TOKEN", "synthetic-fixture-internal-token");
    const response = await retrieveMemory(new Request("http://localhost/api/memory/retrieve", {
      method: "POST", headers: { "content-type": "application/json", "x-agent-internal-token": "synthetic-fixture-internal-token", "x-agent-id": "profile", "x-agent-task": "profile_growth" },
      body: JSON.stringify({ query: "上海", sourceTypes: ["profile_signal"] }),
    }));
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.data.facts).toEqual(expect.arrayContaining([expect.objectContaining({ factId: admitted.recorded![0].factId, sourceType: "user_explicit_memory" })]));
    for (const sourceTypes of [[], ["unknown_source"]]) {
      const blockedResponse = await retrieveMemory(new Request("http://localhost/api/memory/retrieve", {
        method: "POST", headers: { "content-type": "application/json", "x-agent-internal-token": "synthetic-fixture-internal-token", "x-agent-id": "profile", "x-agent-task": "profile_growth" },
        body: JSON.stringify({ query: "上海", sourceTypes }),
      }));
      expect(blockedResponse.status).toBe(200);
      const blocked = await blockedResponse.json();
      expect(blocked.data.facts).toEqual([]);
      expect(blocked.data.profile).toEqual([]);
    }
  });

  it("rejects a late read gate closure during embedding without legacy fallback", async () => {
    vi.stubEnv("MEMORY_EMBEDDING_PROVIDER", "openai-compatible");
    vi.stubEnv("MEMORY_EMBEDDING_API_URL", "http://127.0.0.1:1/synthetic-provider");
    vi.stubEnv("MEMORY_EMBEDDING_API_KEY", "synthetic-fixture-key");
    vi.stubEnv("MEMORY_EMBEDDING_MODEL", "synthetic-fixture-model");
    await independent.query("INSERT INTO profiles(user_id,data_json,goals_json) VALUES($1,$2,'{}')", [owner, JSON.stringify({ salary: "closed-gate-legacy-marker" })]);
    vi.stubGlobal("fetch", vi.fn(async () => {
      await independent.query("UPDATE memory_runtime_gates SET state='closed',reason='Synthetic late closure' WHERE gate_name='read'");
      return new Response(JSON.stringify({ data: [{ embedding: Array.from({ length: 1536 }, (_, index) => index === 0 ? 1 : 0) }] }), { status: 200, headers: { "content-type": "application/json" } });
    }));
    try {
      await expect(retrieveGovernedMemory({ principal: { userId: owner }, agentId: "profile", query: "salary", sourceTypes: ["profile_signal"] })).rejects.toThrow("Memory read gate is closed");
      const context = await assembleAgentMemoryContext({ userId: owner, task: "profile_growth", agentId: "profile", query: "salary" });
      expect(context.structuredFacts).toEqual([]);
      expect(context.semanticSnippets).toEqual([]);
      expect(context.llmSummary).not.toContain("closed-gate-legacy-marker");
      expect(context.llmSummary).toContain("memory-retrieval-limitation");
    } finally {
      await independent.query("UPDATE memory_runtime_gates SET state='open',reason='Isolated fixture reopened' WHERE gate_name='read'");
    }
  });

  it("withholds unverified legacy chunks and all caller supplied memory without changing source records", async () => {
    vi.stubEnv("MEMORY_EMBEDDING_PROVIDER", "mock");
    const vector = "[" + Array.from({ length: 1536 }, (_, index) => index === 0 ? 1 : 0).join(",") + "]";
    const chunkId = (await independent.query("INSERT INTO memory_chunks(user_id,source_type,source_id,chunk_text,content_hash,embedding,embedding_status,metadata_json) VALUES($1,'profile','legacy-fixture','private-legacy-chunk-marker','fixture-hash',$2::vector,'embedded',$3::jsonb) RETURNING id", [owner, vector, JSON.stringify({ status: "active", visibility: "private" })])).rows[0].id;
    await independent.query("INSERT INTO sessions(user_id,title,memory_digest) VALUES($1,'Synthetic fixture','private-legacy-session-marker')", [owner]);
    await independent.query("INSERT INTO profiles(user_id,data_json,goals_json) VALUES($1,$2,'{}')", [owner, JSON.stringify({ city: "private-legacy-profile-marker" })]);
    await independent.query("INSERT INTO memory_items(user_id,memory_type,canonical_text,status) VALUES($1,'profile_preference','private-legacy-item-marker','active')", [owner]);
    await independent.query("DELETE FROM memory_partitions WHERE user_id=$1", [owner]);
    const original = (await independent.query("SELECT * FROM memory_chunks WHERE id=$1", [chunkId])).rows;
    const result = await retrieveGovernedMemory({ principal: { userId: owner }, agentId: "profile", query: "private", sourceTypes: ["profile"] });
    expect(result.snippets).toEqual([]);
    expect(result.facts).toEqual([]);
    const context = await assembleAgentMemoryContext({ userId: owner, task: "profile_growth", agentId: "profile", query: "private", semanticSnippets: [{ id: 123, sourceId: "forged-source", sourceType: "profile", snippet: "unverified-caller-snippet-marker", similarity: 1, score: 1, metadata: { status: "active", visibility: "private" } }] });
    expect(context.structuredFacts).toEqual([]);
    expect(context.semanticSnippets).toEqual([]);
    for (const marker of ["private-legacy-chunk-marker", "private-legacy-session-marker", "private-legacy-profile-marker", "private-legacy-item-marker", "unverified-caller-snippet-marker"]) {
      expect(context.llmSummary).not.toContain(marker);
    }
    expect(context.llmSummary).toContain("memory-retrieval-limitation");
    expect((await independent.query("SELECT * FROM memory_chunks WHERE id=$1", [chunkId])).rows).toEqual(original);
    expect((await independent.query("SELECT * FROM memory_partitions WHERE user_id=$1", [owner])).rows).toEqual([]);
  });

  it("does not return a historical fact invalidated after search but before provenance readback", async () => {
    const original = await admitMemory({ userId: owner, agentId: "profile", kind: "current_preference", sourceType: "user_explicit_memory", sourceId: randomUUID(),
      fact: { partition: "private", subject: "job_search", predicate: "profile_preference", object: {}, canonicalText: "上海岗位优先", confidence: 1, importance: 0.8 }, evidence: { quote: "上海岗位优先", directCurrentIntent: true } });
    const database = getPostgresPool();
    const realQuery = database.query.bind(database);
    let invalidated = false;
    const interceptedQuery = async (statement: string, values?: unknown[]): Promise<QueryResult> => {
      const result = await realQuery(statement, values);
      if (!invalidated && result.fields.some(field => field.name === "entity_score")) {
        invalidated = true;
        await correctMemoryFact({ userId: owner }, { targetFactId: original.recorded![0].factId, canonicalText: "深圳岗位优先", object: {}, sourceText: "现在改为深圳" });
      }
      return result;
    };
    vi.spyOn(database, "query").mockImplementation(interceptedQuery as typeof database.query);
    const result = await retrieveGovernedMemory({ principal: { userId: owner }, agentId: "profile", query: "上海", sourceTypes: ["profile_signal"] });
    expect(invalidated).toBe(true);
    expect(result.facts).toEqual([]);
    expect((await independent.query("SELECT canonical_text,invalid_at FROM memory_facts WHERE id=$1", [original.recorded![0].factId])).rows[0].invalid_at).toBeInstanceOf(Date);
  });

  it("requires job-purpose consent on salary correction and moves a confirmed replacement to private exactly once", async () => {
    const original = await admitMemory({ userId: owner, agentId: "profile", kind: "current_preference", sourceType: "user_explicit_memory", sourceId: randomUUID(),
      fact: { partition: "core", subject: "job_search", predicate: "profile_preference", object: {}, canonicalText: "我希望建议简短", confidence: 1, importance: 0.8 }, evidence: { quote: "我希望建议简短", directCurrentIntent: true } });
    const requestBody = { targetFactId: original.recorded![0].factId, canonicalText: "我期望30K", object: { salary_floor: 30000 }, sourceText: "我确认改为这个偏好" };
    const before = (await independent.query("SELECT * FROM memory_facts WHERE user_id=$1 ORDER BY id", [owner])).rows;
    const denied = await correctMemory(new Request("http://localhost/api/memory/correction", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(requestBody) }));
    expect(denied.status).toBe(422);
    expect(await denied.json()).toMatchObject({ success: false, code: "sensitive_job_use_confirmation_required" });
    expect((await independent.query("SELECT * FROM memory_facts WHERE user_id=$1 ORDER BY id", [owner])).rows).toEqual(before);
    const response = await correctMemory(new Request("http://localhost/api/memory/correction", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...requestBody, confirmedJobUse: true }) }));
    expect(response.status).toBe(200);
    const payload = await response.json();
    const after = (await independent.query("SELECT id,partition,canonical_text,invalid_at,superseded_by FROM memory_facts WHERE user_id=$1 ORDER BY id", [owner])).rows;
    expect(after).toHaveLength(2);
    expect(after[0].invalid_at).toBeInstanceOf(Date);
    expect(after[0].superseded_by).toBe(String(payload.data.recorded[0].factId));
    expect(after[1]).toMatchObject({ partition: "private", canonical_text: "我期望30K", invalid_at: null });
    const replay = await correctMemory(new Request("http://localhost/api/memory/correction", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...requestBody, confirmedJobUse: true }) }));
    expect(replay.status).toBe(200);
    expect((await replay.json()).data.recorded).toEqual(payload.data.recorded);
    expect((await independent.query("SELECT count(*)::int AS count FROM memory_fact_decisions WHERE user_id=$1", [owner])).rows[0].count).toBe(2);
  });

  it("keeps a salary correction sensitive when its new amount relies on the existing fact context", async () => {
    const admitted = await admitMemory({ userId: owner, agentId: "profile", kind: "current_preference", sourceType: "user_explicit_memory", sourceId: randomUUID(),
      fact: { partition: "core", subject: "job_search", predicate: "job_preference", object: {}, canonicalText: "我希望建议简短", confidence: 1, importance: 0.8 },
      evidence: { quote: "我希望建议简短", directCurrentIntent: true } });
    const targetFactId = admitted.recorded![0].factId;
    await independent.query("UPDATE memory_facts SET canonical_text='我期望30K' WHERE id=$1 AND user_id=$2", [targetFactId, owner]);
    const correction = { targetFactId, canonicalText: "40K", object: { value: "40K" }, sourceText: "按当前标准调整" };
    const denied = await correctMemory(new Request("http://localhost/api/memory/correction", { method: "POST", body: JSON.stringify(correction) }));
    expect(denied.status).toBe(422);
    expect((await denied.json()).code).toBe("sensitive_job_use_confirmation_required");
    expect((await independent.query("SELECT canonical_text,invalid_at FROM memory_facts WHERE id=$1", [targetFactId])).rows[0]).toEqual({ canonical_text: "我期望30K", invalid_at: null });
    expect((await independent.query("SELECT count(*)::int AS count FROM memory_fact_decisions WHERE user_id=$1", [owner])).rows[0].count).toBe(1);
    const confirmed = await correctMemory(new Request("http://localhost/api/memory/correction", { method: "POST", body: JSON.stringify({ ...correction, confirmedJobUse: true }) }));
    expect(confirmed.status).toBe(200);
    const receipt = (await confirmed.json()).data.recorded;
    const replacementId = receipt[0].factId;
    expect((await independent.query("SELECT canonical_text,partition FROM memory_facts WHERE id=$1", [replacementId])).rows[0]).toEqual({ canonical_text: "40K", partition: "private" });
    const query = "我的期望薪资是多少";
    const result = await retrieveGovernedMemory({ principal: { userId: owner }, agentId: "profile", query, sourceTypes: ["profile_signal"] });
    expect(result.facts.map(fact => fact.factId)).toEqual([replacementId]);
    const context = await assembleAgentMemoryContext({ userId: owner, task: "profile_growth", agentId: "profile", query });
    expect(context.structuredFacts).toEqual(expect.arrayContaining([expect.objectContaining({ text: "40K", memoryType: "profile_preference", sourceId: replacementId })]));
    expect(context.llmSummary).toContain("40K");
    expect(context.llmSummary).not.toContain("我期望30K");
    const replay = await correctMemory(new Request("http://localhost/api/memory/correction", { method: "POST", body: JSON.stringify({ ...correction, confirmedJobUse: true }) }));
    expect(replay.status).toBe(200);
    expect((await replay.json()).data.recorded).toEqual(receipt);
    expect((await independent.query("SELECT count(*)::int AS count FROM memory_fact_decisions WHERE user_id=$1", [owner])).rows[0].count).toBe(2);
  });

  it("remembers a natural salary preference with a generic predicate on a Chinese paraphrase", async () => {
    const admitted = await admitMemory({ userId: owner, agentId: "profile", kind: "current_preference", sourceType: "user_explicit_memory", sourceId: randomUUID(),
      fact: { partition: "core", subject: "job_search", predicate: "job_preference", object: { value: "30K" }, canonicalText: "我期望30K", confidence: 1, importance: 0.8 },
      evidence: { quote: "我期望30K", directCurrentIntent: true, confirmedJobUse: true } });
    expect(admitted.outcome).toBe("active");
    const query = "我的期望薪资是多少";
    const result = await retrieveGovernedMemory({ principal: { userId: owner }, agentId: "profile", query, sourceTypes: ["profile_signal"] });
    expect(result.facts.map(fact => fact.factId)).toEqual([admitted.recorded![0].factId]);
    const context = await assembleAgentMemoryContext({ userId: owner, task: "profile_growth", agentId: "profile", query });
    expect(context.structuredFacts).toEqual(expect.arrayContaining([expect.objectContaining({ text: "我期望30K", memoryType: "profile_preference" })]));
    expect(context.llmSummary).toContain("我期望30K");
  });

  it.each(["content", "source-target"])("withholds a late %s suppression between search and independent provenance readback", async scope => {
    const sourceId = randomUUID();
    const admitted = await admitMemory({ userId: owner, agentId: "profile", kind: "current_preference", sourceType: "user_explicit_memory", sourceId,
      fact: { partition: "private", subject: "job_search", predicate: "profile_preference", object: {}, canonicalText: "杭州岗位优先", confidence: 1, importance: 0.8 }, evidence: { quote: "杭州岗位优先", directCurrentIntent: true } });
    const database = getPostgresPool();
    const realQuery = database.query.bind(database);
    let suppressed = false;
    const interceptedQuery = async (statement: string, values?: unknown[]): Promise<QueryResult> => {
      const result = await realQuery(statement, values);
      if (!suppressed && result.fields.some(field => field.name === "entity_score")) {
        suppressed = true;
        const requestId = (await independent.query("INSERT INTO memory_erasure_requests(user_id,target_type,target_id,target_hash,status,scope_json) VALUES($1,'fact',$2,$3,'completed','{}') RETURNING id", [owner, admitted.recorded![0].factId, memoryContentHash("杭州岗位优先")])).rows[0].id;
        await independent.query("INSERT INTO memory_erasure_suppressions(user_id,request_id,target_hash,source_type,source_id,target_key) VALUES($1,$2,$3,$4,$5,$6)", [owner, requestId,
          scope === "content" ? memoryContentHash("杭州岗位优先") : "nonmatching-fixture-hash",
          scope === "source-target" ? "user_explicit_memory" : null, scope === "source-target" ? sourceId : null,
          scope === "source-target" ? memoryTargetKey("job_search", "profile_preference") : null]);
      }
      return result;
    };
    vi.spyOn(database, "query").mockImplementation(interceptedQuery as typeof database.query);
    const result = await retrieveGovernedMemory({ principal: { userId: owner }, agentId: "profile", query: "杭州", sourceTypes: ["profile_signal"] });
    expect(suppressed).toBe(true);
    expect(result.facts).toEqual([]);
  });
});
