'use client';

import { assertBrowserOwner, requireBrowserOwner, setBrowserOwner, type BrowserOwner } from '@/lib/browser-owner';
const MUTATION_METHODS = ['POST', 'PUT', 'PATCH', 'DELETE'];
const ORIGIN_ONLY_PATHS = ['/api/auth/login', '/api/auth/register', '/api/auth/logout', '/api/auth/password/recovery-request'];
const AUTH_PAGES = new Set(['/login', '/register', '/forgot-password', '/change-password']);

let installed = false;
let csrfToken = '';
let csrfExpiresAt = 0;
let pendingToken: Promise<string> | null = null;
let tokenOwnerKey = '';
let pendingTokenOwnerKey = '';
let csrfGeneration = 0;
let pendingSessionRecovery: Promise<void> | null = null;

function resetCsrfToken(): void {
  csrfGeneration++;
  csrfToken = '';
  csrfExpiresAt = 0;
  tokenOwnerKey = '';
  pendingToken = null;
  pendingTokenOwnerKey = '';
}

function ownerResponse(response: Response, owner: BrowserOwner): Response {
  let body: ReadableStream<Uint8Array> | null | undefined;
  return new Proxy(response, {
    get(target, property) {
      if (property === 'clone') return () => {
        assertBrowserOwner(owner);
        return ownerResponse(target.clone(), owner);
      };
      if (property === 'body') {
        assertBrowserOwner(owner);
        if (body !== undefined) return body;
        if (!target.body) return body = null;
        let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
        body = new ReadableStream<Uint8Array>({
          async pull(controller) {
            try {
              assertBrowserOwner(owner);
              reader ??= target.body!.getReader();
              const chunk = await reader.read();
              assertBrowserOwner(owner);
              if (chunk.done) controller.close();
              else controller.enqueue(chunk.value);
            } catch (failure) {
              controller.error(failure);
              await reader?.cancel().catch(() => undefined);
            }
          },
          cancel(reason) { return reader?.cancel(reason); },
        }, { highWaterMark: 0 });
        return body;
      }
      const value = Reflect.get(target, property, target);
      if (['json', 'text', 'blob', 'arrayBuffer', 'formData', 'bytes'].includes(String(property)) && typeof value === 'function') {
        return async (...args: unknown[]) => {
          assertBrowserOwner(owner);
          const result = await value.apply(target, args);
          assertBrowserOwner(owner);
          return result;
        };
      }
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}

export function installCsrfFetch(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  const originalFetch = window.fetch.bind(window);

  function shouldRecoverSession(url: URL, response: Response): boolean {
    if (response.status !== 401 || url.origin !== window.location.origin) return false;
    if (!url.pathname.startsWith('/api/')) return false;
    if (url.pathname === '/api/users/me') return false;

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

    resetCsrfToken();
    setBrowserOwner(null);
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

  async function token(owner: BrowserOwner | null): Promise<string> {
    const generation = csrfGeneration;
    const ownerKey = owner ? owner.ownerId + ':' + owner.sessionKey + ':' + owner.generation : 'auth:' + generation;
    if (owner) assertBrowserOwner(owner);
    if (csrfToken && tokenOwnerKey === ownerKey && csrfExpiresAt > Date.now() + 30_000) return csrfToken;
    if (pendingToken && pendingTokenOwnerKey === ownerKey) return pendingToken;
    const url = new URL('/api/auth/csrf', window.location.href);
    const request = originalFetch(url.pathname, {
      method: 'GET',
      credentials: 'same-origin',
      cache: 'no-store',
    }).then(async (response) => {
      if (owner) assertBrowserOwner(owner);
      if (generation !== csrfGeneration) throw new Error('账号已变更，请重新验证请求');
      await recoverIfUnauthorized(url, response);
      const data = await response.json().catch(() => ({}));
      if (owner) assertBrowserOwner(owner);
      if (generation !== csrfGeneration) throw new Error('账号已变更，请重新验证请求');
      if (!response.ok || typeof data.csrfToken !== 'string') {
        throw new Error(typeof data.error === 'string' ? data.error : 'CSRF token unavailable');
      }
      csrfToken = data.csrfToken;
      tokenOwnerKey = ownerKey;
      csrfExpiresAt = Date.now() + Math.max(60, Number(data.expiresIn) || 1800) * 1000;
      return csrfToken;
    }).finally(() => {
      if (pendingToken === request) {
        pendingToken = null;
        pendingTokenOwnerKey = '';
      }
    });
    pendingToken = request;
    pendingTokenOwnerKey = ownerKey;
    return request;
  }

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const method = String(init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
    const rawUrl = input instanceof Request ? input.url : String(input);
    const url = new URL(rawUrl, window.location.href);
    if (url.origin !== window.location.origin || !url.pathname.startsWith('/api/')) {
      return originalFetch(input, init);
    }
    const owner = url.pathname === '/api/users/me' || url.pathname.startsWith('/api/auth/') ? null : requireBrowserOwner();
    if (!MUTATION_METHODS.includes(method)) {
      const response = await originalFetch(input, init);
      if (owner) assertBrowserOwner(owner);
      await recoverIfUnauthorized(url, response);
      return owner ? ownerResponse(response, owner) : response;
    }
    if (ORIGIN_ONLY_PATHS.includes(url.pathname) || url.pathname === '/api/auth/csrf') {
      if (url.pathname === '/api/auth/login' || url.pathname === '/api/auth/logout') {
        setBrowserOwner(null);
        resetCsrfToken();
      }
      const response = await originalFetch(input, init);
      await recoverIfUnauthorized(url, response);
      return response;
    }

    const headers = new Headers(input instanceof Request ? input.headers : undefined);
    new Headers(init?.headers).forEach((value, key) => headers.set(key, value));
    headers.set('X-CSRF-Token', await token(owner));
    if (owner) assertBrowserOwner(owner);
    const response = await originalFetch(input, {
      ...init,
      headers,
      credentials: init?.credentials || 'same-origin',
    });
    if (owner) assertBrowserOwner(owner);
    await recoverIfUnauthorized(url, response);
    return owner ? ownerResponse(response, owner) : response;
  };
}
