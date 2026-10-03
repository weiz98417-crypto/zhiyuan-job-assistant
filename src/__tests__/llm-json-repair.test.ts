/** 截断修复解析器的单元测试（eng review 后新增的 llm-json 容错）。 */
import { describe, expect, it } from "vitest";
import { parseLlmJsonObject, extractLlmJsonText } from "@/lib/llm-json";

describe("llm-json 截断修复", () => {
  it("正常 JSON 直通", () => {
    expect(parseLlmJsonObject('{"a":1}')).toEqual({ a: 1 });
  });

  it("markdown 围栏包裹直通", () => {
    expect(parseLlmJsonObject('```json\n{"a":"x"}\n```')).toEqual({ a: "x" });
  });

  it("max_tokens 截断：尾部字符串被切 → 回退到上一个完整成员", () => {
    const truncated = '{"bands":{"structure":3,"specificity":2},"evidence":{"structure":"引';
    const result = parseLlmJsonObject(truncated);
    expect(result).toBeTruthy();
    expect((result as { bands?: { structure?: number } }).bands?.structure).toBe(3);
  });

  it("截断：按未闭合深度补尾", () => {
    expect(parseLlmJsonObject('{"a":"文本"}]'.replace("]", ""))).toEqual({ a: "文本" });
    expect(parseLlmJsonObject('{"list":["x","y"')).toEqual({ list: ["x", "y"] });
  });

  it("彻底不可解析 → null", () => {
    expect(parseLlmJsonObject("这不是JSON")).toBeNull();
  });

  it("extractLlmJsonText：无 JSON 返回 null", () => {
    expect(extractLlmJsonText("完全没有结构化内容")).toBeNull();
  });
});
