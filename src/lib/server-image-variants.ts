interface CanvasModule {
  createCanvas: (width: number, height: number) => {
    getContext: (type: "2d") => {
      fillStyle: string;
      fillRect: (x: number, y: number, w: number, h: number) => void;
      imageSmoothingEnabled: boolean;
      imageSmoothingQuality: "low" | "medium" | "high";
      drawImage: (...args: unknown[]) => void;
    };
    toDataURL: (mime: "image/jpeg" | "image/png", quality?: number) => string;
  };
  loadImage: (source: Buffer) => Promise<{ width: number; height: number }>;
}

interface CropSpec {
  label: string;
  kind?: "full" | "tall_slice" | "thumbnail_crop";
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ImageCandidate {
  label: string;
  kind?: "full" | "tall_slice" | "thumbnail_crop";
  dataUri: string;
}

const MAX_CANDIDATES = 6;
const MAX_EDGE = 2400;
const MIN_UPSCALE_EDGE = 1600;

function parseDataUri(dataUri: string): Buffer | null {
  const match = dataUri.match(/^data:image\/(?:png|jpeg|jpg|webp);base64,([A-Za-z0-9+/=\r\n]+)$/i);
  if (!match) return null;
  try {
    const buffer = Buffer.from(match[1].replace(/\s+/g, ""), "base64");
    return buffer.length > 32 ? buffer : null;
  } catch {
    return null;
  }
}

function detectMime(buffer: Buffer): "image/png" | "image/jpeg" | "image/webp" | null {
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg";
  if (buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP") return "image/webp";
  return null;
}

export function normalizeImageDataUri(dataUri: string): ImageCandidate | null {
  const buffer = parseDataUri(dataUri);
  if (!buffer) return null;
  const mime = detectMime(buffer);
  if (!mime) return null;
  return { label: "原图", kind: "full", dataUri: `data:${mime};base64,${buffer.toString("base64")}` };
}

async function loadCanvas(): Promise<CanvasModule> {
  return import("@napi-rs/canvas") as Promise<CanvasModule>;
}

function clampCrop(spec: CropSpec, width: number, height: number): CropSpec | null {
  const x = Math.max(0, Math.min(width - 1, Math.round(spec.x)));
  const y = Math.max(0, Math.min(height - 1, Math.round(spec.y)));
  const w = Math.max(1, Math.min(width - x, Math.round(spec.w)));
  const h = Math.max(1, Math.min(height - y, Math.round(spec.h)));
  if (w < 40 || h < 40) return null;
  return { ...spec, x, y, w, h };
}

export async function buildOCRImageCandidates(dataUri: string): Promise<ImageCandidate[]> {
  const normalized = normalizeImageDataUri(dataUri);
  if (!normalized) return [];

  let canvasModule: CanvasModule;
  try {
    canvasModule = await loadCanvas();
  } catch (err) {
    console.warn("Server image preprocessing unavailable:", err instanceof Error ? err.message : String(err));
    return [normalized];
  }

  const source = parseDataUri(normalized.dataUri);
  if (!source) return [normalized];

  const img = await canvasModule.loadImage(source);
  const width = img.width;
  const height = img.height;
  const isTallImage = height / Math.max(width, 1) >= 2.2;
  const specs: CropSpec[] = [];

  if (isTallImage) {
    specs.push(
      { label: "长图上半段", kind: "tall_slice", x: 0, y: 0, w: width, h: height * 0.46 },
      { label: "长图中段", kind: "tall_slice", x: 0, y: height * 0.27, w: width, h: height * 0.46 },
      { label: "长图下半段", kind: "tall_slice", x: 0, y: height * 0.54, w: width, h: height * 0.46 },
      { label: "长图正文中下段", kind: "tall_slice", x: 0, y: height * 0.40, w: width, h: height * 0.55 },
    );
  }

  specs.push({ label: "整图规范化", kind: "full", x: 0, y: 0, w: width, h: height });

  if (width / height >= 1.4) {
    specs.push(
      { label: "右上缩略图裁剪", kind: "thumbnail_crop", x: width * 0.68, y: 0, w: width * 0.31, h: height * 0.62 },
      { label: "右上紧裁剪", kind: "thumbnail_crop", x: width * 0.78, y: 0, w: width * 0.21, h: height * 0.58 },
      { label: "右侧区域裁剪", kind: "thumbnail_crop", x: width * 0.55, y: 0, w: width * 0.44, h: height * 0.74 },
    );
  }

  const candidates: ImageCandidate[] = [];
  const seen = new Set<string>();
  for (const raw of specs) {
    if (candidates.length >= MAX_CANDIDATES) break;
    const spec = clampCrop(raw, width, height);
    if (!spec) continue;
    const key = `${spec.x},${spec.y},${spec.w},${spec.h}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const scale = Math.min(MAX_EDGE / Math.max(spec.w, spec.h), Math.max(1, MIN_UPSCALE_EDGE / Math.max(spec.w, spec.h)));
    const outW = Math.max(1, Math.round(spec.w * scale));
    const outH = Math.max(1, Math.round(spec.h * scale));
    const canvas = canvasModule.createCanvas(outW, outH);
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, outW, outH);
    ctx.imageSmoothingEnabled = raw.label === "整图规范化";
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, spec.x, spec.y, spec.w, spec.h, 0, 0, outW, outH);
    candidates.push({ label: spec.label, kind: spec.kind, dataUri: canvas.toDataURL("image/jpeg", 0.9) });
  }

  return candidates.length ? candidates : [normalized];
}
