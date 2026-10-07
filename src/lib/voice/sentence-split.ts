/** 按句切分(TTS 逐句播放;客户端/服务端共用纯函数,零依赖)。 */

export const TTS_MAX_CHARS = 500;

export function splitIntoSentences(text: string): string[] {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (!cleaned) return [];
  const raw: string[] = [];
  let buffer = "";
  for (const char of cleaned) {
    buffer += char;
    if ("。!?;:;:!?\n".includes(char)) {
      raw.push(buffer.trim());
      buffer = "";
    }
  }
  if (buffer.trim()) raw.push(buffer.trim());

  const result: string[] = [];
  for (const part of raw.filter(Boolean)) {
    if (part.length <= TTS_MAX_CHARS) {
      result.push(part);
      continue;
    }
    let longBuffer = "";
    for (const char of part) {
      longBuffer += char;
      if (longBuffer.length >= TTS_MAX_CHARS) {
        result.push(longBuffer.trim());
        longBuffer = "";
      } else if ("、,,,".includes(char) && longBuffer.length >= TTS_MAX_CHARS / 2) {
        result.push(longBuffer.trim());
        longBuffer = "";
      }
    }
    if (longBuffer.trim()) result.push(longBuffer.trim());
  }
  return result;
}
