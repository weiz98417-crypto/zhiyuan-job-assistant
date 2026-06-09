export const ZHIPU_API_URL = "https://open.bigmodel.cn/api/paas/v4/chat/completions";

export const ZHIPU_VISION_MODEL = process.env.ZHIPU_VISION_MODEL || "glm-5v-turbo";

export const ZHIPU_FALLBACK_MODEL = process.env.ZHIPU_FALLBACK_MODEL || ZHIPU_VISION_MODEL;
