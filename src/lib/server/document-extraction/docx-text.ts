import mammoth from "mammoth";
import { normalizeExtractedText } from "./pdf-text";

export async function extractDocxText(buffer: Buffer): Promise<string> {
  const result = await mammoth.extractRawText({ buffer });
  return normalizeExtractedText(result.value || "");
}
