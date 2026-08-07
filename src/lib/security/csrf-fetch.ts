'use client';

const MUTATION_METHODS = ['POST', 'PUT', 'PATCH', 'DELETE'];
const ORIGIN_ONLY_PATHS = ['/api/auth/login', '/api/auth/register'];

let installed = false;
let csrfToken = '';
let csrfExpiresAt = 0;
let pendingToken: Promise<string> | null = null;

export function installCsrfFetch(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  const originalFetch = window.fetch.bind(window);

  async function token(): Promise<string> {
    if (csrfToken && csrfExpiresAt > Date.now() + 30_000) return csrfToken;
    if (pendingToken) return pendingToken;
    pendingToken = originalFetch('/api/auth/csrf', {
      method: 'GET',
      credentials: 'same-origin',
      cache: 'no-store',
    }).then(async (response) => {
      const data = await response.json().catch(() => ({}));
      if (!response.ok || typeof data.csrfToken !== 'string') {
        throw new Error(typeof data.error === 'string' ? data.error : 'CSRF token unavailable');
      }
      csrfToken = data.csrfToken;
      csrfExpiresAt = Date.now() + Math.max(60, Number(data.expiresIn) || 1800) * 1000;
      return csrfToken;
    }).finally(() => {
      pendingToken = null;
    });
    return pendingToken;
  }

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const method = String(init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
    if (!MUTATION_METHODS.includes(method)) return originalFetch(input, init);

    const rawUrl = input instanceof Request ? input.url : String(input);
    const url = new URL(rawUrl, window.location.href);
    if (url.origin !== window.location.origin || !url.pathname.startsWith('/api/')) {
      return originalFetch(input, init);
    }
    if (ORIGIN_ONLY_PATHS.includes(url.pathname) || url.pathname === '/api/auth/csrf') {
      return originalFetch(input, init);
    }

    const headers = new Headers(input instanceof Request ? input.headers : undefined);
    new Headers(init?.headers).forEach((value, key) => headers.set(key, value));
    headers.set('X-CSRF-Token', await token());
    return originalFetch(input, { ...init, headers, credentials: init?.credentials || 'same-origin' });
  };
}
