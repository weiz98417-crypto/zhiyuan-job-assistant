import { beforeEach, describe, expect, it, vi } from "vitest";

const toDataURL = vi.fn((mime: string) => `data:${mime};base64,${Buffer.from("candidate").toString("base64")}`);
const drawImage = vi.fn();

vi.mock("@napi-rs/canvas", () => ({
  loadImage: vi.fn(async () => ({ width: 1080, height: 3676 })),
  createCanvas: vi.fn(() => ({
    getContext: () => ({
      fillStyle: "",
      fillRect: vi.fn(),
      imageSmoothingEnabled: false,
      imageSmoothingQuality: "high",
      drawImage,
    }),
    toDataURL,
  })),
}));

describe("server image variants", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates vertical slice candidates for tall JD screenshots", async () => {
    const { buildOCRImageCandidates } = await import("@/lib/server-image-variants");
    const pngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const imageBytes = Buffer.concat([pngHeader, Buffer.alloc(128, 1)]);
    const candidates = await buildOCRImageCandidates(`data:image/png;base64,${imageBytes.toString("base64")}`);

    expect(candidates.map((item) => item.label)).toEqual(expect.arrayContaining([
      "整图规范化",
      "长图上半段",
      "长图中段",
      "长图下半段",
    ]));
    expect(candidates.length).toBeGreaterThanOrEqual(4);
  });
});
