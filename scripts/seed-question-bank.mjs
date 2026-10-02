#!/usr/bin/env node
/**
 * Spec 27：题库种子脚本（幂等）。
 *
 * 两种用法：
 *   node scripts/seed-question-bank.mjs                       # 导入 scripts/question-seeds/*.json 内置种子
 *   node scripts/seed-question-bank.mjs --generate 20        # 调 DeepSeek 为每个 family 补充 N 道（带出处标签）
 *
 * 幂等：content_hash = sha256(question) 唯一约束，重复导入自动跳过。
 * 纪律：无出处标签（provenance）的题目不入库（Spec 27 测试决策）。
 * Postgres-only（2026-10-03 决策）：需要 DATABASE_URL 指向启用了 pgvector 的库。
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import pg from "pg";

const ROOT = process.cwd();
const SEEDS_DIR = path.join(ROOT, "scripts", "question-seeds");

function sha256(text) {
  return crypto.createHash("sha256").update(text, "utf8").digest("hex");
}

const FAMILIES = {
  ai_product: "AI 产品",
  ai_algorithm: "AI 算法",
  tech_general: "通用技术岗",
  ai_business: "AI 业务岗（运营/售前）",
};

const PHASES = { intro: "开场", tech: "技术/专业", behavioral: "行为面", reverse: "反问/文化" };

async function importSeedFiles(pool) {
  if (!fs.existsSync(SEEDS_DIR)) {
    console.log(`种子目录不存在：${SEEDS_DIR}`);
    return { inserted: 0, skipped: 0 };
  }
  let inserted = 0;
  let skipped = 0;
  for (const file of fs.readdirSync(SEEDS_DIR).filter((name) => name.endsWith(".json")).sort()) {
    const payload = JSON.parse(fs.readFileSync(path.join(SEEDS_DIR, file), "utf8"));
    const questions = Array.isArray(payload.questions) ? payload.questions : [];
    for (const q of questions) {
      if (!q.question || !q.provenance) {
        console.warn(`[reject] 无出处标签或缺题干：${file}`);
        skipped += 1;
        continue;
      }
      const hash = sha256(q.question);
      const result = await pool.query(
        `INSERT INTO interview_questions (question, topic, family, phase, difficulty, provenance, provenance_detail, answer_points, content_hash)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         ON CONFLICT (content_hash) DO NOTHING`,
        [q.question, q.topic || "", q.family || "general", q.phase || "tech", q.difficulty || "medium",
         q.provenance, q.provenanceDetail || "", q.answerPoints || "", hash],
      );
      if (result.rowCount > 0) inserted += 1;
      else skipped += 1;
    }
    console.log(`[file] ${file}: 共 ${questions.length} 题`);
  }
  return { inserted, skipped };
}

async function generateForFamily(pool, family, count) {
  const apiKey = process.env.DEEPSEEK_API_KEY?.trim();
  if (!apiKey) throw new Error("未配置 DEEPSEEK_API_KEY，无法 --generate");
  const existing = await pool.query("SELECT question FROM interview_questions WHERE family = $1", [family]);
  const existingQuestions = existing.rows.map((row) => row.question);
  const response = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: "deepseek-flash",
      temperature: 0.8,
      max_tokens: 8000,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: [
            `你是${FAMILIES[family] || family}岗位的资深面试官，为题库补充主问题（不是追问）。`,
            `覆盖四类：behavioral（行为面）、technical（技术/专业）、case-study（案例分析）、culture（文化匹配）， phase 取 tech/behavioral/reverse。`,
            "难度 medium 居多、hard 少量。每题带 topic（考查点一句话）与 answerPoints（好回答的要点，≤80 字）。",
            "严格返回 JSON：{\"questions\":[{\"question\":\"...\",\"topic\":\"...\",\"phase\":\"tech|behavioral|reverse\",\"difficulty\":\"medium|hard\",\"answerPoints\":\"...\"}]}",
          ].join("\n"),
        },
        {
          role: "user",
          content: `生成 ${count} 道新题。以下题目已存在，勿重复：\n${existingQuestions.slice(-40).join("\n") || "（题库为空）"}`,
        },
      ],
    }),
  });
  if (!response.ok) throw new Error(`DeepSeek 生成失败 (${response.status})`);
  const payload = await response.json();
  const parsed = JSON.parse(payload.choices?.[0]?.message?.content || "{}");
  let inserted = 0;
  for (const q of Array.isArray(parsed.questions) ? parsed.questions : []) {
    if (!q.question) continue;
    const hash = sha256(q.question);
    const result = await pool.query(
      `INSERT INTO interview_questions (question, topic, family, phase, difficulty, provenance, provenance_detail, answer_points, content_hash)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT (content_hash) DO NOTHING`,
      [q.question, q.topic || "", family, q.phase || "tech", q.difficulty || "medium",
       "generated_seed", `llm-batch ${new Date().toISOString().slice(0, 10)}`, q.answerPoints || "", hash],
    );
    inserted += result.rowCount > 0 ? 1 : 0;
  }
  return inserted;
}

async function main() {
  const pool = new pg.Pool({ connectionString: (process.env.DATABASE_URL || "").trim() });
  if (!pool.options.connectionString) throw new Error("未配置 DATABASE_URL");
  try {
    const generateIndex = process.argv.indexOf("--generate");
    if (generateIndex > -1) {
      const count = Number(process.argv[generateIndex + 1]) || 20;
      let total = 0;
      for (const family of Object.keys(FAMILIES)) {
        const inserted = await generateForFamily(pool, family, count);
        total += inserted;
        console.log(`[generate] ${family}: +${inserted}`);
      }
      console.log(`生成完成：新增 ${total} 题`);
      return;
    }
    const { inserted, skipped } = await importSeedFiles(pool);
    const total = await pool.query("SELECT family, COUNT(*)::int AS n FROM interview_questions GROUP BY family");
    console.log(`导入完成：新增 ${inserted}，跳过（重复/无标签）${skipped}`);
    console.log("题库现状：", total.rows.map((row) => `${row.family}=${row.n}`).join(", ") || "（空）");
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
