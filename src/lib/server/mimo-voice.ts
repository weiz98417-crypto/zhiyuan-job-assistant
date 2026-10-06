/**
 * 小米 MiMo 语音服务端客户端(spec 39):TTS(白桦,按句)与 ASR(整段转写)。
 * key 只在本模块读取;调用方(路由)拿不到 key 本身。
 * 实测契约(2026-10-06 冒烟):POST {MIMO_BASE_URL}/chat/completions,
 * TTS 非流式音频在 choices[0].message.audio.data(base64 wav);
 * ASR 音频走 content[{type:"input_audio",input_audio:{data:"data:audio/wav;base64,…"}}]。
 */
import crypto from "node:crypto";

const TTS_MAX_CHARS = 500;
const ASR_MAX_BASE64_CHARS = 8_000_000; // ≈ 单次回答 120s 上限的量级护栏
const CACHE_MAX = 50;

export class MimoVoiceUnavailableError extends Error {
  constructor(message = "语音服务未配置(MIMO_API_KEY 缺失)") {
    super(message);
    this.name = "MimoVoiceUnavailableError";
  }
}

export class MimoVoiceUpstreamError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MimoVoiceUpstreamError";
  }
}

function requireKey(): string {
  const key = process.env.MIMO_API_KEY?.trim();
  if (!key) throw new MimoVoiceUnavailableError();
  return key;
}

function baseUrl(): string {
  return (process.env.MIMO_BASE_URL || "https://api.xiaomimimo.com/v1").replace(/\/$/, "");
}

function ttsVoice(): string {
  return process.env.MIMO_TTS_VOICE || "白桦";
}

export function isVoiceConfigured(): boolean {
  return Boolean(process.env.MIMO_API_KEY?.trim());
}

/** TTS 音频 LRU 缓存(同文本+音色不重合成;省免费额度,重播零成本)。 */
const ttsCache = new Map<string, { audioBase64: string; format: string }>();

function cacheGet(key: string): { audioBase64: string; format: string } | undefined {
  const hit = ttsCache.get(key);
  if (!hit) return undefined;
  ttsCache.delete(key);
  ttsCache.set(key, hit);
  return hit;
}

function cacheSet(key: string, value: { audioBase64: string; format: string }): void {
  ttsCache.set(key, value);
  if (ttsCache.size > CACHE_MAX) {
    ttsCache.delete(ttsCache.keys().next().value as string);
  }
}

export function ttsCacheSize(): number {
  return ttsCache.size;
}

/** 按句合成(非流式;整段 TTS SSE 流式留给打断升级,见 spec 39 评审记录)。 */
export async function mimoTts(text: string): Promise<{ audioBase64: string; format: string; cached: boolean }> {
  const trimmed = text.trim();
  if (!trimmed) throw new MimoVoiceUpstreamError("TTS 文本为空");
  if (trimmed.length > TTS_MAX_CHARS) throw new MimoVoiceUpstreamError(`TTS 单次最多 ${TTS_MAX_CHARS} 字(按句切分后调用)`);

  const key = crypto.createHash("sha256").update(`${ttsVoice()}:${trimmed}`).digest("hex");
  const cached = cacheGet(key);
  if (cached) return { ...cached, cached: true };

  const response = await fetch(`${baseUrl()}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${requireKey()}` },
    body: JSON.stringify({
      model: process.env.MIMO_TTS_MODEL || "mimo-v2.5-tts",
      messages: [{ role: "assistant", content: trimmed }],
      audio: { format: "mp3", voice: ttsVoice() },
      stream: false,
    }),
  });
  if (!response.ok) {
    throw new MimoVoiceUpstreamError(`MiMo TTS ${response.status}: ${(await response.text()).slice(0, 200)}`);
  }
  const payload = await response.json() as { choices?: Array<{ message?: { audio?: { data?: string } } }> };
  const audioBase64 = payload.choices?.[0]?.message?.audio?.data || "";
  if (!audioBase64) throw new MimoVoiceUpstreamError("MiMo TTS 返回为空音频");

  const value = { audioBase64, format: "mp3" };
  cacheSet(key, value);
  return { ...value, cached: false };
}

/** 整段转写(回合制 MVP;wav/mp3,浏览器端 16k mono wav 由录音器编码)。 */
export async function mimoAsr(audioBase64: string, format: "wav" | "mp3" = "wav"): Promise<string> {
  if (!audioBase64) throw new MimoVoiceUpstreamError("音频为空");
  if (audioBase64.length > ASR_MAX_BASE64_CHARS) throw new MimoVoiceUpstreamError("音频过长(单次回答 ≤120 秒)");

  const response = await fetch(`${baseUrl()}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${requireKey()}` },
    body: JSON.stringify({
      model: process.env.MIMO_ASR_MODEL || "mimo-v2.5-asr",
      messages: [{
        role: "user",
        content: [{ type: "input_audio", input_audio: { data: `data:audio/${format};base64,${audioBase64}`, format } }],
      }],
      asr_options: { language: "zh" },
    }),
  });
  if (!response.ok) {
    throw new MimoVoiceUpstreamError(`MiMo ASR ${response.status}: ${(await response.text()).slice(0, 200)}`);
  }
  const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
  return (payload.choices?.[0]?.message?.content || "").trim();
}

/** 按句切分:实现在 src/lib/voice/sentence-split.ts(客户端共用)。 */
export { splitIntoSentences } from "@/lib/voice/sentence-split";
