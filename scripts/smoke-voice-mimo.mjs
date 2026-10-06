#!/usr/bin/env node
/**
 * MiMo 语音真实冒烟(spec 39):TTS(白桦)→ wav 断言 → 回灌 ASR → 转写相似断言。
 * 无 MIMO_API_KEY 时跳过(exit 0);失败 exit 1。key 只读自 .env/环境变量。
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
if (!process.env.MIMO_API_KEY) {
  const envPath = path.join(ROOT, ".env");
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
      const match = line.match(/^([A-Z_]+)=(.*)$/);
      if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
    }
  }
}
if (!process.env.MIMO_API_KEY) {
  console.log("[smoke-voice] 无 MIMO_API_KEY,跳过(exit 0)。");
  process.exit(0);
}

const BASE = (process.env.MIMO_BASE_URL || "https://api.xiaomimimo.com/v1").replace(/\/$/, "");
const KEY = process.env.MIMO_API_KEY;
const TEXT = "你好,欢迎参加模拟面试。请做一个简短的自我介绍。";

const call = async (body) => {
  const response = await fetch(`${BASE}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${KEY}` },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`MiMo ${response.status}: ${(await response.text()).slice(0, 200)}`);
  return response.json();
};

const tts = await call({
  model: process.env.MIMO_TTS_MODEL || "mimo-v2.5-tts",
  messages: [{ role: "assistant", content: TEXT }],
  audio: { format: "wav", voice: process.env.MIMO_TTS_VOICE || "白桦" },
  stream: false,
});
const audioBase64 = tts.choices?.[0]?.message?.audio?.data || "";
const wav = Buffer.from(audioBase64, "base64");
if (wav.subarray(0, 4).toString() !== "RIFF") throw new Error(`TTS 音频非 RIFF wav(bytes=${wav.length})`);
console.log(`[smoke-voice] TTS ok: ${wav.length} bytes wav(voice=${process.env.MIMO_TTS_VOICE || "白桦"})`);

const asr = await call({
  model: process.env.MIMO_ASR_MODEL || "mimo-v2.5-asr",
  messages: [{ role: "user", content: [{ type: "input_audio", input_audio: { data: `data:audio/wav;base64,${audioBase64}`, format: "wav" } }] }],
  asr_options: { language: "zh" },
});
const transcript = (asr.choices?.[0]?.message?.content || "").replace(/[^\p{Script=Han}\p{L}\p{N}]/gu, "");
const expected = TEXT.replace(/[^\p{Script=Han}\p{L}\p{N}]/gu, "");
if (transcript !== expected) throw new Error(`ASR 转写不符: "${transcript}" ≠ "${expected}"`);
console.log(`[smoke-voice] ASR ok: 逐字转写一致("${transcript.slice(0, 20)}…")`);
console.log("[smoke-voice] 全部通过。");
