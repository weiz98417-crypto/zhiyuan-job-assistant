/**
 * 红队探针入口（Spec 24）：把被测的确定性函数暴露给 promptfoo exec provider。
 * 由 scripts/build-redteam-helpers.mjs 打包为 CJS。
 */
import { validateResumeSectionContent, type ResumeSectionId } from "../src/lib/agent/resume-save-guard";
import { checkNumberProvenance } from "../src/lib/server/resume-factuality";
import { runDeterministicAtsRules } from "../src/lib/server/ats-rules";

interface ProbeArgs {
  section?: string;
  content?: string;
  sources?: string[];
  cvText?: string;
}

const handlers: Record<string, (args: ProbeArgs) => unknown> = {
  saveGuard(args) {
    const section = (args.section || "experience") as ResumeSectionId;
    const result = validateResumeSectionContent(section, String(args.content || ""));
    return { blocked: !result.valid, reason: result.reason || "" };
  },
  numberProvenance(args) {
    const sources = Array.isArray(args.sources) ? args.sources : [];
    const result = checkNumberProvenance(String(args.content || ""), sources);
    return { ok: result.ok, violations: result.violations.map((v) => v.token) };
  },
  atsRules(args) {
    return { issues: runDeterministicAtsRules({ cvText: String(args.cvText || "") }) };
  },
};

const input = JSON.parse(process.argv[2] || process.env.REDTEAM_INPUT || "{}") as ProbeArgs & { fn?: string };
const handler = input.fn ? handlers[input.fn] : undefined;
if (!handler) {
  console.error(JSON.stringify({ error: `unknown fn: ${input.fn}` }));
  process.exit(1);
}
console.log(JSON.stringify(handler(input)));
