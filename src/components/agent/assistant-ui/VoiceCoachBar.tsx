"use client";

/**
 * 语音教练条(spec 39):麦克风(按住说话→ASR→直接发送)+ 语音模式(教练回复 TTS 播报,
 * 可停止)。回合制 MVP;enabled=false(无 key)时整条不渲染。
 * 并发纪律(评审修订):录音与播报是两条独立通道;播报用代际 token(新播报作废旧代),
 * 卸载时释放麦克风与播放。
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { AudioLines, Loader2, Mic, Square, VolumeX } from "lucide-react";
import { encodeWav16k } from "@/lib/voice/wav-encode";
import { splitIntoSentences } from "@/lib/voice/sentence-split";

const MAX_RECORD_MS = 120_000;
const VOICE_MODE_KEY = "agent:voice-mode:v1";

type RecordingPhase = "idle" | "starting" | "recording" | "recognizing";
type SpeakPhase = "idle" | "speaking";

interface VoiceCoachBarProps {
  streaming: boolean;
  /** 最新一条教练消息(语音模式开启时播报;挂载时已存在的消息不重播)。 */
  lastAssistantText: string;
  onSendTranscript: (text: string) => void;
}

interface RecordingSession {
  stream: MediaStream;
  context: AudioContext;
  processor: ScriptProcessorNode;
  source: MediaStreamAudioSourceNode;
  chunks: Float32Array[];
}

export function VoiceCoachBar({ streaming, lastAssistantText, onSendTranscript }: VoiceCoachBarProps) {
  const [enabled, setEnabled] = useState(false);
  const [voiceMode, setVoiceMode] = useState(false);
  const [recordingPhase, setRecordingPhase] = useState<RecordingPhase>("idle");
  const [speakPhase, setSpeakPhase] = useState<SpeakPhase>("idle");
  const [error, setError] = useState("");
  const sessionRef = useRef<RecordingSession | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const speakGenerationRef = useRef(0);
  const spokenTextRef = useRef("");
  const suppressNextSpeakRef = useRef(false);
  const mountedRef = useRef(true);
  const recordingGenerationRef = useRef(0);
  const holdingRef = useRef(false);
  const recordingTimerRef = useRef<number | null>(null);
  const stopRecordingRef = useRef<() => Promise<void>>(async () => {});
  const recognitionAbortRef = useRef<AbortController | null>(null);
  const speechAbortRef = useRef<AbortController | null>(null);
  const finishPlaybackRef = useRef<(() => void) | null>(null);

  /* 能力探测:无 key 整条不渲染 */
  useEffect(() => {
    let cancelled = false;
    fetch("/api/interview/voice/config", { cache: "no-store" })
      .then((res) => res.json())
      .then((json) => { if (!cancelled) setEnabled(Boolean(json.success && json.data?.enabled)); })
      .catch(() => { if (!cancelled) setEnabled(false); });
    return () => { cancelled = true; };
  }, []);

  /* 语音模式持久化:恢复时抑制对「挂载时已存在」消息的重播 */
  useEffect(() => {
    if (window.localStorage.getItem(VOICE_MODE_KEY) === "1") {
      suppressNextSpeakRef.current = true;
      setVoiceMode(true);
    }
  }, []);

  /* 卸载清理:麦克风、播放、合成循环全部终止 */
  useEffect(() => {
    mountedRef.current = true;
    return () => {
    mountedRef.current = false;
    holdingRef.current = false;
    recordingGenerationRef.current += 1;
    if (recordingTimerRef.current !== null) window.clearTimeout(recordingTimerRef.current);
    recognitionAbortRef.current?.abort();
    speechAbortRef.current?.abort();
    const session = sessionRef.current;
    if (session) {
      try {
        session.processor.disconnect();
        session.source.disconnect();
        session.stream.getTracks().forEach((track) => track.stop());
        void session.context.close();
      } catch { /* 卸载清理尽力而为 */ }
      sessionRef.current = null;
    }
    speakGenerationRef.current += 1;
    audioRef.current?.pause();
    audioRef.current = null;
    finishPlaybackRef.current?.();
    finishPlaybackRef.current = null;
    };
  }, []);

  const stopSpeaking = useCallback(() => {
    speakGenerationRef.current += 1;
    audioRef.current?.pause();
    audioRef.current = null;
    speechAbortRef.current?.abort();
    finishPlaybackRef.current?.();
    finishPlaybackRef.current = null;
    setSpeakPhase("idle");
  }, []);

  const speak = useCallback(async (text: string) => {
    const sentences = splitIntoSentences(text);
    if (sentences.length === 0) return;
    stopSpeaking();
    speakGenerationRef.current += 1;
    const generation = speakGenerationRef.current;
    const controller = new AbortController();
    speechAbortRef.current = controller;
    setError("");
    setSpeakPhase("speaking");
    try {
      for (const sentence of sentences) {
        if (speakGenerationRef.current !== generation) return;
        const res = await fetch("/api/interview/voice/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: sentence }),
          signal: controller.signal,
        });
        const json = await res.json();
        if (speakGenerationRef.current !== generation) return;
        if (!json.success || !json.data?.audioBase64) {
          setError(String(json.error || "语音合成失败"));
          break;
        }
        await new Promise<void>((resolve) => {
          const audio = new Audio(`data:audio/mp3;base64,${json.data.audioBase64}`);
          audioRef.current = audio;
          finishPlaybackRef.current = resolve;
          audio.onended = () => resolve();
          audio.onerror = () => resolve();
          void audio.play().catch(() => resolve());
        });
      }
    } catch {
      if (mountedRef.current && speakGenerationRef.current === generation) {
        setError("语音播报失败,请重试或改用文字阅读");
      }
    } finally {
      if (mountedRef.current && speakGenerationRef.current === generation) {
        audioRef.current = null;
        finishPlaybackRef.current = null;
        setSpeakPhase("idle");
      }
    }
  }, [stopSpeaking]);

  /* 语音模式:流式结束后播报最新教练消息(去重;挂载恢复的 suppress 只挡一次) */
  useEffect(() => {
    if (!enabled || !voiceMode || streaming) return;
    const text = typeof lastAssistantText === "string" ? lastAssistantText.trim() : "";
    if (!text || text === spokenTextRef.current) return;
    if (suppressNextSpeakRef.current) {
      suppressNextSpeakRef.current = false;
      spokenTextRef.current = text;
      return;
    }
    spokenTextRef.current = text;
    void speak(text);
  }, [enabled, voiceMode, streaming, lastAssistantText, speak]);

  const toggleVoiceMode = useCallback(() => {
    setVoiceMode((current) => {
      const next = !current;
      window.localStorage.setItem(VOICE_MODE_KEY, next ? "1" : "0");
      if (!next) {
        suppressNextSpeakRef.current = false;
        stopSpeaking();
      }
      return next;
    });
  }, [stopSpeaking]);

  /* ── 录音通道(ScriptProcessor 采集 PCM,停止后编码 16k wav → ASR)── */
  const startRecording = useCallback(async () => {
    if (holdingRef.current || sessionRef.current) return;
    holdingRef.current = true;
    const generation = ++recordingGenerationRef.current;
    let acquiredStream: MediaStream | null = null;
    let acquiredContext: AudioContext | null = null;
    setError("");
    setRecordingPhase("starting");
    stopSpeaking();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true } });
      acquiredStream = stream;
      if (!mountedRef.current || !holdingRef.current || recordingGenerationRef.current !== generation) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      const context = new AudioContext();
      acquiredContext = context;
      const source = context.createMediaStreamSource(stream);
      const processor = context.createScriptProcessor(4096, 1, 1);
      const chunks: Float32Array[] = [];
      processor.onaudioprocess = (event) => {
        chunks.push(new Float32Array(event.inputBuffer.getChannelData(0)));
      };
      source.connect(processor);
      const mute = context.createGain();
      mute.gain.value = 0;
      processor.connect(mute);
      mute.connect(context.destination);
      sessionRef.current = { stream, context, processor, source, chunks };
      setRecordingPhase("recording");
      recordingTimerRef.current = window.setTimeout(() => {
        if (recordingGenerationRef.current === generation) void stopRecordingRef.current();
      }, MAX_RECORD_MS);
    } catch {
      acquiredStream?.getTracks().forEach((track) => track.stop());
      if (acquiredContext) void acquiredContext.close();
      if (mountedRef.current && recordingGenerationRef.current === generation) {
        holdingRef.current = false;
        setError("无法访问麦克风(请检查浏览器权限)");
        setRecordingPhase("idle");
      }
    }
  }, [stopSpeaking]);

  const stopRecording = useCallback(async () => {
    holdingRef.current = false;
    recordingGenerationRef.current += 1;
    if (recordingTimerRef.current !== null) {
      window.clearTimeout(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    const session = sessionRef.current;
    if (!session) {
      if (mountedRef.current && !recognitionAbortRef.current) setRecordingPhase("idle");
      return;
    }
    sessionRef.current = null;
    const controller = new AbortController();
    recognitionAbortRef.current = controller;
    setRecordingPhase("recognizing");
    try {
      session.processor.disconnect();
      session.source.disconnect();
      session.stream.getTracks().forEach((track) => track.stop());
      const sampleRate = session.context.sampleRate;
      await session.context.close();
      const blob = encodeWav16k(session.chunks, sampleRate);
      const bytes = new Uint8Array(await blob.arrayBuffer());
      let binary = "";
      for (let i = 0; i < bytes.length; i += 0x8000) {
        binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      }
      const base64 = btoa(binary);
      const res = await fetch("/api/interview/voice/asr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ audioBase64: base64, format: "wav" }),
        signal: controller.signal,
      });
      const json = await res.json();
      if (!mountedRef.current || controller.signal.aborted) return;
      if (!json.success || !json.data?.text) {
        setError(String(json.error || "未识别到语音内容"));
      } else if (json.data.text.trim()) {
        onSendTranscript(json.data.text.trim());
      } else {
        setError("未识别到语音内容");
      }
    } catch {
      if (mountedRef.current && !controller.signal.aborted) setError("语音识别失败,请重试或改用键盘输入");
    } finally {
      recognitionAbortRef.current = null;
      if (mountedRef.current) setRecordingPhase("idle");
    }
  }, [onSendTranscript]);

  useEffect(() => { stopRecordingRef.current = stopRecording; }, [stopRecording]);

  if (!enabled) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 px-4 pb-1 text-[11px] text-[var(--color-muted)]">
      {/* 按住说话(录音通道) */}
      <button
        type="button"
        disabled={recordingPhase === "recognizing" || (streaming && recordingPhase === "idle")}
        onPointerDown={(event) => {
          if (recordingPhase !== "idle" || streaming) return;
          event.preventDefault();
          event.currentTarget.setPointerCapture?.(event.pointerId);
          void startRecording();
        }}
        onPointerUp={() => { void stopRecording(); }}
        onPointerCancel={() => { void stopRecording(); }}
        onLostPointerCapture={() => { void stopRecording(); }}
        onKeyDown={(event) => {
          if ((event.key === " " || event.key === "Enter") && !event.repeat && recordingPhase === "idle" && !streaming) {
            event.preventDefault();
            void startRecording();
          }
        }}
        onKeyUp={(event) => {
          if (event.key === " " || event.key === "Enter") {
            event.preventDefault();
            void stopRecording();
          }
        }}
        aria-label={recordingPhase === "recording" ? "松开结束作答" : "按住说话"}
        title={recordingPhase === "recording" ? "松开结束作答" : "按住说话,松开自动识别并发送"}
        className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 transition-colors ${
          recordingPhase === "recording"
            ? "border-[var(--zhusha)] bg-[var(--zhusha)] text-white animate-pulse"
            : "border-[var(--color-border)] hover:border-[var(--color-primary)]"
        } disabled:opacity-40`}
      >
        {recordingPhase === "recognizing" ? <Loader2 size={11} className="animate-spin" /> : <Mic size={11} />}
        {recordingPhase === "recording" ? "松开结束" : recordingPhase === "starting" ? "等待麦克风…" : recordingPhase === "recognizing" ? "识别中…" : "按住说话"}
      </button>

      {/* 语音模式开关 */}
      <button
        type="button"
        onClick={toggleVoiceMode}
        aria-pressed={voiceMode}
        title={voiceMode ? "语音播报开(点击关闭)" : "语音播报关(点击开启)"}
        className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 transition-colors ${
          voiceMode ? "border-[var(--color-primary)] text-[var(--color-primary)]" : "border-[var(--color-border)] hover:border-[var(--color-primary)]"
        }`}
      >
        <AudioLines size={11} /> 语音模式{voiceMode ? "开" : "关"}
      </button>

      {/* 播报通道 */}
      {speakPhase === "speaking" && (
        <>
          <span className="inline-flex items-center gap-1"><Loader2 size={10} className="animate-spin" /> 正在播报…</span>
          <button
            type="button"
            onClick={stopSpeaking}
            className="inline-flex items-center gap-1 rounded-full border border-[var(--zhusha)] px-2 py-0.5 text-[var(--zhusha)]"
            aria-label="停止播报"
          >
            <VolumeX size={11} /> 停止播报
          </button>
        </>
      )}
      {error && (
        <span className="inline-flex items-center gap-1 text-red-600">
          <Square size={9} /> {error}
        </span>
      )}
    </div>
  );
}
