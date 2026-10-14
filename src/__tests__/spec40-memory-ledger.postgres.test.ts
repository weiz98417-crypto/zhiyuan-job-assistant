import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { Pool } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { admitMemory, resolveMemoryCandidate, type MemoryAdmissionInput } from "@/lib/memory/admission";
import { correctMemoryFact } from "@/lib/memory/correction";
import { getPostgresPool } from "@/lib/postgres";
import { getReadableMemoryPartitions, getProfileBlocks, listOpenFacts, listFactProvenance, searchFactsHybrid, recordEpisode, recordFact, upsertProfileBlock } from "@/lib/memory/fact-ledger";
import { memoryContentHash, memoryTargetKey } from "@/lib/memory/erasure";

const connectionString = process.env.SPEC40_MEMORY_DATABASE_URL;
let independent: Pool;
let userId: string;
const owners: string[] = [];

describe.skipIf(!connectionString)("Spec 40 memory ledger with independent PostgreSQL read-back", () => {
  beforeAll(async () => {
    const target = new URL(connectionString!);
    if (target.hostname !== "127.0.0.1" || target.port !== "55440" || target.pathname !== "/spec40_memory") {
      throw new Error("Memory regressions require dedicated local spec40_memory database");
    }
    process.env.DB_DRIVER = "postgres";
    process.env.DATABASE_URL = connectionString;
    process.env.POSTGRES_MAX_CONNECTIONS = "8";
    independent = new Pool({ connectionString });
    expect((await independent.query("SELECT current_database() AS name")).rows[0].name).toBe("spec40_memory");
    await independent.query("CREATE EXTENSION IF NOT EXISTS vector");
    await independent.query(readFileSync("src/lib/postgres-schema.sql", "utf8"));
  });

  beforeEach(async () => {
    userId = "spec40-memory-ledger-" + randomUUID();
    owners.push(userId);
    await independent.query("INSERT INTO users (id, username, password_hash, display_name, status) VALUES ($1,$1,'fixture','Synthetic memory fixture','active')", [userId]);
    await independent.query("INSERT INTO memory_partitions (user_id,partition,readable_agents,writable_agents) SELECT $1,partition,ARRAY['user','profile'],ARRAY['user','profile'] FROM unnest(ARRAY['core','private']) partition", [userId]);
  });

  afterEach(async () => {
    if (!independent) return;
    await independent.query("DROP TRIGGER IF EXISTS spec40_reject_memory_chunk ON memory_fact_chunks");
    await independent.query("DROP FUNCTION IF EXISTS spec40_reject_memory_chunk()");
  });

  afterAll(async () => {
    if (!independent) return;
    await independent.query("DELETE FROM memory_admission_candidates WHERE user_id=ANY($1::text[])", [owners]);
    await independent.query("UPDATE memory_facts SET decision_id=NULL, superseded_by=NULL WHERE user_id=ANY($1::text[])", [owners]);
    await independent.query("DELETE FROM memory_fact_decisions WHERE user_id=ANY($1::text[])", [owners]);
    await independent.query("DELETE FROM memory_facts WHERE user_id=ANY($1::text[])", [owners]);
    await independent.query("DELETE FROM users WHERE id=ANY($1::text[])", [owners]);
    await independent.end();
    await getPostgresPool().end();
  });

  async function propose(text: string) {
    const result = await admitMemory({ userId, agentId: "profile", kind: "remember_request",
      sourceType: "user_explicit_memory", sourceId: randomUUID(),
      fact: { partition: "core", subject: "job_search", predicate: "task_style", object: { value: text },
        canonicalText: text, confidence: 1, importance: 0.7 }, evidence: { quote: text } });
    expect(result.outcome).toBe("candidate");
    return result.candidate!;
  }

  async function state() {
    const tables = ["memory_facts", "memory_episodes", "memory_fact_decisions", "memory_fact_chunks", "memory_admission_candidates", "memory_entities", "profile_blocks", "memory_partitions"];
    const directRows = await Promise.all(tables.map(async (table) => ({ table,
      rows: (await independent.query(`SELECT * FROM ${table} WHERE user_id=$1 ORDER BY 1`, [userId])).rows })));
    return [...directRows,
      { table: "memory_entity_facts", rows: (await independent.query("SELECT ef.* FROM memory_entity_facts ef JOIN memory_facts f ON f.id=ef.fact_id WHERE f.user_id=$1 ORDER BY ef.entity_id,ef.fact_id", [userId])).rows },
      { table: "memory_profile_block_facts", rows: (await independent.query("SELECT bf.* FROM memory_profile_block_facts bf JOIN profile_blocks b ON b.id=bf.profile_block_id WHERE b.user_id=$1 ORDER BY bf.profile_block_id,bf.fact_id", [userId])).rows }];
  }

  function activeInput(): MemoryAdmissionInput {
    return { userId, agentId: "profile", kind: "current_preference", sourceType: "user_explicit_memory", sourceId: randomUUID(),
      fact: { partition: "core", subject: "job_search", predicate: "target_city", object: { city: "上海" },
        canonicalText: "我现在希望在上海找工作", confidence: 1, importance: 0.8 },
      evidence: { quote: "我现在希望在上海找工作", directCurrentIntent: true } };
  }

  it("replays direct active admission without new decisions or derived writes", async () => {
    const input = activeInput();
    const original = await admitMemory(input);
    const stable = await state();
    expect(await admitMemory(input)).toEqual(original);
    expect(await state()).toEqual(stable);
  });

  it("serializes simultaneous direct admissions for one source into one decision", async () => {
    const input = activeInput();
    const results = await Promise.all([admitMemory(input), admitMemory(input), admitMemory(input)]);
    expect(results[1]).toEqual(results[0]);
    expect(results[2]).toEqual(results[0]);
    expect((await independent.query("SELECT * FROM memory_fact_decisions WHERE user_id=$1", [userId])).rows).toHaveLength(1);
    expect((await independent.query("SELECT * FROM memory_facts WHERE user_id=$1", [userId])).rows).toHaveLength(1);
  });

  it.each(["object", "partition", "predicate"])("rejects direct source reuse with a changed %s and preserves the original state", async (field) => {
    const input = activeInput();
    await admitMemory(input);
    const stable = await state();
    const changed = { ...input.fact, ...(field === "object" ? { object: { city: "北京" } }
      : field === "partition" ? { partition: "private" } : { predicate: "work_city" }) };
    await expect(admitMemory({ ...input, fact: changed })).rejects.toThrow();
    expect(await state()).toEqual(stable);
  });

  it("rejects stale direct admission replay after a later source replaces its fact", async () => {
    const input = activeInput();
    await admitMemory(input);
    const text = "我现在希望在北京找工作";
    await admitMemory({ ...input, sourceId: randomUUID(), fact: { ...input.fact, object: { city: "北京" }, canonicalText: text },
      evidence: { quote: text, directCurrentIntent: true } });
    const stable = await state();
    await expect(admitMemory(input)).rejects.toThrow();
    expect(await state()).toEqual(stable);
  });

  it("rechecks current write authorization before returning a prior direct admission", async () => {
    const input = activeInput();
    await admitMemory(input);
    await independent.query("UPDATE memory_partitions SET writable_agents=ARRAY['user'] WHERE user_id=$1", [userId]);
    const stable = await state();
    await expect(admitMemory(input)).rejects.toThrow("不可写入");
    expect(await state()).toEqual(stable);
  });

  it("confirms a replacement once and retains old history, source, decision and chunk linkage", async () => {
    const first = await propose("我希望建议简短");
    const original = await resolveMemoryCandidate(userId, first.id, "confirm");
    const targetId = original.candidate.factId!;
    const second = await propose("我希望建议详细");
    const resolved = await resolveMemoryCandidate(userId, second.id, "confirm");
    expect(resolved.candidate).toMatchObject({ status: "confirmed" });
    const replacementId = resolved.candidate.factId!;
    expect(replacementId).not.toBe(targetId);
    const facts = (await independent.query("SELECT id,canonical_text,invalid_at,invalidation_reason,superseded_by FROM memory_facts WHERE user_id=$1 ORDER BY id", [userId])).rows;
    expect(facts).toHaveLength(2);
    expect(facts[0]).toMatchObject({ canonical_text: "我希望建议简短", superseded_by: String(replacementId) });
    expect(facts[0].invalid_at).toBeInstanceOf(Date);
    expect(facts[0].invalidation_reason).toContain("invalidates fact");
    expect(facts[1]).toMatchObject({ canonical_text: "我希望建议详细", invalid_at: null });
    const provenance = (await independent.query(`SELECT e.source_type,e.source_id,d.decision,d.target_fact_id,d.result_fact_id,c.content
      FROM memory_facts f JOIN memory_episodes e ON e.id=f.source_episode_id
      JOIN memory_fact_decisions d ON d.id=f.decision_id JOIN memory_fact_chunks c ON c.fact_id=f.id
      WHERE f.id=$1 AND f.user_id=$2`, [replacementId, userId])).rows[0];
    expect(provenance).toMatchObject({ source_type: "user_explicit_memory", source_id: second.sourceId,
      decision: "UPDATE", target_fact_id: String(targetId), result_fact_id: String(replacementId), content: "我希望建议详细" });
    const beforeReplay = await state();
    expect((await resolveMemoryCandidate(userId, second.id, "confirm")).candidate.factId).toBe(replacementId);
    expect(await state()).toEqual(beforeReplay);
  });

  it("corrects once, replays the exact source, and rejects stale or foreign correction without writes", async () => {
    const candidate = await propose("我希望建议简短");
    const targetId = (await resolveMemoryCandidate(userId, candidate.id, "confirm")).candidate.factId!;
    const input = { targetFactId: targetId, canonicalText: "我希望建议分成三个步骤", sourceText: "这是我现在明确的偏好" };
    const result = await correctMemoryFact({ userId }, input);
    expect(result[0]).toMatchObject({ decision: "UPDATE" });
    const stable = await state();
    expect(await correctMemoryFact({ userId }, input)).toEqual(result);
    expect(await state()).toEqual(stable);
    await expect(correctMemoryFact({ userId }, { ...input, canonicalText: "我希望建议分成四个步骤" })).rejects.toThrow();
    await expect(correctMemoryFact({ userId }, { ...input, sourceText: "另一个未确认来源" })).rejects.toThrow();
    await expect(correctMemoryFact({ userId: "foreign-" + randomUUID() }, input)).rejects.toThrow();
    expect(await state()).toEqual(stable);
  });

  it("serializes simultaneous identical corrections and rejects replay after a later revision", async () => {
    const candidate = await propose("我希望建议简短");
    const targetFactId = (await resolveMemoryCandidate(userId, candidate.id, "confirm")).candidate.factId!;
    const input = { targetFactId, canonicalText: "我希望建议详细", object: { style: "detailed", steps: 3 }, sourceText: "确认更正" };
    const results = await Promise.all([correctMemoryFact({ userId }, input), correctMemoryFact({ userId }, input)]);
    expect(results[0]).toEqual(results[1]);
    expect((await independent.query("SELECT id FROM memory_facts WHERE user_id=$1", [userId])).rows).toHaveLength(2);
    expect((await independent.query("SELECT id FROM memory_fact_decisions WHERE user_id=$1", [userId])).rows).toHaveLength(2);
    const beforeMismatch = await state();
    await expect(correctMemoryFact({ userId }, { ...input, object: { style: "detailed", steps: 4 } })).rejects.toThrow();
    expect(await state()).toEqual(beforeMismatch);
    await correctMemoryFact({ userId }, { targetFactId: results[0][0].factId, canonicalText: "我希望建议很详细", sourceText: "后续更正" });
    const stable = await state();
    await expect(correctMemoryFact({ userId }, input)).rejects.toThrow();
    expect(await state()).toEqual(stable);
  });

  it("does not allow current preference replacement to invalidate a read-only partition", async () => {
    await independent.query("INSERT INTO memory_partitions (user_id,partition,readable_agents,writable_agents) VALUES ($1,'research',ARRAY['user','profile','general'],ARRAY['general'])", [userId]);
    const oldEpisodeId = await recordEpisode({ userId }, { sourceType: "profile_signal", sourceId: randomUUID(), content: { fact: "旧城市上海" } });
    await recordFact({ userId }, { partition: "research", subject: "job_search", predicate: "target_city",
      object: { city: "上海" }, canonicalText: "旧城市上海", confidence: 1, importance: 0.8 },
    { episodeId: oldEpisodeId, agentId: "general", useLlmDecision: false });
    const episodeId = await recordEpisode({ userId }, { sourceType: "profile_signal", sourceId: randomUUID(), content: { fact: "新城市北京" } });
    const stable = await state();
    await expect(recordFact({ userId }, { partition: "core", subject: "job_search", predicate: "target_city",
      object: { city: "北京" }, canonicalText: "新城市北京", confidence: 1, importance: 0.8, currentPreference: true },
    { episodeId, agentId: "profile", useLlmDecision: false })).rejects.toThrow();
    expect(await state()).toEqual(stable);
  });

  it.each(["confirmation", "correction"])("rolls back the complete %s after chunk persistence fails", async (operation) => {
    const first = await propose("我希望建议简短");
    const targetId = (await resolveMemoryCandidate(userId, first.id, "confirm")).candidate.factId!;
    const replacementText = "spec40 injected chunk failure " + randomUUID();
    const pending = await propose(replacementText);
    const stable = await state();
    await independent.query(`CREATE FUNCTION spec40_reject_memory_chunk() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.content LIKE 'spec40 injected chunk failure %' THEN RAISE EXCEPTION 'spec40 injected chunk failure'; END IF; RETURN NEW; END $$`);
    await independent.query("CREATE TRIGGER spec40_reject_memory_chunk BEFORE INSERT ON memory_fact_chunks FOR EACH ROW EXECUTE FUNCTION spec40_reject_memory_chunk()");
    const attempted = operation === "confirmation"
      ? resolveMemoryCandidate(userId, pending.id, "confirm")
      : correctMemoryFact({ userId }, { targetFactId: targetId, canonicalText: replacementText, sourceText: "用户确认修订" });
    await expect(attempted).rejects.toThrow("spec40 injected chunk failure");
    expect(await state()).toEqual(stable);
  });

  it("serializes duplicate confirmation and rejects another owner without changing the candidate", async () => {
    const candidate = await propose("我希望建议简短");
    const stable = await state();
    await expect(resolveMemoryCandidate("foreign-" + randomUUID(), candidate.id, "confirm")).rejects.toThrow("not found");
    expect(await state()).toEqual(stable);
    const results = await Promise.all([resolveMemoryCandidate(userId, candidate.id, "confirm"), resolveMemoryCandidate(userId, candidate.id, "confirm")]);
    expect(results[0].candidate.factId).toBe(results[1].candidate.factId);
    expect((await independent.query("SELECT id FROM memory_facts WHERE user_id=$1 AND invalid_at IS NULL", [userId])).rows).toHaveLength(1);
    expect((await independent.query("SELECT id FROM memory_fact_decisions WHERE user_id=$1", [userId])).rows).toHaveLength(1);
  });

  it("keeps explicit missing partition access closed and never provisions ACL rows while reading", async () => {
    await independent.query("DELETE FROM memory_partitions WHERE user_id=$1", [userId]);
    await independent.query("INSERT INTO memory_partitions (user_id,partition,readable_agents,writable_agents) VALUES ($1,'core',ARRAY['user'],ARRAY['user'])", [userId]);
    const original = (await independent.query("SELECT * FROM memory_partitions WHERE user_id=$1 ORDER BY id", [userId])).rows;
    expect(await getReadableMemoryPartitions({ userId }, "profile")).toEqual([]);
    await expect(getProfileBlocks({ userId }, undefined, "profile")).rejects.toThrow();
    await expect(listOpenFacts({ userId }, { agentId: "profile" })).rejects.toThrow();
    expect(await listFactProvenance({ userId }, 1, "profile")).toBeNull();
    expect((await independent.query("SELECT * FROM memory_partitions WHERE user_id=$1 ORDER BY id", [userId])).rows).toEqual(original);
    expect((await state()).filter((entry) => entry.table !== "memory_partitions").every((entry) => entry.rows.length === 0)).toBe(true);
  });

  it("denies missing ACL provisioning without inserting default access", async () => {
    await independent.query("DELETE FROM memory_partitions WHERE user_id=$1", [userId]);
    expect(await getReadableMemoryPartitions({ userId }, "profile")).toEqual([]);
    await expect(getProfileBlocks({ userId }, undefined, "profile")).rejects.toThrow();
    await expect(listOpenFacts({ userId }, { agentId: "profile" })).rejects.toThrow();
    expect((await independent.query("SELECT * FROM memory_partitions WHERE user_id=$1", [userId])).rows).toEqual([]);
  });

  it("does not retrieve legacy facts lacking an attributable source episode", async () => {
    await independent.query("INSERT INTO memory_facts (user_id,partition,subject,predicate,object_json,canonical_text) VALUES ($1,'private','job_search','salary_floor','{\"salary_floor\":30000}','未知来源薪资底线')", [userId]);
    expect(await searchFactsHybrid({ userId }, { queryText: "薪资底线", queryEmbedding: null, agentId: "profile" })).toEqual([]);
  });

  it("retrieves Chinese salary facts without embeddings while preserving source, partition, owner and erasure boundaries", async () => {
    async function add(predicate: string, text: string, partition = "private", sourceType = "profile_signal") {
      const episodeId = await recordEpisode({ userId }, { sourceType, sourceId: randomUUID(), content: { fact: text } });
      const result = await recordFact({ userId }, { partition, subject: "job_search", predicate,
        object: { salary_floor: 30_000 }, canonicalText: text, confidence: 1, importance: 0.8 },
      { episodeId, agentId: "profile", useLlmDecision: false });
      return result[0].factId;
    }
    const allowed = await add("salary_floor", "我不接受低于3万的岗位");
    const erased = await add("salary_erased", "我希望月薪四万元");
    const inactive = await add("salary_old", "我的工资是2万");
    const excludedSource = await add("salary_document", "简历中的工资为5万", "private", "resume");
    const otherPartition = await add("salary_other_partition", "历史薪资为6万", "core");
    await independent.query("UPDATE memory_facts SET invalid_at=NOW() WHERE id=$1", [inactive]);
    const request = (await independent.query("INSERT INTO memory_erasure_requests (user_id,target_type,target_id,target_hash,status,scope_json) VALUES ($1,'fact',$2,'fixture','confirmed',$3::jsonb) RETURNING id", [userId, String(erased), JSON.stringify({ factIds: [erased] })])).rows[0];
    await independent.query("INSERT INTO memory_erasure_suppressions (user_id,target_hash,source_type,source_id,request_id) VALUES ($1,'fixture','profile_signal','fixture',$2)", [userId, request.id]);
    const original = await state();
    const input = { queryText: "你还记得我的薪资底线吗", queryEmbedding: null, partition: "private", agentId: "profile", sourceTypes: ["profile_signal"] };
    const found = await searchFactsHybrid({ userId }, input);
    expect(found.map((row) => row.factId)).toEqual([allowed]);
    expect(found[0].canonicalText).toBe("我不接受低于3万的岗位");
    expect(found.map((row) => row.factId)).not.toEqual(expect.arrayContaining([erased, inactive, excludedSource, otherPartition]));
    expect(await searchFactsHybrid({ userId }, { ...input, sourceTypes: [] })).toEqual([]);
    await expect(searchFactsHybrid({ userId: "foreign-" + randomUUID() }, input)).rejects.toThrow();
    await expect(searchFactsHybrid({ userId }, { ...input, agentId: "evaluate" })).rejects.toThrow();
    expect(await state()).toEqual(original);
  });

  it("retrieves an explicitly confirmed natural salary with a generic preference predicate", async () => {
    const text = "我期望30K";
    const input = activeInput();
    const admitted = await admitMemory({ ...input, fact: { ...input.fact, predicate: "job_preference", object: { value: "30K" }, canonicalText: text },
      evidence: { quote: text, directCurrentIntent: true, confirmedJobUse: true } });
    expect(admitted.outcome).toBe("active");
    const stable = await state();
    const found = await searchFactsHybrid({ userId }, { queryText: "我的期望薪资是多少", queryEmbedding: null, agentId: "profile", sourceTypes: ["user_explicit_memory"] });
    expect(found.map((row) => row.factId)).toEqual([admitted.recorded![0].factId]);
    expect(found[0].canonicalText).toBe(text);
    expect(await state()).toEqual(stable);
  });

  it("rejects stale profile blocks if any contributing fact is no longer active", async () => {
    async function privateFact(predicate: string, text: string) {
      const episodeId = await recordEpisode({ userId }, { sourceType: "profile_signal", sourceId: randomUUID(), content: { fact: text } });
      return (await recordFact({ userId }, { partition: "private", subject: "job_search", predicate,
        object: { value: text }, canonicalText: text, confidence: 1, importance: 0.8 },
      { episodeId, agentId: "profile", useLlmDecision: false }))[0].factId;
    }
    const city = await privateFact("target_city", "我现在希望在上海找工作");
    const mode = await privateFact("work_mode", "我现在希望远程工作");
    await upsertProfileBlock({ userId }, { topic: "job_search", subTopic: "preferences", value: { city: "上海", mode: "remote" },
      source: "profile_signal", agentId: "profile", factIds: [city, mode] });
    expect(await getProfileBlocks({ userId }, undefined, "profile")).toHaveLength(1);
    await correctMemoryFact({ userId }, { targetFactId: city, canonicalText: "我现在希望在北京找工作", sourceText: "更正当前城市" });
    const stable = await state();
    expect(await getProfileBlocks({ userId }, undefined, "profile")).toEqual([]);
    expect(await state()).toEqual(stable);
  });

  it.each(["content", "source_target"])("excludes suppressed %s facts before vector, text, entity and structured fusion", async (suppression) => {
    const sourceId = randomUUID();
    const canonicalText = "salary floor 30000";
    const episodeId = await recordEpisode({ userId }, { sourceType: "profile_signal", sourceId, content: { fact: canonicalText } });
    const factId = (await recordFact({ userId }, { partition: "private", subject: "job_search", predicate: "salary_floor",
      object: { salary_floor: 30_000 }, canonicalText, confidence: 1, importance: 0.8 },
    { episodeId, agentId: "profile", useLlmDecision: false }))[0].factId;
    const vector = [1, ...Array<number>(1535).fill(0)];
    await independent.query("UPDATE memory_fact_chunks SET embedding=$2::vector,embedding_status='embedded' WHERE fact_id=$1", [factId, JSON.stringify(vector)]);
    const input = { queryText: "salary", queryEmbedding: vector, partition: "private", agentId: "profile", sourceTypes: ["profile_signal"] };
    expect((await searchFactsHybrid({ userId }, input)).map((row) => row.factId)).toContain(factId);
    const request = (await independent.query("INSERT INTO memory_erasure_requests (user_id,target_type,target_id,target_hash,status,scope_json) VALUES ($1,'fact',$2,'fixture','confirmed','{}'::jsonb) RETURNING id", [userId, String(factId)])).rows[0];
    await independent.query("INSERT INTO memory_erasure_suppressions (user_id,target_hash,target_key,source_type,source_id,request_id) VALUES ($1,$2,$3,'profile_signal',$4,$5)",
      [userId, suppression === "content" ? memoryContentHash(canonicalText) : "unrelated-hash",
        suppression === "source_target" ? memoryTargetKey("job_search", "salary_floor") : null, sourceId, request.id]);
    expect(await searchFactsHybrid({ userId }, input)).toEqual([]);
    expect(await searchFactsHybrid({ userId }, { ...input, queryEmbedding: null })).toEqual([]);
    expect(await listFactProvenance({ userId }, factId, "profile")).toBeNull();
  });

  it.each([["\t", "content"], ["\t", "source_target"], ["\n", "content"], ["\n", "source_target"], ["\u00a0", "content"], ["\u00a0", "source_target"]])("matches erasure normalization for padded facts containing %j via %s", async (padding, suppression) => {
    const text = padding + "salary floor 30000" + padding;
    const subject = padding + "Job_Search" + padding;
    const predicate = padding + "SALARY_FLOOR" + padding;
    const sourceId = randomUUID();
    const episodeId = await recordEpisode({ userId }, { sourceType: "profile_signal", sourceId, content: { fact: text } });
    const factId = (await recordFact({ userId }, { partition: "private", subject, predicate, object: { salary_floor: 30_000 },
      canonicalText: text, confidence: 1, importance: 0.8 }, { episodeId, agentId: "profile", useLlmDecision: false }))[0].factId;
    const request = (await independent.query("INSERT INTO memory_erasure_requests (user_id,target_type,target_id,target_hash,status,scope_json) VALUES ($1,'fact',$2,'fixture','confirmed','{}'::jsonb) RETURNING id", [userId, String(factId)])).rows[0];
    await independent.query("INSERT INTO memory_erasure_suppressions (user_id,target_hash,target_key,source_type,source_id,request_id) VALUES ($1,$2,$3,'profile_signal',$4,$5)",
      [userId, suppression === "content" ? memoryContentHash(text) : "unrelated-hash", suppression === "source_target" ? memoryTargetKey(subject, predicate) : null, sourceId, request.id]);
    expect(await searchFactsHybrid({ userId }, { queryText: "salary", queryEmbedding: null, agentId: "profile" })).toEqual([]);
  });

  it.each([["İ", "salary_floor"], ["job_search", "ΟΣ"]])("matches JavaScript lowercase for source-target erasure of %j and %j", async (subject, predicate) => {
    const text = "salary floor 30000";
    const sourceId = randomUUID();
    const episodeId = await recordEpisode({ userId }, { sourceType: "profile_signal", sourceId, content: { fact: text } });
    const factId = (await recordFact({ userId }, { partition: "private", subject, predicate, object: { salary_floor: 30_000 },
      canonicalText: text, confidence: 1, importance: 0.8 }, { episodeId, agentId: "profile", useLlmDecision: false }))[0].factId;
    await upsertProfileBlock({ userId }, { topic: "job_search", subTopic: "salary", value: { minimum: 30_000 }, source: "profile_signal", agentId: "profile", factIds: [factId] });
    const input = { queryText: "salary", queryEmbedding: null, agentId: "profile" };
    expect((await searchFactsHybrid({ userId }, input)).map((row) => row.factId)).toContain(factId);
    const request = (await independent.query("INSERT INTO memory_erasure_requests (user_id,target_type,target_id,target_hash,status,scope_json) VALUES ($1,'fact',$2,'fixture','confirmed','{}'::jsonb) RETURNING id", [userId, String(factId)])).rows[0];
    await independent.query("INSERT INTO memory_erasure_suppressions (user_id,target_hash,target_key,source_type,source_id,request_id) VALUES ($1,'unrelated-hash',$2,'profile_signal',$3,$4)",
      [userId, memoryTargetKey(subject, predicate), sourceId, request.id]);
    expect(await searchFactsHybrid({ userId }, input)).toEqual([]);
    expect(await listFactProvenance({ userId }, factId, "profile")).toBeNull();
    expect(await getProfileBlocks({ userId }, undefined, "profile")).toEqual([]);
  });

  it("keeps profile projection within the allowed source policy for every dependent fact", async () => {
    const sourceId = randomUUID();
    const episodeId = await recordEpisode({ userId }, { sourceType: "unknown_source", sourceId, content: { fact: "未知来源上海" } });
    const factId = (await recordFact({ userId }, { partition: "private", subject: "job_search", predicate: "target_city", object: { city: "上海" },
      canonicalText: "未知来源上海", confidence: 1, importance: 0.8 }, { episodeId, agentId: "profile", useLlmDecision: false }))[0].factId;
    await upsertProfileBlock({ userId }, { topic: "job_search", subTopic: "city", value: { city: "上海" }, source: "profile_signal", agentId: "profile", factIds: [factId] });
    expect(await getProfileBlocks({ userId }, undefined, "profile", { sourceTypes: ["profile_signal"] })).toEqual([]);
    expect(await getProfileBlocks({ userId }, undefined, "profile", { sourceTypes: [] })).toEqual([]);
  });

  it.each(["content", "source_target"])("keeps %s erasure suppression active for profile dependencies even with empty scope", async (suppression) => {
    const text = "我希望月薪3万";
    const sourceId = randomUUID();
    const episodeId = await recordEpisode({ userId }, { sourceType: "profile_signal", sourceId, content: { fact: text } });
    const factId = (await recordFact({ userId }, { partition: "private", subject: "job_search", predicate: "salary_floor", object: { salary_floor: 30_000 },
      canonicalText: text, confidence: 1, importance: 0.8 }, { episodeId, agentId: "profile", useLlmDecision: false }))[0].factId;
    await upsertProfileBlock({ userId }, { topic: "job_search", subTopic: "salary", value: { minimum: 30_000 }, source: "profile_signal", agentId: "profile", factIds: [factId] });
    expect(await getProfileBlocks({ userId }, undefined, "profile")).toHaveLength(1);
    const request = (await independent.query("INSERT INTO memory_erasure_requests (user_id,target_type,target_id,target_hash,status,scope_json) VALUES ($1,'fact',$2,'fixture','confirmed','{}'::jsonb) RETURNING id", [userId, String(factId)])).rows[0];
    await independent.query("INSERT INTO memory_erasure_suppressions (user_id,target_hash,target_key,source_type,source_id,request_id) VALUES ($1,$2,$3,'profile_signal',$4,$5)",
      [userId, suppression === "content" ? memoryContentHash(text) : "unrelated", suppression === "source_target" ? memoryTargetKey("job_search", "salary_floor") : null, sourceId, request.id]);
    expect(await getProfileBlocks({ userId }, undefined, "profile")).toEqual([]);
  });
});
