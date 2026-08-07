import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

const source = (relativePath: string) => fs.readFileSync(
  path.join(process.cwd(), relativePath),
  'utf8',
);

describe('authentication security administration UI', () => {
  it('shows all administration links to admins and reserves the audit view for superadmins', () => {
    const shell = source('src/components/shell/AppShell.tsx');

    expect(shell).toContain("'admin' | 'member' | 'superadmin'");
    expect(shell).toContain("user.role === 'admin' || user.role === 'superadmin'");
    expect(shell).toContain('href="/admin/security-events"');
    expect(shell).toContain("user.role === 'superadmin'");
  });

  it('uses step-up and generated temporary passwords instead of arbitrary admin passwords', () => {
    const usersPage = source('src/app/admin/users/page.tsx');

    expect(usersPage).toContain("'/api/auth/step-up'");
    expect(usersPage).toContain('/password-reset`');
    expect(usersPage).toContain('temporaryPassword');
    expect(usersPage).toContain("superadmin: '超级管理员'");
    expect(usersPage).not.toContain('newPassword');
    expect(usersPage).not.toContain("prompt('输入新密码");
  });

  it('loads the superadmin security event API with server-side filters', () => {
    const eventsPage = source('src/app/admin/security-events/page.tsx');

    expect(eventsPage).toContain('/api/admin/security-events?');
    expect(eventsPage).toContain('eventType');
    expect(eventsPage).toContain('outcome');
  });
});
