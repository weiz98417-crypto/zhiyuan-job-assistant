'use client';

import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import AppShell from './AppShell';

export default function AuthGate({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  // Auth pages render without AppShell (full-screen split layout)
  if (pathname === '/login' || pathname === '/register') {
    return <>{children}</>;
  }

  return <AppShell>{children}</AppShell>;
}
