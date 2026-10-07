#!/usr/bin/env node
/**
 * Spec 27：题库种子脚本（幂等）。
 *
 * 三种用法：
 *   node scripts/seed-question-bank.mjs                       # 导入 scripts/question-seeds/*.json 内置种子
 *   node scripts/seed-question-bank.mjs --generate 20        # 调 DeepSeek 为每个 family 补充 N 道（带出处标签），直写 DB
 *   node scripts/seed-question-bank.mjs --out                 # 无 DB 生成模式：DeepSeek 生成 → 落 JSON 种子文件（本地无 Postgres 时用）
 *
 * --out 目标量（Spec 27）：一级岗位族 150+，二级 60+；生成文件落 scripts/question-seeds/gen-*.json，
 * 之后在有 DATABASE_URL 的机器上跑一次无参导入即入库。
 *
 * 幂等：content_hash = sha256(question) 唯一约束，重复导入自动跳过。
 * 纪律：无出处标签（provenance）的题目不入库（Spec 27 测试决策）。
 * Postgres-only（2026-10-03 决策）：需要 DATABASE_URL 指向启用了 pgvector 的库。
 * 运行注意：脚本不自动加载 .env——用 `node --env-file=.env scripts/seed-question-bank.mjs`。
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

/** 一级岗位族做深（150-200），二级扩展（50-80）——2026-10B Q2 决策 */
const FAMILY_TARGETS = {
  ai_product: 160,
  ai_algorithm: 160,
  tech_general: 70,
  ai_business: 70,
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

/** 收集既有题干（手写种子 + 已生成文件），供生成时的防重 prompt 与本地去重。 */
function collectExistingQuestions(family) {
  const questions = [];
  if (!fs.existsSync(SEEDS_DIR)) return questions;
  for (const file of fs.readdirSync(SEEDS_DIR).filter((name) => name.endsWith(".json")).sort()) {
    try {
      const payload = JSON.parse(fs.readFileSync(path.join(SEEDS_DIR, file), "utf8"));
      if (payload.family && payload.family !== family) continue;
      for (const q of Array.isArray(payload.questions) ? payload.questions : []) {
        if (q.question) questions.push(q.question);
      }
    } catch { /* 坏文件跳过 */ }
  }
  return questions;
}

/** 从模型响应提取合法题目（带 topic；去重；字段截断）。 */
function extractValidQuestions(parsed, family, existingSet, out) {
  const valid = [];
  for (const q of Array.isArray(parsed?.questions) ? parsed.questions : []) {
    const question = String(q.question || "").trim();
    if (!question) continue;
    const hash = sha256(question);
    if (existingSet.has(hash)) continue;
    existingSet.add(hash);
    valid.push({
      question: question.slice(0, 500),
      topic: String(q.topic || "").slice(0, 200),
      phase: ["tech", "behavioral", "reverse"].includes(q.phase) ? q.phase : "tech",
      difficulty: ["easy", "medium", "hard"].includes(q.difficulty) ? q.difficulty : "medium",
      answerPoints: String(q.answerPoints || "").slice(0, 300),
    });
    out.push(valid[valid.length - 1]);
  }
  return valid;
}

/** --out 模式：无 DB，生成 → scripts/question-seeds/gen-<family>-<date>.json（可重复跑累积）。 */
async function generateToFile() {
  const apiKey = process.env.DEEPSEEK_API_KEY?.trim();
  if (!apiKey) throw new Error("未配置 DEEPSEEK_API_KEY（用 node --env-file=.env 运行）");
  const date = new Date().toISOString().slice(0, 10);
  for (const [family, target] of Object.entries(FAMILY_TARGETS)) {
    const existingSet = new Set();
    const outFile = path.join(SEEDS_DIR, `gen-${family}-${date}.json`);
    const out = [];
    if (fs.existsSync(outFile)) {
      const prior = JSON.parse(fs.readFileSync(outFile, "utf8"));
      for (const q of Array.isArray(prior.questions) ? prior.questions : []) {
        out.push(q);
        existingSet.add(sha256(q.question));
      }
    }
    // 收集既有题干时排除本次 out 文件已计入的题——否则 gen 文件被数两遍，target 判断虚高（实测 bug）
    const existingQuestions = collectExistingQuestions(family)
      .filter((question) => !out.some((o) => o.question === question));
    for (const question of existingQuestions) existingSet.add(sha256(question));
    const have = existingQuestions.length + out.length;
    // DeepSeek 单响应输出上限 8K tokens：每批 12 题留足余量（30 题实测必截断 JSON）
    const BATCH = 12;
    const rounds = Math.min(16, Math.ceil(Math.max(0, target - have) / BATCH));
    console.log(`[${family}] 现有 ${have} 题，目标 ${target}，本轮 ${rounds} 批 × ${BATCH} 题`);
    for (let round = 0; round < rounds; round += 1) {
      let generated = await generateQuestionsViaAPI(apiKey, family, BATCH, [...existingQuestions, ...out.map((q) => q.question)]);
      if (!Array.isArray(generated?.questions) || generated.questions.length === 0) {
        // 截断/解析失败自动重试一次（同批）
        console.warn("  批解析为空，重试一次");
        generated = await generateQuestionsViaAPI(apiKey, family, BATCH, [...existingQuestions, ...out.map((q) => q.question)]);
      }
      const before = out.length;
      extractValidQuestions(generated, family, existingSet, out);
      console.log(`  批 ${round + 1}/${rounds}: +${out.length - before} 有效（累计 ${existingQuestions.length + out.length}）`);
      if (out.length + existingQuestions.length >= target) break;
      // 每批落盘一次——中断不丢进度
      fs.writeFileSync(outFile, JSON.stringify({
        family,
        provenance: "generated_seed",
        provenanceDetail: `llm-batch ${date} (--out mode)`,
        questions: out,
      }, null, 2) + "\n");
    }
    fs.writeFileSync(outFile, JSON.stringify({
      family,
      provenance: "generated_seed",
      provenanceDetail: `llm-batch ${date} (--out mode)`,
      questions: out,
    }, null, 2) + "\n");
    console.log(`[${family}] 落盘 ${out.length} 题 → ${path.relative(ROOT, outFile)}`);
  }
  console.log("\n完成。在有 DATABASE_URL 的机器上运行无参导入：node scripts/seed-question-bank.mjs");
}

/** 直连 API 的生成（与 generateForFamily 共用 prompt 结构）。 */
async function generateQuestionsViaAPI(apiKey, family, count, existingQuestions) {
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
            "题目必须具体可答、贴合真实面试场景；禁止与已有题目语义重复。",
            "严格返回 JSON：{\"questions\":[{\"question\":\"...\",\"topic\":\"...\",\"phase\":\"tech|behavioral|reverse\",\"difficulty\":\"medium|hard\",\"answerPoints\":\"...\"}]}",
          ].join("\n"),
        },
        {
          role: "user",
          content: `生成 ${count} 道新题。以下题目已存在，勿重复（含语义重复）：\n${existingQuestions.slice(-60).join("\n") || "（题库为空）"}`,
        },
      ],
    }),
  });
  if (!response.ok) throw new Error(`DeepSeek 生成失败 (${response.status})`);
  const payload = await response.json();
  try {
    return JSON.parse(payload.choices?.[0]?.message?.content || "{}");
  } catch (error) {
    console.warn(`  [warn] 单批 JSON 解析失败，跳过该批: ${error instanceof Error ? error.message : error}`);
    return { questions: [] };
  }
}

async function main() {
  if (process.argv.includes("--out")) {
    await generateToFile();
    return;
  }
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
