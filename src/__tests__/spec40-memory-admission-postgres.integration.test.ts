import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  admitMemory, listActiveMemoryFacts, listMemoryCandidates, resolveMemoryCandidate,
  type MemoryAdmissionInput,
} from "@/lib/memory/admission";
import { getPostgresPool } from "@/lib/postgres";

const connectionString = process.env.SPEC40_MEMORY_DATABASE_URL;
const owners: string[] = [];
let readBack: Pool;

describe.skipIf(!connectionString)("Spec 40 sensitive memory admission with independent PostgreSQL read-back", () => {
  beforeAll(async () => {
    const target = new URL(connectionString!);
    if (target.hostname !== "127.0.0.1" || target.port !== "55440" || target.pathname !== "/spec40_memory") {
      throw new Error("Sensitive admission requires the dedicated local spec40_memory fixture");
    }
    process.env.DB_DRIVER = "postgres";
    process.env.DATABASE_URL = connectionString;
    readBack = new Pool({ connectionString, max: 2 });
    expect((await readBack.query("SELECT current_database() AS database")).rows[0].database).toBe("spec40_memory");
  });

  afterAll(async () => {
    if (!readBack) return;
    await readBack.query("DELETE FROM users WHERE id = ANY($1::text[])", [owners]);
    await getPostgresPool().end();
    await readBack.end();
  });

  async function input(text: string, overrides: Partial<MemoryAdmissionInput> = {}): Promise<MemoryAdmissionInput> {
    const userId = "spec40-salary-" + randomUUID();
    owners.push(userId);
    await readBack.query("INSERT INTO users (id, username, password_hash, display_name, status) VALUES ($1,$1,'synthetic','Salary fixture','active')", [userId]);
    await readBack.query(`INSERT INTO memory_partitions (user_id, partition, readable_agents, writable_agents)
      VALUES ($1,'core',ARRAY['user','profile'],ARRAY['profile']), ($1,'private',ARRAY['user','profile'],ARRAY['profile'])`, [userId]);
    return {
      userId, agentId: "profile", kind: "current_preference", sourceType: "user_explicit_memory", sourceId: randomUUID(),
      fact: { partition: "core", subject: "user", predicate: "job_preference", object: { value: text }, canonicalText: text, confidence: 1, importance: 0.8 },
      evidence: { quote: text, directCurrentIntent: true }, ...overrides,
    };
  }

  async function ledgerCounts(userId: string) {
    const result = await readBack.query(`SELECT
      (SELECT COUNT(*)::integer FROM memory_facts WHERE user_id=$1) AS facts,
      (SELECT COUNT(*)::integer FROM memory_episodes WHERE user_id=$1) AS episodes,
      (SELECT COUNT(*)::integer FROM memory_fact_decisions WHERE user_id=$1) AS decisions,
      (SELECT COUNT(*)::integer FROM memory_entities WHERE user_id=$1) AS entities,
      (SELECT COUNT(*)::integer FROM memory_fact_chunks WHERE user_id=$1) AS chunks`, [userId]);
    return result.rows[0];
  }

  it("reclassifies a pending legacy salary candidate into private memory on exact purpose confirmation", async () => {
    const source = await input("我期望30K", { kind: "remember_request" });
    const pending = await readBack.query(`INSERT INTO memory_admission_candidates
      (user_id, kind, partition, subject, predicate, object_json, canonical_text, source_type, source_id, evidence_json, sensitivity, expires_at)
      VALUES ($1,'remember_request','core','user','job_preference',$2::jsonb,$3,$4,$5,$6::jsonb,'none',NOW()+INTERVAL '1 day') RETURNING id`,
    [source.userId, JSON.stringify(source.fact.object), source.fact.canonicalText, source.sourceType, source.sourceId, JSON.stringify(source.evidence)]);
    const candidateId = Number(pending.rows[0].id);
    const before = await ledgerCounts(source.userId);
    await expect(resolveMemoryCandidate(source.userId, candidateId, "confirm")).rejects.toThrow("job-seeking use confirmation required");
    expect(await ledgerCounts(source.userId)).toEqual(before);
    expect(await listMemoryCandidates(source.userId)).toEqual(expect.arrayContaining([expect.objectContaining({ id: candidateId, status: "pending" })]));
    const confirmed = await resolveMemoryCandidate(source.userId, candidateId, "confirm", { confirmedJobUse: true });
    expect(confirmed.candidate).toMatchObject({ status: "confirmed", fact: { partition: "private" }, sensitivity: "job_sensitive" });
    const confirmationEvidence = {
      confirmedJobUse: true,
      quote: "我期望30K",
      metadata: { jobUseConfirmation: {
        purpose: "job_seeking", userId: source.userId, candidateId,
        sourceType: "user_explicit_memory", sourceId: source.sourceId,
        fact: { partition: "private", subject: "user", predicate: "job_preference", object: { value: "我期望30K" }, canonicalText: "我期望30K" },
        confirmedAt: expect.any(String),
      } },
    };
    expect(confirmed.candidate.evidence).toMatchObject(confirmationEvidence);
    const durableEvidence = await readBack.query(`SELECT candidate.evidence_json, episode.content_json
      FROM memory_admission_candidates candidate JOIN memory_facts fact ON fact.id=candidate.fact_id AND fact.user_id=candidate.user_id
      JOIN memory_episodes episode ON episode.id=fact.source_episode_id AND episode.user_id=fact.user_id
      WHERE candidate.id=$1 AND candidate.user_id=$2`, [candidateId, source.userId]);
    expect(durableEvidence.rows[0].evidence_json).toMatchObject(confirmationEvidence);
    expect(durableEvidence.rows[0].content_json).toMatchObject({ fact: "我期望30K", evidence: confirmationEvidence, confirmedByUser: true });
    const persisted = await readBack.query("SELECT partition, canonical_text FROM memory_facts WHERE user_id=$1 AND invalid_at IS NULL", [source.userId]);
    expect(persisted.rows).toEqual([{ partition: "private", canonical_text: "我期望30K" }]);
    expect(await listActiveMemoryFacts(source.userId)).toEqual(expect.arrayContaining([expect.objectContaining({ partition: "private", canonicalText: "我期望30K" })]));
    const after = await ledgerCounts(source.userId);
    expect(await resolveMemoryCandidate(source.userId, candidateId, "confirm", { confirmedJobUse: true })).toMatchObject({ candidate: { status: "confirmed" } });
    expect(await ledgerCounts(source.userId)).toEqual(after);
  });

  it.each(["我期望30K", "我工资3万", "我税前月薪30000元", "My salary30K", "我月薪三万", "我不接受低于3万", "我不接受低于3万的岗位", "我期望30K到40K"])(
    "does not write %s until the user confirms job-seeking use and then persists only private facts", async (text) => {
      const source = await input(text);
      const before = await ledgerCounts(source.userId);
      expect(await admitMemory(source)).toEqual({ outcome: "clarify", reason: "sensitive_job_use_confirmation_required" });
      expect(await ledgerCounts(source.userId)).toEqual(before);
      expect(await listMemoryCandidates(source.userId)).toEqual([]);
      expect(await listActiveMemoryFacts(source.userId)).toEqual([]);
      const accepted = await admitMemory({ ...source, evidence: { ...source.evidence, confirmedJobUse: true } });
      expect(accepted).toMatchObject({ outcome: "active", recorded: [expect.objectContaining({ decision: "ADD" })] });
      expect((await readBack.query("SELECT partition, canonical_text FROM memory_facts WHERE user_id=$1", [source.userId])).rows)
        .toEqual([{ partition: "private", canonical_text: text }]);
      expect((await readBack.query("SELECT source_type, source_id FROM memory_episodes WHERE user_id=$1", [source.userId])).rows)
        .toEqual([{ source_type: "user_explicit_memory", source_id: source.sourceId }]);
      expect(await listActiveMemoryFacts(source.userId)).toEqual([expect.objectContaining({ partition: "private", canonicalText: text, sourceId: source.sourceId })]);
      expect(await listActiveMemoryFacts(source.userId, "research")).toEqual([]);
    },
  );

  it("does not activate a cancelled salary candidate and requires separate purpose confirmation for an exact request", async () => {
    const cancelledSource = await input("我月薪三万", { kind: "remember_request" });
    const pending = await admitMemory(cancelledSource);
    expect(pending.candidate).toMatchObject({ status: "pending", sensitivity: "job_sensitive", fact: { partition: "private" } });
    const before = await ledgerCounts(cancelledSource.userId);
    await expect(resolveMemoryCandidate(cancelledSource.userId, pending.candidate!.id, "confirm")).rejects.toThrow("job-seeking use confirmation required");
    expect(await ledgerCounts(cancelledSource.userId)).toEqual(before);
    expect((await listMemoryCandidates(cancelledSource.userId))[0]).toMatchObject({ id: pending.candidate!.id, status: "pending" });
    expect(await resolveMemoryCandidate(cancelledSource.userId, pending.candidate!.id, "reject")).toMatchObject({ candidate: { status: "rejected" } });
    expect(await listMemoryCandidates(cancelledSource.userId)).toEqual([]);
    expect(await listActiveMemoryFacts(cancelledSource.userId)).toEqual([]);
    expect(await resolveMemoryCandidate(cancelledSource.userId, pending.candidate!.id, "confirm", { confirmedJobUse: true })).toMatchObject({ candidate: { status: "rejected" } });
    expect(await ledgerCounts(cancelledSource.userId)).toEqual(before);
  });

  it.each(["我不期望30K", "引用：我期望30K", "我朋友工资3万", "去年我月薪三万", "比如我工资3万"])(
    "rejects %s as a current salary source despite a caller claiming intent and consent", async (quote) => {
      const source = await input("我期望30K", { evidence: { quote, directCurrentIntent: true, confirmedJobUse: true } });
      const before = await ledgerCounts(source.userId);
      expect(await admitMemory(source)).toEqual({ outcome: "clarify", reason: "current_preference_intent_ambiguous" });
      expect(await ledgerCounts(source.userId)).toEqual(before);
      expect(await listMemoryCandidates(source.userId)).toEqual([]);
      expect(await listActiveMemoryFacts(source.userId)).toEqual([]);
    },
  );

  it.each(["agent", "reference_resume", "unknown_source", "profile_signal"])(
    "does not trust %s to activate a preference", async (sourceType) => {
      const source = await input("我期望30K", { sourceType, evidence: { quote: "我期望30K", directCurrentIntent: true, confirmedJobUse: true } });
      const before = await ledgerCounts(source.userId);
      expect(await admitMemory(source)).toEqual({ outcome: "rejected", reason: "source_not_current_user_preference" });
      expect(await ledgerCounts(source.userId)).toEqual(before);
      expect(await listActiveMemoryFacts(source.userId)).toEqual([]);
    },
  );

  it("uses a sensitive source quote for both candidate partition and explicit confirmation", async () => {
    const source = await input("我有一项求职条件", { kind: "remember_request", evidence: { quote: "我的月薪三万" } });
    const pending = await admitMemory(source);
    expect(pending.candidate).toMatchObject({ sensitivity: "job_sensitive", fact: { partition: "private" } });
    await expect(resolveMemoryCandidate(source.userId, pending.candidate!.id, "confirm")).rejects.toThrow("job-seeking use confirmation required");
    await resolveMemoryCandidate(source.userId, pending.candidate!.id, "confirm", { confirmedJobUse: true });
    expect((await readBack.query("SELECT partition FROM memory_facts WHERE user_id=$1", [source.userId])).rows).toEqual([{ partition: "private" }]);
  });

  it("leaves no source episode or ledger writes when a confirmed salary has no private write authorization", async () => {
    const source = await input("我期望30K", { evidence: { quote: "我期望30K", directCurrentIntent: true, confirmedJobUse: true } });
    await readBack.query("DELETE FROM memory_partitions WHERE user_id=$1 AND partition='private'", [source.userId]);
    const before = await ledgerCounts(source.userId);
    await expect(admitMemory(source)).rejects.toThrow("不可写入记忆分区 private");
    expect(await ledgerCounts(source.userId)).toEqual(before);
    expect(await listMemoryCandidates(source.userId)).toEqual([]);
    expect((await readBack.query("SELECT partition FROM memory_partitions WHERE user_id=$1", [source.userId])).rows).toEqual([{ partition: "core" }]);
  });

  it("supersedes the owner's old core salary when the user explicitly confirms the same current salary for job seeking", async () => {
    const source = await input("我期望30K", { evidence: { quote: "我期望30K", directCurrentIntent: true, confirmedJobUse: true } });
    const legacy = await readBack.query(`INSERT INTO memory_facts
      (user_id, partition, subject, predicate, object_json, canonical_text, confidence, importance)
      VALUES ($1,'core','user','job_preference',$2::jsonb,'我期望30K',1,0.8) RETURNING id`, [source.userId, JSON.stringify(source.fact.object)]);
    const legacyId = Number(legacy.rows[0].id);
    expect(await admitMemory(source)).toMatchObject({ outcome: "active", recorded: [expect.objectContaining({ decision: "UPDATE" })] });
    expect((await readBack.query("SELECT partition, canonical_text FROM memory_facts WHERE user_id=$1 AND invalid_at IS NULL", [source.userId])).rows)
      .toEqual([{ partition: "private", canonical_text: "我期望30K" }]);
    expect((await readBack.query("SELECT invalid_at IS NOT NULL AS invalidated, superseded_by IS NOT NULL AS superseded FROM memory_facts WHERE id=$1 AND user_id=$2", [legacyId, source.userId])).rows)
      .toEqual([{ invalidated: true, superseded: true }]);
    expect(await listActiveMemoryFacts(source.userId)).toEqual([expect.objectContaining({ partition: "private", canonicalText: "我期望30K" })]);
  });

  it("does not reuse candidate consent claims and rolls back purpose evidence when private authorization fails", async () => {
    const source = await input("我期望30K", {
      kind: "remember_request",
      evidence: { quote: "我期望30K", confirmedJobUse: true, metadata: { preservedSourceTag: "original" } },
    });
    const pending = await admitMemory(source);
    const candidateId = pending.candidate!.id;
    const before = await ledgerCounts(source.userId);
    await expect(resolveMemoryCandidate(source.userId, candidateId, "confirm")).rejects.toThrow("job-seeking use confirmation required");
    await expect(resolveMemoryCandidate(source.userId, candidateId, "confirm", { confirmedJobUse: false })).rejects.toThrow("job-seeking use confirmation required");
    expect(await ledgerCounts(source.userId)).toEqual(before);
    await readBack.query("DELETE FROM memory_partitions WHERE user_id=$1 AND partition='private'", [source.userId]);
    await expect(resolveMemoryCandidate(source.userId, candidateId, "confirm", { confirmedJobUse: true })).rejects.toThrow("不可写入记忆分区 private");
    expect(await ledgerCounts(source.userId)).toEqual(before);
    const durableCandidate = await readBack.query("SELECT status, evidence_json, fact_id FROM memory_admission_candidates WHERE id=$1 AND user_id=$2", [candidateId, source.userId]);
    expect(durableCandidate.rows).toEqual([{ status: "pending", evidence_json: source.evidence, fact_id: null }]);
  });
});
