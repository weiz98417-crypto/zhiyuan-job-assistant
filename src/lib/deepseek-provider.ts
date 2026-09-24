export const DEEPSEEK_API_URL = "https://api.deepseek.com/chat/completions";

export const DEEPSEEK_VISION_MODEL = "deepseek-flash";

export function getDeepSeekApiKey(): string {
  return process.env.DEEPSEEK_API_KEY?.trim() || "";
}
