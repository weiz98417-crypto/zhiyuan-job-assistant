/** 截断修复解析器的单元测试（eng review 后新增的 llm-json 容错；spec 32 补收口基线与数组容忍）。 */
import { describe, expect, it } from "vitest";
import { parseLlmJsonObject, parseLlmJsonValue, extractLlmJsonText } from "@/lib/llm-json";

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

  it("spec 32 收口基线：import-reference 四种历史畸形输入形态均有兜底", () => {
    const sections = [{ heading: "工作经历", content: "负责 X" }];
    // ① 围栏包裹
    expect(parseLlmJsonObject('```json\n{"sections":' + JSON.stringify(sections) + "}\n```")).toMatchObject({ sections });
    // ② 截断（尾部被切）
    const truncated = '{"sections":[{"heading":"工作经历","content":"负';
    expect(parseLlmJsonObject(truncated)).toMatchObject({ sections: [{ heading: "工作经历" }] });
    // ③ 裸括号（前后有杂质文本）
    expect(parseLlmJsonObject('好的,以下是结果: {"sections":' + JSON.stringify(sections) + "} 请查收")).toMatchObject({ sections });
    // ④ sections 形态（对象含 sections 数组,无围栏）
    expect(parseLlmJsonObject('{"sections":' + JSON.stringify(sections) + "}")).toMatchObject({ sections });
  });
});

describe("llm-json 顶层数组容忍（parseLlmJsonValue,spec 32 增量）", () => {
  it("顶层数组直通(parseLlmJsonObject 对数组返回 null,行为不变)", () => {
    expect(parseLlmJsonObject('["a","b"]')).toBeNull();
    expect(parseLlmJsonValue('["a","b"]')).toEqual(["a", "b"]);
  });

  it("标签内截断数组:修复 A 回退到最后完整成员", () => {
    const truncated = '["第一条完整","第二条完整","第三条被切';
    const result = parseLlmJsonValue(truncated);
    expect(result).toEqual(["第一条完整", "第二条完整"]);
  });

  it("围栏包裹数组直通", () => {
    expect(parseLlmJsonValue('```\n["x"]\n```')).toEqual(["x"]);
  });

  it("对象形态仍然返回对象(与 parseLlmJsonObject 一致)", () => {
    expect(parseLlmJsonValue('{"items":[1]}')).toEqual({ items: [1] });
  });

  it("彻底不可解析 → null", () => {
    expect(parseLlmJsonValue("没有数组也没有对象")).toBeNull();
  });
});
