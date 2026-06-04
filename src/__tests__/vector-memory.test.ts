import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildMemoryRetrievalQuery,
  chunkMemorySource,
  createDeterministicEmbedding,
  createEmbeddingProvider,
  embedChunksWithRetry,
  rerankMemoryRows,
  resolveMemoryEmbeddingConfig,
  type EmbeddingProvider,
  type MemoryRetrievalRow,
} from "@/lib/memory/vector-memory";

describe("vector memory schema", () => {
  const schema = fs.readFileSync(path.join(process.cwd(), "src", "lib", "postgres-schema.sql"), "utf-8");

  it("defines memory item, evidence, and chunk tables with pgvector metadata", () => {
    expect(schema).toContain("CREATE TABLE IF NOT EXISTS memory_items");
    expect(schema).toContain("CREATE TABLE IF NOT EXISTS memory_evidence");
    expect(schema).toContain("CREATE TABLE IF NOT EXISTS memory_chunks");
    expect(schema).toContain("embedding vector(1536)");
    expect(schema).toContain("embedding_model TEXT NOT NULL");
    expect(schema).toContain("failure_reason TEXT NOT NULL");
  });

  it("adds user, source, status, and recency indexes", () => {
    expect(schema).toContain("idx_memory_items_user_status");
    expect(schema).toContain("idx_memory_evidence_source");
    expect(schema).toContain("idx_memory_chunks_user_source");
    expect(schema).toContain("idx_memory_chunks_status");
    expect(schema).toContain("idx_memory_chunks_recent");
  });
});

describe("vector memory chunking and embeddings", () => {
  it("chunks source text with source metadata", () => {
    const chunks = chunkMemorySource({
      userId: "user-a",
      sourceType: "jd",
      sourceId: 42,
      title: "Acme - Product Manager",
      text: "Responsibilities\nBuild data products.\n\nRequirements\nKnow BI and AI.",
      metadata: { confidence: 0.8 },
    });

    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toMatchObject({
      userId: "user-a",
      sourceType: "jd",
      sourceId: "42",
      chunkIndex: 0,
    });
    expect(chunks[0].chunkText).toContain("Acme - Product Manager");
    expect(chunks[0].metadata.confidence).toBe(0.8);
    expect(chunks[0].contentHash).toHaveLength(64);
  });

  it("rejects embedding dimensions that do not match the schema", () => {
    expect(() => resolveMemoryEmbeddingConfig({
      MEMORY_EMBEDDING_PROVIDER: "mock",
      MEMORY_EMBEDDING_DIMENSION: "1024",
    })).toThrow(/dimension mismatch/);
  });

  it("produces deterministic mock embeddings", async () => {
    const provider = createEmbeddingProvider(resolveMemoryEmbeddingConfig({
      NODE_ENV: "test",
      MEMORY_EMBEDDING_PROVIDER: "mock",
    }));

    const [first] = await provider.embed(["data product manager"]);
    const [second] = await provider.embed(["data product manager"]);

    expect(first).toEqual(second);
    expect(first).toHaveLength(1536);
    expect(Math.hypot(...first)).toBeCloseTo(1, 5);
  });
});

describe("vector memory retrieval boundaries", () => {
  it("builds retrieval SQL scoped by user and source filters", () => {
    const query = buildMemoryRetrievalQuery({
      userId: "user-a",
      queryEmbedding: createDeterministicEmbedding("resume BI"),
      sourceTypes: ["resume", "jd"],
      limit: 5,
    });

    expect(query.sql).toContain("user_id = $2");
    expect(query.sql).toContain("source_type = ANY($3::text[])");
    expect(query.params[1]).toBe("user-a");
    expect(query.sourceTypes).toEqual(["cv", "reference_resume", "jd"]);
  });

  it("reranking never returns rows owned by another user", () => {
    const rows: MemoryRetrievalRow[] = [
      row({ id: 1, user_id: "user-a", source_id: "1", similarity: 0.7 }),
      row({ id: 2, user_id: "user-b", source_id: "2", similarity: 0.99 }),
    ];

    const snippets = rerankMemoryRows(rows, "user-a", 10);
    expect(snippets).toHaveLength(1);
    expect(snippets[0].id).toBe(1);
  });
});

describe("vector memory embedding failures", () => {
  it("records failed chunk embeddings without dropping source chunks", async () => {
    const chunks = chunkMemorySource({
      userId: "user-a",
      sourceType: "offer",
      sourceId: "offer-1",
      text: "Company: Acme\nRole: PM\nSalary: 30k x 15",
    });
    const provider: EmbeddingProvider = {
      model: "failing-embedding",
      dimension: 1536,
      async embed() {
        throw new Error("provider unavailable");
      },
    };

    const results = await embedChunksWithRetry(chunks, provider, { maxRetries: 1 });

    expect(results).toHaveLength(chunks.length);
    expect(results[0].embeddingStatus).toBe("failed");
    expect(results[0].failureReason).toContain("provider unavailable");
    expect(results[0].chunk.chunkText).toContain("Salary");
  });
});

function row(overrides: Partial<MemoryRetrievalRow>): MemoryRetrievalRow {
  return {
    id: 0,
    user_id: "user-a",
    source_type: "cv",
    source_id: "0",
    chunk_index: 0,
    chunk_text: "Built BI products and AI workflows.",
    embedding_model: "mock",
    metadata_json: { confidence: 0.8, importance: 0.7 },
    similarity: 0.5,
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}
