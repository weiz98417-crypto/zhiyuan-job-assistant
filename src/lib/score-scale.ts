export function isFivePointScore(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 5;
}

export function fivePointScoreOrZero(value: unknown): number {
  return isFivePointScore(value) ? value : 0;
}

export function formatFivePointScore(value: unknown): string {
  return isFivePointScore(value) ? `${value}/5` : "待复核";
}

export function isPercentageScore(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100;
}
