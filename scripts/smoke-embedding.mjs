import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
dotenv.config();

const DIMENSION = 1536;

async function main() {
  const provider = (process.env.MEMORY_EMBEDDING_PROVIDER || "disabled").trim();
  const apiUrl = process.env.MEMORY_EMBEDDING_API_URL || "";
  const apiKey = process.env.MEMORY_EMBEDDING_API_KEY || process.env.DASHSCOPE_API_KEY || "";
  const model = process.env.MEMORY_EMBEDDING_MODEL || "";
  const dimension = Number(process.env.MEMORY_EMBEDDING_DIMENSION || DIMENSION);

  if (provider !== "openai-compatible") {
    throw new Error("MEMORY_EMBEDDING_PROVIDER must be openai-compatible for this smoke test");
  }
  if (!apiUrl || !apiKey || !model) {
    throw new Error("MEMORY_EMBEDDING_API_URL, MEMORY_EMBEDDING_API_KEY, and MEMORY_EMBEDDING_MODEL are required");
  }
  if (dimension !== DIMENSION) {
    throw new Error(`Embedding dimension mismatch: expected ${DIMENSION}, got ${dimension}`);
  }

  const response = await fetch(apiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      input: ["优秀AI产品经理简历：负责RAG知识库、Agent流程设计和数据指标体系建设。"],
      dimensions: dimension,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(`Embedding API ${response.status}: ${errorText.slice(0, 300)}`);
  }

  const payload = await response.json();
  const embedding = payload?.data?.[0]?.embedding;
  if (!Array.isArray(embedding) || embedding.length !== dimension) {
    throw new Error(`Embedding dimension mismatch: expected ${dimension}, got ${Array.isArray(embedding) ? embedding.length : "non-array"}`);
  }

  console.log(JSON.stringify({
    ok: true,
    provider,
    model,
    dimension: embedding.length,
  }));
}

main().catch((error) => {
  console.error(JSON.stringify({
    ok: false,
    error: error instanceof Error ? error.message : String(error),
  }));
  process.exitCode = 1;
});
