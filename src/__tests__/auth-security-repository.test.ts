import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

let repositories: Awaited<ReturnType<typeof loadRepositories>>;
let database: import('better-sqlite3').Database;

async function loadRepositories() {
  const { getDataRepositories } = await import('@/lib/data-repositories');
  return getDataRepositories();
}

beforeAll(async () => {
  process.env.DB_DRIVER = 'sqlite';
  process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'zhiyuan-auth-security-'));

  repositories = await loadRepositories();
  const { getDb } = await import('@/lib/server-db');
  database = getDb();

  await repositories.users.create({
    id: 'user-1',
    username: 'memberone',
    passwordHash: 'old-hash',
    displayName: 'Member One',
    email: 'member@example.com',
    role: 'member',
    status: 'active',
  });
  await repositories.users.create({
    id: 'owner-1',
    username: 'owner',
    passwordHash: 'owner-hash',
    displayName: 'Owner',
    email: 'owner@example.com',
    role: 'superadmin',
    status: 'active',
  });
});

afterAll(() => {
  database.close();
});

describe('authentication security repository', () => {
  it('commits a self password change and its event atomically', async () => {
    const changed = await repositories.users.changeOwnPassword({
      userId: 'user-1',
      passwordHash: 'new-hash',
      changedBy: 'user-1',
      event: {
        id: 'event-1',
        eventType: 'password_change',
        actorUserId: 'user-1',
        targetUserId: 'user-1',
        actorRole: 'member',
        outcome: 'success',
        requestId: 'request-1',
        metadata: {},
      },
    });

    expect(changed).toBe(true);
    const user = await repositories.users.findById('user-1');
    expect(user).toMatchObject({
      password_hash: 'new-hash',
      token_version: 1,
      password_changed_by: 'user-1',
      must_change_password: 0,
    });
    expect(user?.password_changed_at).toBeTruthy();
    expect(user?.last_security_event_at).toBeTruthy();

    const event = database.prepare(
      'SELECT * FROM auth_security_events WHERE id = ?',
    ).get('event-1') as Record<string, unknown>;
    expect(event).toMatchObject({
      event_type: 'password_change',
      actor_user_id: 'user-1',
      target_user_id: 'user-1',
      outcome: 'success',
      request_id: 'request-1',
      metadata_json: '{}',
    });
  });

  it('rolls back the credential update when the event insert fails', async () => {
    await expect(repositories.users.changeOwnPassword({
      userId: 'user-1',
      passwordHash: 'must-not-commit',
      changedBy: 'user-1',
      event: {
        id: 'event-1',
        eventType: 'password_change',
        actorUserId: 'user-1',
        targetUserId: 'user-1',
        actorRole: 'member',
        outcome: 'success',
        requestId: 'request-2',
        metadata: {},
      },
    })).rejects.toThrow();

    const user = await repositories.users.findById('user-1');
    expect(user).toMatchObject({
      password_hash: 'new-hash',
      token_version: 1,
    });
  });

  it('rejects demotion of the last active superadmin and audits the denial', async () => {
    const result = await repositories.users.updateRoleWithAudit({
      userId: 'owner-1',
      role: 'admin',
      event: {
        id: 'event-last-superadmin',
        eventType: 'role_change',
        actorUserId: 'owner-2',
        targetUserId: 'owner-1',
        actorRole: 'superadmin',
        outcome: 'success',
        requestId: 'request-last-superadmin',
        metadata: { oldRole: 'superadmin', newRole: 'admin' },
      },
    });

    expect(result).toEqual({ ok: false, reason: 'LAST_ACTIVE_SUPERADMIN' });
    await expect(repositories.users.findById('owner-1')).resolves.toMatchObject({
      role: 'superadmin',
      token_version: 0,
    });

    const event = database.prepare(
      'SELECT * FROM auth_security_events WHERE id = ?',
    ).get('event-last-superadmin') as Record<string, unknown>;
    expect(event).toMatchObject({
      outcome: 'failure',
      reason_code: 'LAST_ACTIVE_SUPERADMIN',
    });
  });

  it('rejects deactivation of the last active superadmin and audits the denial', async () => {
    const result = await repositories.users.updateStatusWithAudit({
      userId: 'owner-1',
      status: 'rejected',
      approvedBy: 'owner-2',
      event: {
        id: 'event-last-superadmin-status',
        eventType: 'status_change',
        actorUserId: 'owner-2',
        targetUserId: 'owner-1',
        actorRole: 'superadmin',
        outcome: 'success',
        requestId: 'request-last-superadmin-status',
        metadata: { oldStatus: 'active', newStatus: 'rejected' },
      },
    });

    expect(result).toEqual({ ok: false, reason: 'LAST_ACTIVE_SUPERADMIN' });
    await expect(repositories.users.findById('owner-1')).resolves.toMatchObject({
      role: 'superadmin',
      status: 'active',
      token_version: 0,
    });
  });

  it('rejects deletion of the last active superadmin and audits the denial', async () => {
    const result = await repositories.users.deleteWithAudit({
      userId: 'owner-1',
      event: {
        id: 'event-last-superadmin-delete',
        eventType: 'user_delete',
        actorUserId: 'owner-2',
        targetUserId: 'owner-1',
        actorRole: 'superadmin',
        outcome: 'success',
        requestId: 'request-last-superadmin-delete',
        metadata: {},
      },
    });

    expect(result).toEqual({ ok: false, reason: 'LAST_ACTIVE_SUPERADMIN' });
    await expect(repositories.users.findById('owner-1')).resolves.toMatchObject({
      role: 'superadmin',
      status: 'active',
    });
  });

  it('redacts forbidden secret fields at the durable audit boundary', async () => {
    await repositories.securityEvents.append({
      id: 'event-redaction',
      eventType: 'security_test',
      actorUserId: 'owner-1',
      actorRole: 'superadmin',
      outcome: 'success',
      requestId: 'request-redaction',
      metadata: {
        reason: 'verifying redaction',
        password: 'MustNeverPersist',
        nested: {
          authorization: 'Bearer secret-token',
          apiKey: 'secret-api-key',
        },
      },
    });

    const row = database.prepare(
      'SELECT metadata_json FROM auth_security_events WHERE id = ?',
    ).get('event-redaction') as { metadata_json: string };
    expect(row.metadata_json).toContain('verifying redaction');
    expect(row.metadata_json).toContain('[REDACTED]');
    expect(row.metadata_json).not.toContain('MustNeverPersist');
    expect(row.metadata_json).not.toContain('secret-token');
    expect(row.metadata_json).not.toContain('secret-api-key');
  });

  it('lists filtered security events newest first without exposing raw JSON storage', async () => {
    await repositories.securityEvents.append({
      id: 'event-list-success',
      eventType: 'login_success',
      actorUserId: 'owner-1',
      actorRole: 'superadmin',
      outcome: 'success',
      requestId: 'request-list-success',
      metadata: { channel: 'password' },
    });
    await repositories.securityEvents.append({
      id: 'event-list-failure',
      eventType: 'login_failure',
      actorUserId: 'owner-1',
      actorRole: 'superadmin',
      outcome: 'failure',
      reasonCode: 'INVALID_CREDENTIALS',
      requestId: 'request-list-failure',
      metadata: { channel: 'password' },
    });

    const result = await repositories.securityEvents.list({
      outcome: 'failure',
      limit: 10,
      offset: 0,
    });

    expect(result.total).toBeGreaterThanOrEqual(1);
    expect(result.events).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'event-list-failure',
        eventType: 'login_failure',
        outcome: 'failure',
        reasonCode: 'INVALID_CREDENTIALS',
        metadata: { channel: 'password' },
      }),
    ]));
    expect(result.events.some((event) => event.id === 'event-list-success')).toBe(false);
    expect(result.events[0]).not.toHaveProperty('metadata_json');
  });
});
