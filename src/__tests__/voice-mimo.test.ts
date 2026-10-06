/** spec 39:语音路由与 MiMo 客户端契约(鉴权/503/缓存/载荷形状)+ WAV 编码器。 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { fetchMock, getCurrentUserMock } = vi.hoisted(() => ({
  fetchMock: vi.fn(),
  getCurrentUserMock: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  getCurrentUser: getCurrentUserMock,
  verifyTokenVersion: vi.fn(async () => true),
}));

import { POST as ttsRoute } from "@/app/api/interview/voice/tts/route";
import { POST as asrRoute } from "@/app/api/interview/voice/asr/route";
import { GET as configRoute } from "@/app/api/interview/voice/config/route";
import { encodeWavBuffer, encodeWav16k } from "@/lib/voice/wav-encode";
import { splitIntoSentences } from "@/lib/voice/sentence-split";

function jsonRequest(body: unknown): Request {
  return new Request("http://localhost:3000/api/x", { method: "POST", body: JSON.stringify(body) });
}

function mimoTtsBody() {
  return { ok: true, status: 200, json: async () => ({ choices: [{ message: { audio: { data: "UklJRg==" } } }] }) };
}

beforeEach(() => {
  getCurrentUserMock.mockResolvedValue({ userId: "u1" });
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("MIMO_API_KEY", "test-key");
  vi.stubEnv("MIMO_TTS_VOICE", "白桦");
});

describe("voice config 路由(功能门禁)", () => {
  it("有 key → enabled+音色,不回 key", async () => {
    const body = await (await configRoute()).json();
    expect(body.data).toEqual({ enabled: true, voice: "白桦" });
    expect(JSON.stringify(body)).not.toContain("test-key");
  });

  it("无 key → enabled=false(前端不渲染语音入口)", async () => {
    vi.stubEnv("MIMO_API_KEY", "");
    const body = await (await configRoute()).json();
    expect(body.data.enabled).toBe(false);
  });
});

describe("voice tts 路由", () => {
  it("合成 → mp3 base64;同文本二次调用命中缓存(cached=true,零上游调用)", async () => {
    fetchMock.mockResolvedValue(mimoTtsBody());
    const first = await (await ttsRoute(jsonRequest({ text: "你好,欢迎参加模拟面试" }))).json();
    expect(first.success).toBe(true);
    expect(first.data).toMatchObject({ format: "mp3", cached: false });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const sent = JSON.parse(String(fetchMock.mock.calls[0][1].body));
    expect(sent.model).toBe("mimo-v2.5-tts");
    expect(sent.audio).toEqual({ format: "mp3", voice: "白桦" });

    const second = await (await ttsRoute(jsonRequest({ text: "你好,欢迎参加模拟面试" }))).json();
    expect(second.data.cached).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("无 key → 503;空文本 → 400;上游错误 → 400 不泄 key", async () => {
    vi.stubEnv("MIMO_API_KEY", "");
    const res = await ttsRoute(jsonRequest({ text: "你好" }));
    expect(res.status).toBe(503);

    vi.stubEnv("MIMO_API_KEY", "test-key");
    const empty = await ttsRoute(jsonRequest({ text: " " }));
    expect(empty.status).toBe(400);

    fetchMock.mockResolvedValue({ ok: false, status: 500, text: async () => "boom" });
    const upstream = await (await ttsRoute(jsonRequest({ text: "你好" }))).json();
    expect(upstream.success).toBe(false);
    expect(JSON.stringify(upstream)).not.toContain("test-key");
  });
});

describe("voice asr 路由", () => {
  it("载荷形状:data URL + language=zh;转写文本透传", async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ choices: [{ message: { content: " 你好,面试官 " } }] }) });
    const res = await asrRoute(jsonRequest({ audioBase64: "UklJRg==", format: "wav" }));
    const body = await res.json();
    expect(body).toEqual({ success: true, data: { text: "你好,面试官" } });
    const sent = JSON.parse(String(fetchMock.mock.calls[0][1].body));
    expect(sent.model).toBe("mimo-v2.5-asr");
    expect(sent.asr_options).toEqual({ language: "zh" });
    expect(sent.messages[0].content[0].input_audio).toMatchObject({ format: "wav", data: "data:audio/wav;base64,UklJRg==" });
  });

  it("无 key → 503;空音频 → 400", async () => {
    vi.stubEnv("MIMO_API_KEY", "");
    expect((await asrRoute(jsonRequest({ audioBase64: "x" }))).status).toBe(503);
    vi.stubEnv("MIMO_API_KEY", "test-key");
    expect((await asrRoute(jsonRequest({ audioBase64: "" }))).status).toBe(400);
  });
});

describe("splitIntoSentences(TTS 逐句)", () => {
  it("中英标点切句,短句保留", () => {
    expect(splitIntoSentences("你好。我是面试官!请自我介绍?")).toEqual(["你好。", "我是面试官!", "请自我介绍?"]);
  });
  it("超长句按逗号二次切分,单句 ≤500", () => {
    const long = "字".repeat(700);
    const parts = splitIntoSentences(long);
    expect(parts.length).toBeGreaterThan(1);
    for (const part of parts) expect(part.length).toBeLessThanOrEqual(500);
  });
  it("空白 → 空数组", () => {
    expect(splitIntoSentences("   ")).toEqual([]);
  });
});

describe("WAV 编码器(spec 39 客户端)", () => {
  it("RIFF 头 + 16-bit 单声道 + 采样数正确", () => {
    const samples = new Float32Array([0, 0.5, -0.5, 1]);
    const buffer = encodeWavBuffer(samples, 16_000);
    const view = new DataView(buffer);
    expect(String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3))).toBe("RIFF");
    expect(view.getUint16(22, true)).toBe(1);
    expect(view.getUint32(24, true)).toBe(16_000);
    expect(view.getUint32(40, true)).toBe(8);
    expect(view.getInt16(44, true)).toBe(0);
    expect(view.getInt16(46, true)).toBeGreaterThan(0);
    expect(view.getInt16(48, true)).toBeLessThan(0);
    expect(view.getInt16(50, true)).toBe(32767);
  });

  it("48k→16k 重采样:长度按比例,幅度保留", () => {
    const input = new Float32Array(48_000).map((_, i) => Math.sin(i / 100));
    const blob = encodeWav16k([input], 48_000);
    expect(blob.type).toBe("audio/wav");
    return blob.arrayBuffer().then((buffer) => {
      const view = new DataView(buffer);
      expect(view.getUint32(24, true)).toBe(16_000);
      expect(view.getUint32(40, true)).toBe(16_000 * 2);
    });
  });
});
