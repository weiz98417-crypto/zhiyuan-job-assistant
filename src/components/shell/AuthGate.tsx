'use client';

import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import AppShell from './AppShell';
import { installCsrfFetch } from '@/lib/security/csrf-fetch';

const AUTH_PAGES = new Set([
  '/login',
  '/register',
  '/forgot-password',
  '/change-password',
]);

export default function AuthGate({ children }: { children: ReactNode }) {
  installCsrfFetch();
  const pathname = usePathname();

  // Auth pages render without AppShell (full-screen split layout)
  if (AUTH_PAGES.has(pathname)) {
    return <>{children}</>;
  }

  return <AppShell>{children}</AppShell>;
}
