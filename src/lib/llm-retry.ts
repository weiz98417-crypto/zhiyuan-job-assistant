export class LLMError extends Error {
  type: 'timeout' | 'rate_limit' | 'invalid_response' | 'unknown';
  retryable: boolean;
  statusCode?: number;

  constructor(
    type: LLMError['type'],
    message: string,
    retryable = false,
    statusCode?: number
  ) {
    super(message);
    this.name = 'LLMError';
    this.type = type;
    this.retryable = retryable;
    this.statusCode = statusCode;
  }

  get userMessage(): string {
    switch (this.type) {
      case 'timeout':
        return 'AI 服务响应超时，请稍后重试';
      case 'rate_limit':
        return 'AI 服务繁忙，已自动重试';
      case 'invalid_response':
        return 'AI 返回异常，已自动重试';
      default:
        return `AI 服务异常: ${this.message}`;
    }
  }
}

export interface LLMRetryOptions {
  model: string;
  messages: Array<{ role: string; content: string }>;
  stream?: boolean;
  timeout?: number;
  retries?: number;
  fallbackModel?: string;
  temperature?: number;
  max_tokens?: number;
  response_format?: { type: string };
}

function classifyError(err: unknown, statusCode?: number): LLMError {
  if (err instanceof LLMError) return err;

  const message = err instanceof Error ? err.message : String(err);

  if (err instanceof DOMException && err.name === 'AbortError') {
    return new LLMError('timeout', 'Request timed out', true);
  }
  if (message.includes('ETIMEDOUT') || message.includes('timeout')) {
    return new LLMError('timeout', message, true);
  }
  if (statusCode === 429) {
    return new LLMError('rate_limit', 'Rate limited', true, statusCode);
  }
  if (statusCode && statusCode >= 500) {
    return new LLMError('unknown', message, true, statusCode);
  }

  return new LLMError('unknown', message, false, statusCode);
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Call DeepSeek (or compatible) API with retry + timeout + fallback.
 * Returns the raw fetch Response on success, throws LLMError on all-retries-exhausted.
 */
export async function llmRetry(
  apiUrl: string,
  apiKey: string,
  options: LLMRetryOptions
): Promise<Response> {
  const {
    model,
    messages,
    stream = false,
    timeout = 30_000,
    retries = 2,
    fallbackModel,
    temperature,
    max_tokens,
    response_format,
  } = options;

  let lastError: LLMError | null = null;

  const modelsToTry = [model];
  if (fallbackModel && fallbackModel !== model) {
    modelsToTry.push(fallbackModel);
  }

  for (const currentModel of modelsToTry) {
    for (let attempt = 0; attempt <= retries; attempt++) {
      const isStreamAttempt = stream && attempt === 0; // only stream on first attempt

      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeout);

        const body: Record<string, unknown> = {
          model: currentModel,
          messages,
          stream: isStreamAttempt,
        };
        if (temperature !== undefined) body.temperature = temperature;
        if (max_tokens !== undefined) body.max_tokens = max_tokens;
        if (response_format) body.response_format = response_format;

        const res = await fetch(apiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        }).finally(() => clearTimeout(timer));

        if (!res.ok) {
          const errorText = await res.text().catch(() => '');
          throw new LLMError(
            res.status === 429 ? 'rate_limit' : 'unknown',
            `API returned ${res.status}: ${errorText.slice(0, 200)}`,
            res.status === 429 || res.status >= 500,
            res.status
          );
        }

        return res;
      } catch (err) {
        lastError = classifyError(err);

        // If this was a stream that failed, retry with stream=false
        if (isStreamAttempt && lastError.retryable) {
          continue;
        }

        if (!lastError.retryable) {
          throw lastError;
        }

        // Last attempt for this model
        if (attempt === retries) break;

        // Exponential backoff: 1s, 2s
        await sleep(1000 * (attempt + 1));
      }
    }
  }

  throw lastError || new LLMError('unknown', 'All retries exhausted', false);
}
