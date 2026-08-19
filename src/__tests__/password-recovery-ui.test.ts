import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

const source = (relativePath: string) => fs.readFileSync(
  path.join(process.cwd(), relativePath),
  'utf8',
);

describe('password recovery and password change entry points', () => {
  it('links login to the public recovery page', () => {
    const login = source('src/app/login/page.tsx');
    expect(login).toContain('href="/forgot-password"');
    expect(login).toContain('忘记密码');
  });

  it('lets authenticated users reach password change from settings', () => {
    const settings = source('src/app/settings/page.tsx');
    expect(settings).toContain("router.push('/change-password')");
    expect(settings).toContain('修改密码');
  });

  it('shows pending recovery state in superadmin user management', () => {
    const usersPage = source('src/app/admin/users/page.tsx');
    expect(usersPage).toContain('passwordRecovery');
    expect(usersPage).toContain('处理找回');
  });

  it('renders recovery and forced password change without the authenticated app shell', () => {
    const authGate = source('src/components/shell/AuthGate.tsx');

    expect(authGate).toContain("'/forgot-password'");
    expect(authGate).toContain("'/change-password'");
    expect(authGate).toContain("pathname.replace(/\\/+$/, '')");
    expect(authGate).toContain('AUTH_PAGES.has(normalizedPathname)');
  });

  it('keeps password recovery focused and free of the promotional side panel', () => {
    const recoveryPage = source('src/app/forgot-password/page.tsx');

    expect(recoveryPage).not.toContain('AuthHero');
    expect(recoveryPage).not.toContain('lg:grid-cols-2');
    expect(recoveryPage).toContain('max-w-[420px]');
  });
});
