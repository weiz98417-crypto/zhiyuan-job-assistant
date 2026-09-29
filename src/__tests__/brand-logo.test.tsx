// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import BrandLogo from "@/components/brand/BrandLogo";

afterEach(() => cleanup());

describe("BrandLogo", () => {
  it("exposes the paper bird identity and visible wordmark", () => {
    render(<BrandLogo variant="full" size="md" />);

    expect(screen.getByRole("img", { name: "纸鸢 Agent" })).toBeTruthy();
    expect(screen.getByText("纸鸢")).toBeTruthy();
    expect(screen.getByText("Agent")).toBeTruthy();
  });

  it("supports a compact mark for collapsed navigation", () => {
    render(<BrandLogo variant="mark" size="sm" tone="light" />);

    const logo = screen.getByRole("img", { name: "纸鸢 Agent" });
    expect(logo.className).toContain("brand-logo-mark");
    expect(logo.className).toContain("brand-logo-tone-light");
    expect(screen.queryByText("Agent")).toBeNull();
  });
});
