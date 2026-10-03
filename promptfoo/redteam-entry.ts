/**
 * 红队探针（Spec 24）：被测确定性函数的纯导出。
 * 由 scripts/build-redteam-helpers.mjs 打包为 CJS；消费方两处：
 *  - promptfoo/provider.mjs（JS provider，file:// 加载）
 *  - node CLI（临时人工核查用：node -e "require('./promptfoo/.build/redteam-helpers.cjs').probe(...)"）
 */
import { validateResumeSectionContent, type ResumeSectionId } from "../src/lib/agent/resume-save-guard";
import { checkNumberProvenance } from "../src/lib/server/resume-factuality";
import { runDeterministicAtsRules } from "../src/lib/server/ats-rules";

export interface ProbeArgs {
  section?: string;
  content?: string;
  sources?: string[];
  cvText?: string;
}

export function probe(fn: string, args: ProbeArgs): unknown {
  switch (fn) {
    case "saveGuard": {
      const section = (args.section || "experience") as ResumeSectionId;
      const result = validateResumeSectionContent(section, String(args.content || ""));
      return { blocked: !result.valid, reason: result.reason || "" };
    }
    case "numberProvenance": {
      const sources = Array.isArray(args.sources) ? args.sources : [];
      const result = checkNumberProvenance(String(args.content || ""), sources);
      return { ok: result.ok, violations: result.violations.map((v) => v.token) };
    }
    case "atsRules":
      return { issues: runDeterministicAtsRules({ cvText: String(args.cvText || "") }) };
    default:
      throw new Error(`unknown fn: ${fn}`);
  }
}
