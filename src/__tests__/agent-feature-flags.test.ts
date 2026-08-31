import { describe, expect, it } from "vitest";
import {
  AGENT_FEATURE_FLAG_DEFINITIONS,
  assertAgentFeatureFlagPlan,
  getAgentFeatureFlagState,
  isAgentFeatureFlagEnabled,
  validateAgentFeatureFlagPlan,
} from "@/lib/agent/feature-flags";

describe("agent feature flag governance", () => {
  it("requires item dual-write before item reads and all seams before cutover", () => {
    const states = Object.keys(AGENT_FEATURE_FLAG_DEFINITIONS).map((name) => getAgentFeatureFlagState(name as keyof typeof AGENT_FEATURE_FLAG_DEFINITIONS, {
      AGENT_FLAG_ITEM_READ_SWITCH_ENABLED: "true",
    }));
    expect(validateAgentFeatureFlagPlan(states)).toContain("item_read_switch requires item_dual_write");
    expect(() => assertAgentFeatureFlagPlan(states)).toThrow(/Invalid Agent feature flag plan/);
  });

  it("supports deterministic allowlist and percentage cohorts", () => {
    const env = {
      AGENT_FLAG_ITEM_DUAL_WRITE_ENABLED: "true",
      AGENT_FLAG_ITEM_DUAL_WRITE_COHORT: "allow-user",
      AGENT_FLAG_ITEM_DUAL_WRITE_PERCENTAGE: "100",
    };
    expect(isAgentFeatureFlagEnabled("item_dual_write", "allow-user", env)).toBe(true);
    expect(isAgentFeatureFlagEnabled("item_dual_write", "any-user", env)).toBe(true);
    expect(isAgentFeatureFlagEnabled("item_read_switch", "any-user", env)).toBe(false);
  });
});
