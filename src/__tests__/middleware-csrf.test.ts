import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SignJWT } from 'jose';
import { NextRequest } from 'next/server';
import { createCsrfToken } from '@/lib/security/csrf';
import { middleware } from '@/middleware';

const jwtSecret = new TextEncoder().encode('dev-secret-change-in-production-min-32-chars!!');
const previousOrigin = process.env.APP_ORIGIN;
const previousCsrfSecret = process.env.CSRF_SECRET;

async function authToken() {
  return new SignJWT({
    userId: 'owner-1',
    username: 'owner',
    role: 'superadmin',
    tokenVersion: 0,
    mustChangePassword: false,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(jwtSecret);
}

beforeAll(() => {
  process.env.APP_ORIGIN = 'https://app.example';
  process.env.CSRF_SECRET = 'csrf-test-secret-with-at-least-32-characters';
});

afterAll(() => {
  if (previousOrigin === undefined) delete process.env.APP_ORIGIN;
  else process.env.APP_ORIGIN = previousOrigin;
  if (previousCsrfSecret === undefined) delete process.env.CSRF_SECRET;
  else process.env.CSRF_SECRET = previousCsrfSecret;
});

describe('middleware CSRF enforcement', () => {
  it('rejects cross-origin login before the public route executes', async () => {
    const response = await middleware(new NextRequest('https://app.example/api/auth/login', {
      method: 'POST',
      headers: { origin: 'https://evil.example' },
    }));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ code: 'ORIGIN_FORBIDDEN' });
  });

  it('rejects an authenticated same-origin mutation without CSRF evidence', async () => {
    const auth = await authToken();
    const response = await middleware(new NextRequest('https://app.example/api/admin/users/member-1', {
      method: 'PUT',
      headers: {
        origin: 'https://app.example',
        cookie: `auth_token=${auth}`,
      },
    }));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ code: 'CSRF_REQUIRED' });
  });

  it('passes a valid same-origin mutation through to route authorization', async () => {
    const auth = await authToken();
    const csrf = await createCsrfToken(auth);
    const response = await middleware(new NextRequest('https://app.example/api/admin/users/member-1', {
      method: 'PUT',
      headers: {
        origin: 'https://app.example',
        'x-csrf-token': csrf,
        cookie: `auth_token=${auth}; csrf_token=${csrf}`,
      },
    }));

    expect(response.status).toBe(200);
    expect(response.headers.get('x-middleware-next')).toBe('1');
  });
});
