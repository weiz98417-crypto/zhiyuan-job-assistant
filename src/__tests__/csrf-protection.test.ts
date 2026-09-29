import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import {
  createCsrfToken,
  validateCsrfMutation,
  validateRequestOrigin,
} from '@/lib/security/csrf';

const originalOrigin = process.env.APP_ORIGIN;
const originalSecret = process.env.CSRF_SECRET;
const originalNodeEnv = process.env.NODE_ENV;

function mutationRequest(options: {
  origin?: string;
  headerToken?: string;
  cookieToken?: string;
}) {
  const headers = new Headers();
  if (options.origin) headers.set('origin', options.origin);
  if (options.headerToken) headers.set('x-csrf-token', options.headerToken);
  if (options.cookieToken) headers.set('cookie', `csrf_token=${options.cookieToken}`);
  return new NextRequest('https://app.example/api/admin/users/member-1', {
    method: 'PUT',
    headers,
  });
}

describe('CSRF and origin protection', () => {
  beforeEach(() => {
    process.env.APP_ORIGIN = 'https://app.example';
    process.env.CSRF_SECRET = 'csrf-test-secret-with-at-least-32-characters';
  });

  afterEach(() => {
    if (originalOrigin === undefined) delete process.env.APP_ORIGIN;
    else process.env.APP_ORIGIN = originalOrigin;
    if (originalSecret === undefined) delete process.env.CSRF_SECRET;
    else process.env.CSRF_SECRET = originalSecret;
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnv;
  });

  it('rejects an untrusted or missing browser origin', () => {
    expect(validateRequestOrigin(mutationRequest({ origin: 'https://evil.example' }))).toEqual({
      ok: false, code: 'ORIGIN_FORBIDDEN',
    });
    expect(validateRequestOrigin(mutationRequest({}))).toEqual({
      ok: false, code: 'ORIGIN_REQUIRED',
    });
  });

  it('accepts localhost loopback aliases during local development', () => {
    process.env.NODE_ENV = 'development';
    process.env.APP_ORIGIN = 'http://localhost:3100';
    const request = new NextRequest('http://localhost:3100/api/auth/login', {
      method: 'POST',
      headers: { origin: 'http://127.0.0.1:3100' },
    });

    expect(validateRequestOrigin(request)).toEqual({ ok: true });
  });

  it('does not accept loopback aliases in production', () => {
    process.env.NODE_ENV = 'production';
    process.env.APP_ORIGIN = 'https://localhost:3100';
    const request = new NextRequest('https://localhost:3100/api/auth/login', {
      method: 'POST',
      headers: { origin: 'https://127.0.0.1:3100' },
    });

    expect(validateRequestOrigin(request)).toEqual({
      ok: false,
      code: 'ORIGIN_FORBIDDEN',
    });
  });

  it('rejects a same-origin mutation with missing CSRF evidence', async () => {
    await expect(validateCsrfMutation(
      mutationRequest({ origin: 'https://app.example' }),
      'auth-token-1',
    )).resolves.toEqual({ ok: false, code: 'CSRF_REQUIRED' });
  });

  it('rejects a forged token and a token bound to another login session', async () => {
    await expect(validateCsrfMutation(
      mutationRequest({
        origin: 'https://app.example',
        headerToken: 'forged',
        cookieToken: 'forged',
      }),
      'auth-token-1',
    )).resolves.toEqual({ ok: false, code: 'CSRF_INVALID' });

    const otherSessionToken = await createCsrfToken('auth-token-2');
    await expect(validateCsrfMutation(
      mutationRequest({
        origin: 'https://app.example',
        headerToken: otherSessionToken,
        cookieToken: otherSessionToken,
      }),
      'auth-token-1',
    )).resolves.toEqual({ ok: false, code: 'CSRF_INVALID' });
  });

  it('allows a same-origin mutation with matching, valid, session-bound evidence', async () => {
    const token = await createCsrfToken('auth-token-1');

    await expect(validateCsrfMutation(
      mutationRequest({
        origin: 'https://app.example',
        headerToken: token,
        cookieToken: token,
      }),
      'auth-token-1',
    )).resolves.toEqual({ ok: true });
  });
});
