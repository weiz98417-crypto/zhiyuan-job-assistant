/**
 * 浏览器端语音录音与 WAV 编码(spec 39):
 * AudioWorklet 采集 Float32 PCM → 16kHz 单声道 → WAV(RIFF)Blob。
 * MiMo ASR 只收 wav/mp3;MediaRecorder 的 webm 不被接受,故自编码。
 * encodeWav16k 是纯函数(单测覆盖 RIFF 头与采样数)。
 */

export const TARGET_SAMPLE_RATE = 16_000;

/** Float32 PCM(任意采样率,可多声道)→ 16kHz 单声道 WAV Blob。 */
export function encodeWav16k(channels: Float32Array[], sourceSampleRate: number): Blob {
  const mono = downmix(channels);
  const resampled = resample(mono, sourceSampleRate, TARGET_SAMPLE_RATE);
  const buffer = encodeWavBuffer(resampled, TARGET_SAMPLE_RATE);
  return new Blob([buffer], { type: "audio/wav" });
}

/** 多声道混为单声道(取平均)。 */
function downmix(channels: Float32Array[]): Float32Array {
  if (channels.length === 1) return channels[0];
  const length = Math.max(...channels.map((channel) => channel.length));
  const out = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    let sum = 0;
    for (const channel of channels) sum += channel[i] || 0;
    out[i] = sum / channels.length;
  }
  return out;
}

/** 线性插值重采样(语音 16k 足够)。 */
function resample(input: Float32Array, sourceRate: number, targetRate: number): Float32Array {
  if (sourceRate === targetRate) return input;
  const ratio = sourceRate / targetRate;
  const outLength = Math.floor(input.length / ratio);
  const out = new Float32Array(outLength);
  for (let i = 0; i < outLength; i++) {
    const position = i * ratio;
    const left = Math.floor(position);
    const right = Math.min(left + 1, input.length - 1);
    const fraction = position - left;
    out[i] = input[left] * (1 - fraction) + input[right] * fraction;
  }
  return out;
}

/** PCM Float32 → WAV(16-bit PCM little-endian)ArrayBuffer。 */
export function encodeWavBuffer(samples: Float32Array, sampleRate: number): ArrayBuffer {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  writeAscii(view, 0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  writeAscii(view, 8, "WAVE");
  writeAscii(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // byte rate
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  writeAscii(view, 36, "data");
  view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(44 + i * 2, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
  }
  return buffer;
}

function writeAscii(view: DataView, offset: number, text: string): void {
  for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
}
