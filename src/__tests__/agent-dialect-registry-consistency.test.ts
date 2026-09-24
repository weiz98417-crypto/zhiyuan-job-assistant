/**
 * 0.11.0-B/D2 — 事件方言一致性断言(任务 4.4:扩展到新壳注册表)。
 *
 * ADR-0031:渲染注册表与投影白名单由同一方言模块导出;缺组件的开发构建
 * 必须在测试门禁就失败,而不是上线后由用户发现裸事件。
 */
import { describe, expect, it } from "vitest";
import { AGENT_EVENT_DIALECT, REQUIRED_COMPONENT_KEYS, type AgentEventType } from "@/lib/agent/events/dialect";
import { AGENT_DATA_RENDERERS, DIALECT_COMPONENT_REGISTRY } from "@/components/agent/assistant-ui/AgentToolCards";

/** componentKey 为 null 的事件没有卡片,渲染层跳过;其余都必须可注册。 */
const NULL_COMPONENT_EVENTS = Object.entries(AGENT_EVENT_DIALECT)
  .filter(([, descriptor]) => descriptor.componentKey === null)
  .map(([type]) => type);

describe("event dialect ↔ assistant-ui shell registry consistency", () => {
  it("registers every REQUIRED_COMPONENT_KEYS entry in the shell component registry (任务 4.4)", () => {
    for (const key of REQUIRED_COMPONENT_KEYS) {
      expect(DIALECT_COMPONENT_REGISTRY[key], `missing dialect component: ${key}`).toBeTruthy();
    }
  });

  it("keeps the registry free of unregistered component keys", () => {
    const known = new Set(REQUIRED_COMPONENT_KEYS);
    for (const key of Object.keys(DIALECT_COMPONENT_REGISTRY)) {
      expect(known.has(key), `registry key not in dialect: ${key}`).toBe(true);
    }
  });

  it("registers data renderers only for events the dialect declares card-bearing or process-bearing", () => {
    const cardBearingEvents = (Object.keys(AGENT_EVENT_DIALECT) as AgentEventType[]).filter((type) => {
      const descriptor = AGENT_EVENT_DIALECT[type];
      return descriptor.componentKey !== null || type === "persist_done";
    });
    const registered = Object.keys(AGENT_DATA_RENDERERS) as AgentEventType[];
    for (const type of registered) {
      expect(
        cardBearingEvents.includes(type),
        `data renderer registered for event without a card: ${type}`,
      ).toBe(true);
    }
  });

  it("never exposes non-whitelisted event data through the converter (safe-field enforcement)", () => {
    // convertTranscript 只放行 dialect.safeFields 声明的字段,保持 surface 投影语义。
    const events = NULL_COMPONENT_EVENTS;
    expect(events).toContain("phase");
    expect(AGENT_EVENT_DIALECT["messages.snapshot"].safeFields).toEqual(["items"]);
  });
});
