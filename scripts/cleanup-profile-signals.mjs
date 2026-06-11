import dotenv from "dotenv";

dotenv.config();
dotenv.config({ path: ".env.local", override: true });

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

const DEALBREAKER_DIRECT_TERMS = new Set([
  "996",
  "007",
  "大小周",
  "外包",
  "驻场",
  "派遣",
  "加班",
  "双休",
  "单休",
  "社保",
  "五险一金",
  "公积金",
  "年假",
  "远程",
  "在家办公",
  "补充医疗",
  "体检",
  "期权",
  "股票",
  "13薪",
  "14薪",
  "15薪",
  "16薪",
  "outsourcing",
  "contractor",
  "staffing",
  "vendor",
  "onsite",
  "remote",
  "relocation",
]);

const DEALBREAKER_NOISE_TERMS = new Set([
  "去寻",
  "先解",
  "野蛮",
  "拒绝",
  "不去",
  "不要",
  "不考虑",
  "不接受",
  "此Offer",
  "此 Offer",
]);

const DEALBREAKER_ACTION_NOISE_PATTERNS = [
  /拒绝此\s*Offer/i,
  /接受此\s*Offer/i,
  /点击|按钮|重新|上传|截图|识别|调用|工具|返回错误|拉取失败/,
];

const DEALBREAKER_PREFIX_PATTERN =
  /(?:不接受|不考虑|排斥|拒绝|不去|不要|坚决不|绝对不|必须|一定|得有|要有|需要|要求|只要)/;

const DEALBREAKER_CAREER_KEYWORDS =
  /(996|007|大小周|外包|驻场|派遣|加班|双休|单休|社保|五险|公积金|薪资|工资|降薪|年假|调休|远程|办公|通勤|城市|地点|出差|试用|合同|背调|裁员|公司|岗位|行业|职级|歧视|学历|年龄|绩效|KPI|OKR|画饼|PUA|违法|拖欠|报销|管理混乱|野蛮管理|outsourcing|contractor|staffing|vendor|onsite|remote|relocation|commute|salary|benefit)/i;

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
  return String(value || "")
    .replace(/\s+/g, " ")
    .replace(/[“”"'`]/g, "")
    .replace(/^[,，。；;:：、\-—\s]+|[,，。；;:：、\-—\s]+$/g, "")
    .trim();
}

function shouldRejectSkill(content) {
  if (content.status === "confirmed") return false;
  const skill = cleanText(content.skill || content.name);
  const evidence = cleanText(content.evidence || content.quote || content.text);
  if (!skill || skill.length < 2 || skill.length > 24) return true;
  if (BAD_SKILL_WORDS.has(skill)) return true;
  if (BAD_PATTERNS.some((pattern) => pattern.test(skill) || pattern.test(evidence))) return true;
  if (!SELF_EVIDENCE.test(evidence)) return true;
  return false;
}

function cleanDealBreakerText(value) {
  return cleanText(value)
    .replace(/[()[\]{}<>]/g, "")
    .replace(/[👉👈✅❌]/g, "")
    .replace(/\s*[,，、]\s*/g, "、")
    .replace(/^[。；;:：、\s]+|[。；;:：、\s]+$/g, "")
    .trim();
}

function normalizeDealBreaker(value, evidence = value) {
  const raw = typeof value === "string" ? cleanDealBreakerText(value) : "";
  const evidenceText = typeof evidence === "string" ? cleanDealBreakerText(evidence) : raw;
  const compactValue = raw.replace(/\s+/g, "");

  if (!raw || raw.length < 2 || raw.length > 60) return null;
  if (DEALBREAKER_NOISE_TERMS.has(raw) || DEALBREAKER_NOISE_TERMS.has(compactValue)) return null;
  if (DEALBREAKER_ACTION_NOISE_PATTERNS.some((pattern) => pattern.test(raw) || pattern.test(evidenceText))) {
    return null;
  }
  if (/^[去先此那这请帮看发传点开关解][\u4e00-\u9fff]$/.test(raw)) return null;

  const direct = DEALBREAKER_DIRECT_TERMS.has(raw) || DEALBREAKER_DIRECT_TERMS.has(compactValue);
  const hasCareerKeyword = DEALBREAKER_CAREER_KEYWORDS.test(raw);
  const hasExplicitConstraint = DEALBREAKER_PREFIX_PATTERN.test(raw) || DEALBREAKER_PREFIX_PATTERN.test(evidenceText);

  if (/^[\u4e00-\u9fff]{2}$/.test(raw) && !direct) return null;
  if (!direct && !hasCareerKeyword) return null;
  if (!direct && !hasExplicitConstraint && raw.length < 4) return null;
  return raw;
}

function sanitizeDealBreakers(values) {
  const unique = new Set();
  for (const value of values || []) {
    const normalized = normalizeDealBreaker(value);
    if (normalized) unique.add(normalized);
  }
  const sorted = Array.from(unique).sort((a, b) => b.length - a.length);
  const result = [];
  for (const value of sorted) {
    if (!result.some((existing) => existing.includes(value))) result.push(value);
  }
  return result;
}

function shouldRejectDealBreaker(content) {
  if (content.status === "confirmed") return false;
  return normalizeDealBreaker(content.value, content.evidence || content.value) === null;
}

function rejectedContent(content, reason) {
  return JSON.stringify({
    ...content,
    status: "rejected",
    rejectionReason: reason,
    rejectedAt: new Date().toISOString(),
  });
}

async function runSqlite() {
  const Database = (await import("better-sqlite3")).default;
  const path = await import("node:path");
  const dbPath = process.env.SQLITE_PATH || path.join(process.cwd(), "data", "zhiyuan.db");
  const db = new Database(dbPath);
  const skillRows = db.prepare("SELECT id, content_json FROM profile_signals WHERE signal_type = 'skill_claim'").all();
  const breakerRows = db.prepare("SELECT id, content_json FROM profile_signals WHERE signal_type = 'dealbreaker'").all();
  const profileRows = db.prepare("SELECT user_id, goals_json FROM profiles").all();
  const updateSignal = db.prepare("UPDATE profile_signals SET content_json = ? WHERE id = ?");
  const updateProfile = db.prepare("UPDATE profiles SET goals_json = ?, last_updated = datetime('now') WHERE user_id = ?");
  const result = { scannedSkills: skillRows.length, rejectedSkills: 0, scannedBreakers: breakerRows.length, rejectedBreakers: 0, cleanedProfiles: 0 };

  const tx = db.transaction(() => {
    for (const row of skillRows) {
      const content = parseJson(row.content_json);
      if (!shouldRejectSkill(content)) continue;
      updateSignal.run(rejectedContent(content, "cleanup_low_quality_profile_skill"), row.id);
      result.rejectedSkills++;
    }
    for (const row of breakerRows) {
      const content = parseJson(row.content_json);
      if (!shouldRejectDealBreaker(content)) continue;
      updateSignal.run(rejectedContent(content, "cleanup_low_quality_profile_dealbreaker"), row.id);
      result.rejectedBreakers++;
    }
    for (const row of profileRows) {
      const goals = parseJson(row.goals_json);
      if (!Array.isArray(goals.dealBreakers)) continue;
      const cleaned = sanitizeDealBreakers(goals.dealBreakers);
      if (JSON.stringify(cleaned) === JSON.stringify(goals.dealBreakers)) continue;
      const nextGoals = { ...goals };
      if (cleaned.length > 0) nextGoals.dealBreakers = cleaned;
      else delete nextGoals.dealBreakers;
      updateProfile.run(JSON.stringify(nextGoals), row.user_id);
      result.cleanedProfiles++;
    }
  });
  tx();
  db.close();
  return result;
}

async function runPostgres() {
  const { Client } = await import("pg");
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  const skillRows = (await client.query("SELECT id, content_json FROM profile_signals WHERE signal_type = 'skill_claim'")).rows;
  const breakerRows = (await client.query("SELECT id, content_json FROM profile_signals WHERE signal_type = 'dealbreaker'")).rows;
  const profileRows = (await client.query("SELECT user_id, goals_json FROM profiles")).rows;
  const result = { scannedSkills: skillRows.length, rejectedSkills: 0, scannedBreakers: breakerRows.length, rejectedBreakers: 0, cleanedProfiles: 0 };

  for (const row of skillRows) {
    const content = parseJson(row.content_json);
    if (!shouldRejectSkill(content)) continue;
    await client.query(
      "UPDATE profile_signals SET content_json = $1::jsonb WHERE id = $2",
      [rejectedContent(content, "cleanup_low_quality_profile_skill"), row.id],
    );
    result.rejectedSkills++;
  }

  for (const row of breakerRows) {
    const content = parseJson(row.content_json);
    if (!shouldRejectDealBreaker(content)) continue;
    await client.query(
      "UPDATE profile_signals SET content_json = $1::jsonb WHERE id = $2",
      [rejectedContent(content, "cleanup_low_quality_profile_dealbreaker"), row.id],
    );
    result.rejectedBreakers++;
  }

  for (const row of profileRows) {
    const goals = parseJson(row.goals_json);
    if (!Array.isArray(goals.dealBreakers)) continue;
    const cleaned = sanitizeDealBreakers(goals.dealBreakers);
    if (JSON.stringify(cleaned) === JSON.stringify(goals.dealBreakers)) continue;
    const nextGoals = { ...goals };
    if (cleaned.length > 0) nextGoals.dealBreakers = cleaned;
    else delete nextGoals.dealBreakers;
    await client.query(
      "UPDATE profiles SET goals_json = $1::jsonb, last_updated = now() WHERE user_id = $2",
      [JSON.stringify(nextGoals), row.user_id],
    );
    result.cleanedProfiles++;
  }

  await client.end();
  return result;
}

const driver = (process.env.DB_DRIVER || "").toLowerCase();
const result = driver === "postgres" && process.env.DATABASE_URL
  ? await runPostgres()
  : await runSqlite();

console.log(
  `profile signal cleanup complete: ` +
  `skills=${result.rejectedSkills}/${result.scannedSkills}, ` +
  `dealbreakers=${result.rejectedBreakers}/${result.scannedBreakers}, ` +
  `profiles=${result.cleanedProfiles}`,
);
