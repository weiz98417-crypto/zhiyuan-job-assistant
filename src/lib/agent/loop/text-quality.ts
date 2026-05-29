/**
 * Text quality detection utilities.
 *
 * Detects mojibake (garbled text) caused by encoding mismatches —
 * e.g. GBK bytes decoded as UTF-8, producing replacement characters
 * or C1 control character artifacts.
 */

/* ── Character class helpers ── */

const CJK_RANGES = [
  [0x4e00, 0x9fff], // CJK Unified Ideographs
  [0x3400, 0x4dbf], // CJK Unified Ideographs Extension A
  [0xf900, 0xfaff], // CJK Compatibility Ideographs
  [0x2f800, 0x2fa1f], // CJK Compatibility Ideographs Supplement
];

function isCJK(cp: number): boolean {
  return CJK_RANGES.some(([lo, hi]) => cp >= lo && cp <= hi);
}

const LATIN_EXTENDED_RANGES = [
  [0x00c0, 0x024f], // Latin-1 Supplement + Latin Extended-A/B
  [0x1e00, 0x1eff], // Latin Extended Additional
];

function isLatinExtended(cp: number): boolean {
  return LATIN_EXTENDED_RANGES.some(([lo, hi]) => cp >= lo && cp <= hi);
}

function isC1Control(cp: number): boolean {
  // C1 control characters: U+0080 to U+009F
  return cp >= 0x0080 && cp <= 0x009f;
}

/* ── Detection thresholds ── */

const UFFFD_THRESHOLD = 0.005; // 0.5% replacement characters
const MIN_UFFFD_COUNT = 3; // Absolute minimum replacement chars (avoids false positives on short texts)
const C1_THRESHOLD = 0.01; // 1% C1 control characters
const MIN_C1_COUNT = 5; // Absolute minimum C1 chars
const GARBLED_MIN_LENGTH = 100; // Only check Latin-garbled pattern for texts ≥ 100 chars
const CJK_MIN_RATIO = 0.05; // < 5% CJK = suspicious for Chinese text
const LATIN_EXT_MIN_RATIO = 0.30; // > 30% Latin Extended = likely garbled

/* ── Public API ── */

/**
 * Detect whether a text string is likely garbled (mojibake) due to
 * encoding mismatch. Uses three independent strategies:
 *
 * 1. U+FFFD replacement character density ≥ 0.5%
 * 2. C1 control character (0x80-0x9F) density ≥ 1%
 * 3. Chinese-text Latin garbled pattern: length ≥ 100, CJK < 5%,
 *    Latin Extended > 30%
 *
 * Any single strategy matching is sufficient to classify as garbled.
 */
export function isGarbledText(text: string): boolean {
  if (!text || text.trim().length === 0) return false;

  let ufffdCount = 0;
  let c1Count = 0;
  let cjkCount = 0;
  let latinExtCount = 0;

  // Iterate by code points (not char codes) to handle surrogate pairs
  const len = text.length;
  for (let i = 0; i < len; i++) {
    const cp = text.codePointAt(i);
    if (cp === undefined) continue;

    // Skip surrogate halves (codePointAt already handles these at the high surrogate,
    // but we need to skip the low surrogate)
    if (cp >= 0xdc00 && cp <= 0xdfff) continue; // low surrogate

    if (cp === 0xfffd) {
      ufffdCount++;
    }

    if (isC1Control(cp)) {
      c1Count++;
    }

    if (isCJK(cp)) {
      cjkCount++;
    }

    if (isLatinExtended(cp)) {
      latinExtCount++;
    }
  }

  if (len > 0) {
    // Strategy 1: U+FFFD density + minimum absolute count
    if (ufffdCount >= MIN_UFFFD_COUNT && ufffdCount / len >= UFFFD_THRESHOLD) return true;

    // Strategy 2: C1 control character density + minimum absolute count
    if (c1Count >= MIN_C1_COUNT && c1Count / len >= C1_THRESHOLD) return true;

    // Strategy 3: Chinese-text Latin garbled pattern
    if (
      len >= GARBLED_MIN_LENGTH &&
      cjkCount / len < CJK_MIN_RATIO &&
      latinExtCount / len > LATIN_EXT_MIN_RATIO
    ) {
      return true;
    }
  }

  return false;
}
