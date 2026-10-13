'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import WorkbenchShell from './WorkbenchShell';
import { installCsrfFetch } from '@/lib/security/csrf-fetch';
import { BROWSER_OWNER_EVENT, BROWSER_OWNER_KEY, getBrowserOwner, invalidateBrowserOwner, setBrowserOwner } from '@/lib/browser-owner';

const AUTH_PAGES = new Set([
  '/login',
  '/register',
  '/forgot-password',
  '/change-password',
]);

export default function AuthGate({ children }: { children: ReactNode }) {
  installCsrfFetch();
  const pathname = usePathname();
  const normalizedPathname = pathname.length > 1
    ? pathname.replace(/\/+$/, '')
    : pathname;
  const isAuthPage = AUTH_PAGES.has(normalizedPathname);
  const [ownerKey, setOwnerKey] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isAuthPage) return;
    let disposed = false;
    let requestGeneration = 0;
    const validate = async () => {
      const request = ++requestGeneration;
      try {
        const sharedOwnerAtStart = window.localStorage.getItem(BROWSER_OWNER_KEY);
        const response = await fetch('/api/users/me', { cache: 'no-store' });
        const user = await response.json().catch(() => ({}));
        if (disposed || request !== requestGeneration) return;
        if (window.localStorage.getItem(BROWSER_OWNER_KEY) !== sharedOwnerAtStart) return;
        if (!response.ok || typeof user.id !== 'string' || !user.id) {
          setOwnerKey(null);
          invalidateBrowserOwner();
          if (response.status === 401 || response.status === 403) {
            window.location.replace('/login');
          } else {
            setError('账号验证暂不可用，请重试');
          }
          return;
        }
        if (getBrowserOwner()?.ownerId !== user.id) setBrowserOwner(user.id);
        const owner = getBrowserOwner();
        if (!owner) throw new Error('浏览器存储不可用，无法安全加载本地资料');
        setOwnerKey(owner.ownerId + ':' + owner.sessionKey + ':' + owner.generation);
        setError('');
      } catch (failure) {
        if (disposed || request !== requestGeneration) return;
        setOwnerKey(null);
        invalidateBrowserOwner();
        setError(failure instanceof Error ? failure.message : '账号验证失败');
      }
    };
    const ownerChanged = () => {
      requestGeneration++;
      setOwnerKey(null);
    };
    const storageChanged = (event: StorageEvent) => {
      if (event.key !== BROWSER_OWNER_KEY || getBrowserOwner()) return;
      ownerChanged();
      invalidateBrowserOwner();
      window.location.reload();
    };
    const focused = () => { void validate(); };
    window.addEventListener(BROWSER_OWNER_EVENT, ownerChanged);
    window.addEventListener('storage', storageChanged);
    window.addEventListener('focus', focused);
    void validate();
    return () => {
      disposed = true;
      window.removeEventListener(BROWSER_OWNER_EVENT, ownerChanged);
      window.removeEventListener('storage', storageChanged);
      window.removeEventListener('focus', focused);
    };
  }, [isAuthPage]);

  // Auth pages render without the shell (full-screen split layout)
  if (isAuthPage) {
    return <>{children}</>;
  }

  const currentOwner = getBrowserOwner();
  const currentOwnerKey = currentOwner ? currentOwner.ownerId + ':' + currentOwner.sessionKey + ':' + currentOwner.generation : null;
  if (!ownerKey || ownerKey !== currentOwnerKey) {
    return <main className="flex min-h-screen items-center justify-center">
      {error ? <div role="alert">{error}<button type="button" onClick={() => window.location.reload()} className="ml-3 underline">重试</button></div> : <p role="status">正在验证账号并加载资料…</p>}
    </main>;
  }
  return <WorkbenchShell key={ownerKey}>{children}</WorkbenchShell>;
}
