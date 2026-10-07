/**
 * 红队探针（Spec 24）：被测确定性函数的纯导出。
 * 由 scripts/build-redteam-helpers.mjs 打包为 CJS；消费方两处：
 *  - promptfoo/provider.mjs（JS provider，file:// 加载）
 *  - node CLI（临时人工核查用：node -e "require('./promptfoo/.build/redteam-helpers.cjs').probe(...)"）
 */
import { validateResumeSectionContent, type ResumeSectionId } from "../src/lib/agent/resume-save-guard";
import { checkNumberProvenance, filterSectionsByProvenance } from "../src/lib/server/resume-factuality";
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
    case "generationProvenance": {
      // spec 31：生成链硬门入口（filterSectionsByProvenance）——编造数字 section 必须被淘汰
      const sources = Array.isArray(args.sources) ? args.sources : [];
      const sections = [{ id: "experience", label: "定制版", content: String(args.content || "") }];
      const result = filterSectionsByProvenance(sections, sources);
      return { passed: result.passing.length > 0, dropped: sections.length - result.passing.length };
    }
    case "atsRules":
      return { issues: runDeterministicAtsRules({ cvText: String(args.cvText || "") }) };
    default:
      throw new Error(`unknown fn: ${fn}`);
  }
}
