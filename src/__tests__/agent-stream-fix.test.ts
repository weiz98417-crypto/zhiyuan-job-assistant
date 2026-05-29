import { describe, it, expect } from 'vitest';
import { LLMError } from '@/lib/llm-retry';

describe('LLMError class', () => {
  it('creates timeout error with retryable=true', () => {
    const err = new LLMError('timeout', 'Request timed out', true);
    expect(err.type).toBe('timeout');
    expect(err.retryable).toBe(true);
    expect(err.userMessage).toContain('超时');
  });

  it('creates rate_limit error with retryable=true', () => {
    const err = new LLMError('rate_limit', 'Rate limited', true, 429);
    expect(err.type).toBe('rate_limit');
    expect(err.retryable).toBe(true);
    expect(err.statusCode).toBe(429);
    expect(err.userMessage).toContain('繁忙');
  });

  it('creates invalid_response error with retryable=false', () => {
    const err = new LLMError('invalid_response', 'Bad JSON', false);
    expect(err.type).toBe('invalid_response');
    expect(err.retryable).toBe(false);
    expect(err.userMessage).toContain('异常');
  });

  it('creates unknown error', () => {
    const err = new LLMError('unknown', 'Something went wrong');
    expect(err.type).toBe('unknown');
    expect(err.retryable).toBe(false);
    expect(err.userMessage).toContain('异常');
  });

  it('preserves name as LLMError', () => {
    const err = new LLMError('timeout', 'test', true);
    expect(err.name).toBe('LLMError');
    expect(err).toBeInstanceOf(Error);
  });
});

describe('CJK token estimation logic', () => {
  // The actual function is not exported, but we test the core regex logic
  function estimate(content: string): number {
    return content.replace(/[\u4e00-\u9fff]/g, 'aa').length;
  }

  it('counts pure Chinese as 2x char count', () => {
    expect(estimate('你好世界')).toBe(8); // 4 chars × 2
  });

  it('counts pure English as 1x char count', () => {
    expect(estimate('hello')).toBe(5);
  });

  it('handles mixed Chinese-English text', () => {
    expect(estimate('AI产品经理')).toBe(10); // 2 ASCII + 4 CJK×2
  });

  it('handles empty string', () => {
    expect(estimate('')).toBe(0);
  });

  it('handles CJK punctuation without inflating count', () => {
    // ，。！ are not in [\u4e00-\u9fff], so not inflated
    const result = estimate('你好，世界！');
    expect(result).toBe(10); // 4 CJK×2 + 2 punct
  });

  it('does NOT affect Japanese kana (not in CJK range)', () => {
    const result = estimate('こんにちは');
    expect(result).toBe(5);
  });
});

describe('line buffer pattern', () => {
  function processChunks(chunks: string[]): string[] {
    const results: string[] = [];
    let lineBuf = '';
    for (const chunk of chunks) {
      lineBuf += chunk;
      const lines = lineBuf.split('\n');
      lineBuf = lines.pop() || '';
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        results.push(line.slice(6));
      }
    }
    // Drain remaining
    if (lineBuf.trim() && lineBuf.startsWith('data: ')) {
      results.push(lineBuf.slice(6));
    }
    return results;
  }

  it('handles complete line in single chunk', () => {
    const results = processChunks(['data: {"a":1}\n']);
    expect(results).toEqual(['{"a":1}']);
  });

  it('handles line split across two chunks', () => {
    const results = processChunks(['data: {"a"', ':1}\n']);
    expect(results).toEqual(['{"a":1}']);
  });

  it('handles multiple lines in one chunk', () => {
    const results = processChunks(['data: {"a":1}\ndata: {"b":2}\n']);
    expect(results).toEqual(['{"a":1}', '{"b":2}']);
  });

  it('ignores non-data lines', () => {
    const results = processChunks(['event: ping\ndata: {"a":1}\n']);
    expect(results).toEqual(['{"a":1}']);
  });
});
