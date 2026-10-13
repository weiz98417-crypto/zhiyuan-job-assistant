import { afterEach, describe, expect, it, vi } from 'vitest';

function installBrowser(fetchImplementation: typeof fetch, pathname: string) {
  const replace = vi.fn();
  vi.stubGlobal('window', {
    fetch: fetchImplementation,
    location: {
      href: `https://app.example${pathname}`,
      origin: 'https://app.example',
      pathname,
      replace,
    },
  });
  return replace;
}

describe('browser stale-session recovery', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('clears the stale cookie and redirects when a protected API returns 401', async () => {
    const originalFetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/auth/logout') return new Response('{}', { status: 200 });
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    }) as unknown as typeof fetch;
    const replace = installBrowser(originalFetch, '/admin/agent-runs');
    const entries = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      get length() { return entries.size; },
      key: (index: number) => Array.from(entries.keys())[index] ?? null,
      getItem: (key: string) => entries.get(key) ?? null,
      setItem: (key: string, value: string) => entries.set(key, value),
      removeItem: (key: string) => entries.delete(key),
    });
    const { setBrowserOwner } = await import('@/lib/browser-owner');
    setBrowserOwner('stale-account');
    const { installCsrfFetch } = await import('@/lib/security/csrf-fetch');

    installCsrfFetch();
    const response = await window.fetch('/api/data/profile');

    expect(response.status).toBe(401);
    expect(originalFetch).toHaveBeenCalledWith('/api/auth/logout', expect.objectContaining({
      method: 'POST',
      credentials: 'same-origin',
    }));
    expect(replace).toHaveBeenCalledWith('/login?reason=session-expired');
  });

  it('keeps invalid login credentials as an inline error', async () => {
    const originalFetch = vi.fn(async () => new Response(
      JSON.stringify({ code: 'INVALID_CREDENTIALS' }),
      { status: 401 },
    )) as unknown as typeof fetch;
    const replace = installBrowser(originalFetch, '/login');
    const { installCsrfFetch } = await import('@/lib/security/csrf-fetch');

    installCsrfFetch();
    const response = await window.fetch('/api/auth/login', { method: 'POST' });

    expect(response.status).toBe(401);
    expect(originalFetch).toHaveBeenCalledTimes(1);
    expect(replace).not.toHaveBeenCalled();
  });
});
