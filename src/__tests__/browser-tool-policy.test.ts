import { describe, expect, it } from "vitest";
import {
  BROWSER_DOMAIN_ALLOWLIST,
  buildBrowserToolCapability,
  buildBrowserToolGovernance,
  classifyBrowserTool,
  isUrlAllowed,
} from "@/lib/agent/mcp/browser-tool-policy";
import { hasCompleteToolCapability } from "@/lib/agent/tools/tool-capability";

describe("Spec 16: closed browser tool classification", () => {
  it("classifies navigation and snapshot as read-effect", () => {
    expect(classifyBrowserTool("browser_navigate")).toEqual({ registerable: true, effect: "read" });
    expect(classifyBrowserTool("browser_snapshot")).toEqual({ registerable: true, effect: "read" });
  });

  it("classifies form interaction as write-effect", () => {
    expect(classifyBrowserTool("browser_click")).toEqual({ registerable: true, effect: "write" });
    expect(classifyBrowserTool("browser_type")).toEqual({ registerable: true, effect: "write" });
    expect(classifyBrowserTool("browser_fill_form")).toEqual({ registerable: true, effect: "write" });
  });

  it("excludes browser_evaluate (arbitrary in-page JS)", () => {
    expect(classifyBrowserTool("browser_evaluate").registerable).toBe(false);
  });

  it("defaults unknown future browser tools to write-effect (closed classification)", () => {
    expect(classifyBrowserTool("browser_some_new_tool")).toEqual({ registerable: true, effect: "write" });
  });
});

describe("Spec 16: browser domain allowlist", () => {
  it("allows allowlisted job portals and their subdomains", () => {
    expect(isUrlAllowed("https://www.zhipin.com/job_detail/abc.html")).toBe(true);
    expect(isUrlAllowed("https://company.liepin.com/job/1")).toBe(true);
    for (const domain of BROWSER_DOMAIN_ALLOWLIST) {
      expect(isUrlAllowed(`https://www.${domain}/`)).toBe(true);
    }
  });

  it("rejects non-allowlisted domains and spoofed suffixes", () => {
    expect(isUrlAllowed("https://evil.example.com/login")).toBe(false);
    expect(isUrlAllowed("https://zhipin.com.evil.com/")).toBe(false);
  });

  it("rejects non-http protocols and malformed urls", () => {
    expect(isUrlAllowed("javascript:alert(1)")).toBe(false);
    expect(isUrlAllowed("file:///etc/passwd")).toBe(false);
    expect(isUrlAllowed("not a url")).toBe(false);
  });
});

describe("Spec 16: browser tool governance and capability", () => {
  it("requires user confirmation only for write tools", () => {
    const read = buildBrowserToolGovernance("playwright_browser_navigate", "read");
    const write = buildBrowserToolGovernance("playwright_browser_click", "write");
    expect(read.requiresUserConfirmation).toBe(false);
    expect(read.effect).toBe("read");
    expect(write.requiresUserConfirmation).toBe(true);
    expect(write.effect).toBe("write");
  });

  it("attaches complete capability metadata so registry exposes the tools", () => {
    for (const effect of ["read", "write"] as const) {
      const capability = buildBrowserToolCapability(effect);
      expect(hasCompleteToolCapability(capability)).toBe(true);
    }
  });

  it("relaxes deadlines for slow portals while keeping read/write split", () => {
    const read = buildBrowserToolCapability("read");
    const write = buildBrowserToolCapability("write");
    expect(read.deadlineMs).toBeGreaterThan(30_000);
    expect(write.deadlineMs).toBeGreaterThan(30_000);
    expect(write.risk).toBe("high");
    expect(read.risk).toBe("low");
  });
});
