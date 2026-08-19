'use client';

const MUTATION_METHODS = ['POST', 'PUT', 'PATCH', 'DELETE'];
const ORIGIN_ONLY_PATHS = ['/api/auth/login', '/api/auth/register', '/api/auth/logout'];
const AUTH_PAGES = new Set(['/login', '/register', '/forgot-password', '/change-password']);

let installed = false;
let csrfToken = '';
let csrfExpiresAt = 0;
let pendingToken: Promise<string> | null = null;
let pendingSessionRecovery: Promise<void> | null = null;

export function installCsrfFetch(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  const originalFetch = window.fetch.bind(window);

  function shouldRecoverSession(url: URL, response: Response): boolean {
    if (response.status !== 401 || url.origin !== window.location.origin) return false;
    if (!url.pathname.startsWith('/api/')) return false;

    // Authentication endpoints can legitimately return 401 for bad credentials.
    // The CSRF bootstrap is the exception: its 401 means the current session is unusable.
    return !url.pathname.startsWith('/api/auth/') || url.pathname === '/api/auth/csrf';
  }

  async function recoverSession(): Promise<void> {
    const pathname = window.location.pathname.length > 1
      ? window.location.pathname.replace(/\/+$/, '')
      : window.location.pathname;
    if (AUTH_PAGES.has(pathname)) return;
    if (pendingSessionRecovery) return pendingSessionRecovery;

    csrfToken = '';
    csrfExpiresAt = 0;
    pendingSessionRecovery = originalFetch('/api/auth/logout', {
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
    })
      .catch(() => undefined)
      .then(() => {
        window.location.replace('/login?reason=session-expired');
      });
    return pendingSessionRecovery;
  }

  async function recoverIfUnauthorized(url: URL, response: Response): Promise<void> {
    if (shouldRecoverSession(url, response)) await recoverSession();
  }

  async function token(): Promise<string> {
    if (csrfToken && csrfExpiresAt > Date.now() + 30_000) return csrfToken;
    if (pendingToken) return pendingToken;
    const url = new URL('/api/auth/csrf', window.location.href);
    pendingToken = originalFetch(url.pathname, {
      method: 'GET',
      credentials: 'same-origin',
      cache: 'no-store',
    }).then(async (response) => {
      await recoverIfUnauthorized(url, response);
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
    const rawUrl = input instanceof Request ? input.url : String(input);
    const url = new URL(rawUrl, window.location.href);
    if (url.origin !== window.location.origin || !url.pathname.startsWith('/api/')) {
      return originalFetch(input, init);
    }
    if (!MUTATION_METHODS.includes(method)) {
      const response = await originalFetch(input, init);
      await recoverIfUnauthorized(url, response);
      return response;
    }
    if (ORIGIN_ONLY_PATHS.includes(url.pathname) || url.pathname === '/api/auth/csrf') {
      const response = await originalFetch(input, init);
      await recoverIfUnauthorized(url, response);
      return response;
    }

    const headers = new Headers(input instanceof Request ? input.headers : undefined);
    new Headers(init?.headers).forEach((value, key) => headers.set(key, value));
    headers.set('X-CSRF-Token', await token());
    const response = await originalFetch(input, {
      ...init,
      headers,
      credentials: init?.credentials || 'same-origin',
    });
    await recoverIfUnauthorized(url, response);
    return response;
  };
}
