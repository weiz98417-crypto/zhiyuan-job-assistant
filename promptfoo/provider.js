/**
 * promptfoo JS provider（Spec 24，CJS 类形态——promptfoo 对 file:// provider 的标准加载方式）。
 * 被测函数来自 scripts/build-redteam-helpers.mjs 打包的 CJS 产物（.build/redteam-helpers.cjs）。
 * call 返回 JSON 字符串，供断言 JSON.parse(output) 使用。
 */
class ResumeGuardsProvider {
  id() {
    return "resume-guards";
  }

  async callApi(prompt, context) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { probe } = require("./.build/redteam-helpers.cjs");
    const vars = (context && context.vars) || {};
    try {
      // promptfoo 对 YAML 数组 var 的传递形态不稳定（数组或整体字符串都有），做归一
      const rawSources = vars.sources;
      const sources = Array.isArray(rawSources)
        ? rawSources.map(String)
        : rawSources
          ? [String(rawSources)]
          : [];
      const result = probe(String(vars.fn || ""), {
        content: prompt,
        cvText: prompt,
        sources,
        section: vars.section,
      });
      return { output: JSON.stringify(result) };
    } catch (error) {
      return { output: JSON.stringify({ error: error instanceof Error ? error.message : String(error) }) };
    }
  }
}

module.exports = ResumeGuardsProvider;
