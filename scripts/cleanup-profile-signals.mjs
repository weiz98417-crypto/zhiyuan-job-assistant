import dotenv from "dotenv";

dotenv.config();

const BAD_SKILL_WORDS = new Set([
  "业务",
  "技术",
  "能力",
  "经验",
  "项目",
  "系统",
  "平台",
  "方案",
  "流程",
  "团队",
  "复杂系统",
  "协调能力",
  "沟通能力",
  "的技术方案",
  "灵性",
]);

const BAD_PATTERNS = [
  /^的/,
  /过至少\d*/,
  /其中至少/,
  /至少\d*/,
  /\d+\s*年以上/,
  /任职要求/,
  /岗位要求/,
  /职位描述/,
  /岗位职责/,
  /优先/,
  /下午茶/,
  /带你直接进入/,
  /请描述/,
  /整体流程/,
  /入职后如果/,
  /为什么欺骗我/,
  /我们既是帮助模型/,
  /不断提升数据/,
];

const SELF_EVIDENCE = /(我|本人|我的|自己|简历|项目中|实习|工作中|曾|负责|主导|参与|搭建|开发|设计|落地|优化|使用|熟悉|掌握|做过)/;

function parseJson(value) {
  if (!value) return {};
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

function cleanText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function shouldReject(content) {
  if (content.status === "confirmed") return false;
  const skill = cleanText(content.skill || content.name);
  const evidence = cleanText(content.evidence || content.quote || content.text);
  if (!skill || skill.length < 2 || skill.length > 24) return true;
  if (BAD_SKILL_WORDS.has(skill)) return true;
  if (BAD_PATTERNS.some((pattern) => pattern.test(skill) || pattern.test(evidence))) return true;
  if (!SELF_EVIDENCE.test(evidence)) return true;
  return false;
}

async function runSqlite() {
  const Database = (await import("better-sqlite3")).default;
  const path = await import("node:path");
  const dbPath = process.env.SQLITE_PATH || path.join(process.cwd(), "data", "zhiyuan.db");
  const db = new Database(dbPath);
  const rows = db.prepare("SELECT id, content_json FROM profile_signals WHERE signal_type = 'skill_claim'").all();
  const update = db.prepare("UPDATE profile_signals SET content_json = ? WHERE id = ?");
  let changed = 0;
  const tx = db.transaction(() => {
    for (const row of rows) {
      const content = parseJson(row.content_json);
      if (!shouldReject(content)) continue;
      update.run(JSON.stringify({
        ...content,
        status: "rejected",
        rejectionReason: "cleanup_low_quality_profile_signal",
        rejectedAt: new Date().toISOString(),
      }), row.id);
      changed++;
    }
  });
  tx();
  db.close();
  return { scanned: rows.length, changed };
}

async function runPostgres() {
  const { Client } = await import("pg");
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  const result = await client.query("SELECT id, content_json FROM profile_signals WHERE signal_type = 'skill_claim'");
  let changed = 0;
  for (const row of result.rows) {
    const content = parseJson(row.content_json);
    if (!shouldReject(content)) continue;
    await client.query(
      "UPDATE profile_signals SET content_json = $1::jsonb WHERE id = $2",
      [JSON.stringify({
        ...content,
        status: "rejected",
        rejectionReason: "cleanup_low_quality_profile_signal",
        rejectedAt: new Date().toISOString(),
      }), row.id],
    );
    changed++;
  }
  await client.end();
  return { scanned: result.rows.length, changed };
}

const driver = (process.env.DB_DRIVER || "").toLowerCase();
const result = driver === "postgres" && process.env.DATABASE_URL
  ? await runPostgres()
  : await runSqlite();

console.log(`profile signal cleanup complete: scanned=${result.scanned}, rejected=${result.changed}`);
