type AnyRow = Record<string, unknown>;

function normalizeMonthlySalaryK(value: unknown): number {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return 0;
  return n >= 1000 ? Math.round((n / 1000) * 10) / 10 : n;
}

function numberValue(value: unknown, fallback = 0): number {
  const n = Number(value ?? fallback);
  return Number.isFinite(n) ? n : fallback;
}

function nullableNumberMatches(actual: unknown, expected: unknown): boolean {
  if (expected === undefined || expected === null || expected === "") {
    return actual === undefined || actual === null || actual === "";
  }
  return numberValue(actual) === numberValue(expected);
}

function textValue(value: unknown): string {
  return value === undefined || value === null ? "" : String(value);
}

function boolValue(value: unknown): boolean {
  return value === true || value === 1 || value === "1" || value === "true";
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJson);
  if (!value || typeof value !== "object") return value;
  return Object.keys(value as Record<string, unknown>)
    .sort()
    .reduce<Record<string, unknown>>((next, key) => {
      next[key] = sortJson((value as Record<string, unknown>)[key]);
      return next;
    }, {});
}

function canonicalJson(value: unknown, fallback: unknown): string {
  let parsed = value;
  if (parsed === undefined || parsed === null || parsed === "") parsed = fallback;
  if (typeof parsed === "string") {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      parsed = fallback;
    }
  }
  return JSON.stringify(sortJson(parsed));
}

export function offerReadBackMatches(row: AnyRow | undefined, input: AnyRow, expectedId?: number): boolean {
  if (!row) return false;
  if (expectedId !== undefined && Number(row.id) !== Number(expectedId)) return false;

  const expected = {
    company: textValue(input.company).trim(),
    role: textValue(input.role).trim(),
    monthly_salary: normalizeMonthlySalaryK(input.monthly_salary),
    months_per_year: numberValue(input.months_per_year, 12),
    annual_bonus: numberValue(input.annual_bonus, 0),
    has_social_insurance: input.has_social_insurance !== false,
    housing_fund_rate: numberValue(input.housing_fund_rate, 7),
    options: input.options ?? null,
    probation_months: numberValue(input.probation_months, 3),
    start_date: input.start_date ?? null,
    other_benefits: input.other_benefits ?? null,
    location: input.location ?? null,
    level: input.level ?? null,
    employment_form: input.employment_form ?? "unknown",
    employer_name: input.employer_name ?? null,
    contract_months: input.contract_months ?? null,
    overtime_policy: input.overtime_policy ?? "unknown",
    bonus_guarantee: input.bonus_guarantee ?? "unknown",
    equity_type: input.equity_type ?? null,
    equity_vesting: input.equity_vesting ?? null,
    commute_minutes: input.commute_minutes ?? null,
    city_cost_level: input.city_cost_level ?? "unknown",
    job_nature: input.job_nature ?? null,
    benefits_json: input.benefits ?? input.benefits_json ?? {},
    application_id: input.application_id ?? null,
  };

  return (
    textValue(row.company) === expected.company &&
    textValue(row.role) === expected.role &&
    numberValue(row.monthly_salary) === expected.monthly_salary &&
    numberValue(row.months_per_year) === expected.months_per_year &&
    numberValue(row.annual_bonus) === expected.annual_bonus &&
    boolValue(row.has_social_insurance) === expected.has_social_insurance &&
    numberValue(row.housing_fund_rate) === expected.housing_fund_rate &&
    textValue(row.options) === textValue(expected.options) &&
    numberValue(row.probation_months) === expected.probation_months &&
    textValue(row.start_date) === textValue(expected.start_date) &&
    textValue(row.other_benefits) === textValue(expected.other_benefits) &&
    textValue(row.location) === textValue(expected.location) &&
    textValue(row.level) === textValue(expected.level) &&
    textValue(row.employment_form) === textValue(expected.employment_form) &&
    textValue(row.employer_name) === textValue(expected.employer_name) &&
    nullableNumberMatches(row.contract_months, expected.contract_months) &&
    textValue(row.overtime_policy) === textValue(expected.overtime_policy) &&
    textValue(row.bonus_guarantee) === textValue(expected.bonus_guarantee) &&
    textValue(row.equity_type) === textValue(expected.equity_type) &&
    textValue(row.equity_vesting) === textValue(expected.equity_vesting) &&
    nullableNumberMatches(row.commute_minutes, expected.commute_minutes) &&
    textValue(row.city_cost_level) === textValue(expected.city_cost_level) &&
    textValue(row.job_nature) === textValue(expected.job_nature) &&
    canonicalJson(row.benefits_json, {}) === canonicalJson(expected.benefits_json, {}) &&
    nullableNumberMatches(row.application_id, expected.application_id)
  );
}

export function offerReportReadBackMatches(row: AnyRow | undefined, input: AnyRow, expectedId?: number): boolean {
  if (!row) return false;
  if (expectedId !== undefined && Number(row.id) !== Number(expectedId)) return false;

  const expected = {
    title: input.title || "Offer report",
    report_type: input.report_type || "comparison",
    model_version: input.model_version || "",
    offer_id: input.offer_id ?? null,
    overall_score: input.overall_score ?? 0,
    verdict: input.verdict || "",
    summary: input.summary || "",
    offer_snapshot_json: input.offer_snapshot_json ?? input.offer_snapshot ?? {},
    modules_json: input.modules_json ?? [],
    red_flags_json: input.red_flags_json ?? [],
    missing_info_json: input.missing_info_json ?? [],
    negotiation_levers_json: input.negotiation_levers_json ?? [],
    hr_questions_json: input.hr_questions_json ?? [],
    assumptions_json: input.assumptions_json ?? [],
    take_home_json: input.take_home_json ?? {},
    offers_json: input.offers_json ?? [],
    report_markdown: input.report_markdown || "",
    num_offers: input.num_offers ?? 0,
  };

  return (
    textValue(row.title) === textValue(expected.title) &&
    textValue(row.report_type) === textValue(expected.report_type) &&
    textValue(row.model_version) === textValue(expected.model_version) &&
    nullableNumberMatches(row.offer_id, expected.offer_id) &&
    numberValue(row.overall_score) === numberValue(expected.overall_score) &&
    textValue(row.verdict) === textValue(expected.verdict) &&
    textValue(row.summary) === textValue(expected.summary) &&
    canonicalJson(row.offer_snapshot_json, {}) === canonicalJson(expected.offer_snapshot_json, {}) &&
    canonicalJson(row.modules_json, []) === canonicalJson(expected.modules_json, []) &&
    canonicalJson(row.red_flags_json, []) === canonicalJson(expected.red_flags_json, []) &&
    canonicalJson(row.missing_info_json, []) === canonicalJson(expected.missing_info_json, []) &&
    canonicalJson(row.negotiation_levers_json, []) === canonicalJson(expected.negotiation_levers_json, []) &&
    canonicalJson(row.hr_questions_json, []) === canonicalJson(expected.hr_questions_json, []) &&
    canonicalJson(row.assumptions_json, []) === canonicalJson(expected.assumptions_json, []) &&
    canonicalJson(row.take_home_json, {}) === canonicalJson(expected.take_home_json, {}) &&
    canonicalJson(row.offers_json, []) === canonicalJson(expected.offers_json, []) &&
    textValue(row.report_markdown) === textValue(expected.report_markdown) &&
    numberValue(row.num_offers) === numberValue(expected.num_offers)
  );
}

export function offerLatestReportMatches(offerRow: AnyRow | undefined, reportId: number): boolean {
  return !!offerRow && Number(offerRow.latest_report_id || 0) === Number(reportId);
}
