import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
dotenv.config();

const DIMENSION = 1536;

async function main() {
  const provider = (process.env.MEMORY_EMBEDDING_PROVIDER || "disabled").trim();
  const apiUrl = process.env.MEMORY_EMBEDDING_API_URL?.trim() || "";
  const apiKey = process.env.MEMORY_EMBEDDING_API_KEY?.trim() || process.env.DASHSCOPE_API_KEY?.trim() || "";
  const model = process.env.MEMORY_EMBEDDING_MODEL?.trim() || "";
  const dimension = Number(process.env.MEMORY_EMBEDDING_DIMENSION || DIMENSION);
  const apiDimension = Number(process.env.MEMORY_EMBEDDING_API_DIMENSION || dimension);

  if (provider !== "openai-compatible") {
    throw new Error("MEMORY_EMBEDDING_PROVIDER must be openai-compatible for this smoke test");
  }
  if (!apiUrl || !apiKey || !model) {
    throw new Error("MEMORY_EMBEDDING_API_URL, MEMORY_EMBEDDING_API_KEY, and MEMORY_EMBEDDING_MODEL are required");
  }
  if (dimension !== DIMENSION) {
    throw new Error(`Embedding dimension mismatch: expected ${DIMENSION}, got ${dimension}`);
  }
  if (!Number.isInteger(apiDimension) || apiDimension <= 0 || apiDimension > dimension) {
    throw new Error(`Invalid MEMORY_EMBEDDING_API_DIMENSION: ${process.env.MEMORY_EMBEDDING_API_DIMENSION || ""}`);
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
      dimensions: apiDimension,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(`Embedding API ${response.status}: ${errorText.slice(0, 300)}`);
  }

  const payload = await response.json();
  const embedding = payload?.data?.[0]?.embedding;
  if (!Array.isArray(embedding) || embedding.length !== apiDimension) {
    throw new Error(`Embedding API dimension mismatch: expected ${apiDimension}, got ${Array.isArray(embedding) ? embedding.length : "non-array"}`);
  }
  const storedEmbedding = embedding.length === dimension
    ? embedding
    : [...embedding, ...Array.from({ length: dimension - embedding.length }, () => 0)];

  console.log(JSON.stringify({
    ok: true,
    provider,
    model,
    apiDimension: embedding.length,
    storageDimension: storedEmbedding.length,
  }));
}

main().catch((error) => {
  console.error(JSON.stringify({
    ok: false,
    error: error instanceof Error ? error.message : String(error),
  }));
  process.exitCode = 1;
});
