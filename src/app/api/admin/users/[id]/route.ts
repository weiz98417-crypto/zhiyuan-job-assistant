import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getDataRepositories } from '@/lib/data-repositories';
import { requireAdmin } from '@/lib/security/auth-guards';
import { getTrustedSourceIp, getUserAgentDigest } from '@/lib/security/request-identity';
import { getStepUpStore } from '@/lib/security/step-up-store';
import { sendSecurityAlert } from '@/lib/security/security-alerts';
import { recordFailedStepUp } from '@/lib/security/step-up-monitor';

function authGuardResponse(error: unknown): NextResponse | null {
  const candidate = error as { status?: unknown; code?: unknown; message?: unknown };
  if (candidate.status === 401 || candidate.status === 403) {
    return NextResponse.json(
      {
        error: typeof candidate.message === 'string' ? candidate.message : 'Unauthorized',
        code: typeof candidate.code === 'string' ? candidate.code : 'UNAUTHORIZED',
      },
      { status: candidate.status },
    );
  }
  return null;
}

async function requireUserManagementStepUp(
  request: NextRequest,
  actor: { userId: string; tokenVersion: number; role: string },
): Promise<NextResponse | null> {
  const rawToken = request.cookies.get('auth_step_up')?.value;
  if (!rawToken) {
    await recordFailedStepUp({
      request,
      actor,
      purpose: 'admin_user_management',
      reasonCode: 'STEP_UP_REQUIRED',
    });
    return NextResponse.json(
      { error: 'Recent authentication is required', code: 'STEP_UP_REQUIRED' },
      { status: 403 },
    );
  }
  const consumed = await getStepUpStore().consume({
    rawToken,
    userId: actor.userId,
    tokenVersion: actor.tokenVersion,
    purpose: 'admin_user_management',
    sourceIp: getTrustedSourceIp(request),
    userAgentDigest: getUserAgentDigest(request),
  });
  if (!consumed.ok) {
    await recordFailedStepUp({
      request,
      actor,
      purpose: 'admin_user_management',
      reasonCode: consumed.reason,
    });
    return NextResponse.json(
      { error: 'Step-up evidence is invalid or expired', code: consumed.reason },
      { status: 403 },
    );
  }
  return null;
}

async function recordDeniedAdminMutation(input: {
  request: NextRequest;
  actor: { userId: string; role: string };
  targetUserId: string;
  eventType: 'role_change' | 'status_change' | 'user_delete';
  reasonCode: string;
  metadata?: Record<string, unknown>;
}) {
  const event = {
    id: crypto.randomUUID(),
    eventType: input.eventType,
    actorUserId: input.actor.userId,
    targetUserId: input.targetUserId,
    actorRole: input.actor.role,
    outcome: 'failure',
    reasonCode: input.reasonCode,
    requestId: crypto.randomUUID(),
    sourceIp: getTrustedSourceIp(input.request),
    userAgent: input.request.headers.get('user-agent') || undefined,
    metadata: input.metadata || {},
  };
  await getDataRepositories().securityEvents.append(event);
  await sendSecurityAlert(event);
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const payload = await requireAdmin();
    const { id } = await params;
    const body = await request.json();
    if (body.status && body.role) {
      return NextResponse.json(
        { error: '一次只能修改一个安全属性', code: 'AMBIGUOUS_USER_MUTATION' },
        { status: 400 },
      );
    }
    const repos = getDataRepositories();
    const user = await repos.users.findById(id);
    if (!user) {
      return NextResponse.json({ error: '用户不存在' }, { status: 404 });
    }

    if (body.role) {
      if (payload.role !== 'superadmin') {
        await recordDeniedAdminMutation({
          request,
          actor: payload,
          targetUserId: id,
          eventType: 'role_change',
          reasonCode: 'SUPERADMIN_REQUIRED',
          metadata: { targetRole: user.role, requestedRole: body.role },
        });
        return NextResponse.json(
          { error: '仅超级管理员可以修改用户角色', code: 'SUPERADMIN_REQUIRED' },
          { status: 403 },
        );
      }
      if (id === payload.userId) {
        await recordDeniedAdminMutation({
          request,
          actor: payload,
          targetUserId: id,
          eventType: 'role_change',
          reasonCode: 'SELF_ROLE_CHANGE_FORBIDDEN',
          metadata: { targetRole: user.role, requestedRole: body.role },
        });
        return NextResponse.json(
          { error: '不能通过管理接口修改自己的角色', code: 'SELF_ROLE_CHANGE_FORBIDDEN' },
          { status: 400 },
        );
      }
      if (!['member', 'admin', 'superadmin'].includes(body.role)) {
        return NextResponse.json(
          { error: '无效角色', code: 'INVALID_ROLE' },
          { status: 400 },
        );
      }
      const stepUpResponse = await requireUserManagementStepUp(request, payload);
      if (stepUpResponse) return stepUpResponse;
      const roleEvent = {
        id: crypto.randomUUID(),
        eventType: 'role_change',
        actorUserId: payload.userId,
        targetUserId: id,
        actorRole: payload.role,
        outcome: 'success',
        requestId: crypto.randomUUID(),
        sourceIp: getTrustedSourceIp(request),
        userAgent: request.headers.get('user-agent') || undefined,
        metadata: {
          oldRole: user.role,
          newRole: body.role,
          reason: typeof body.reason === 'string' ? body.reason.slice(0, 500) : '',
        },
      };
      const result = await repos.users.updateRoleWithAudit({
        userId: id,
        role: body.role,
        event: roleEvent,
      });
      if (!result.ok) {
        if (result.reason === 'LAST_ACTIVE_SUPERADMIN') {
          await sendSecurityAlert({ ...roleEvent, outcome: 'failure', reasonCode: result.reason });
        }
        const status = result.reason === 'LAST_ACTIVE_SUPERADMIN' ? 409 : 404;
        return NextResponse.json(
          { error: result.reason, code: result.reason },
          { status },
        );
      }
      await sendSecurityAlert(roleEvent);
    } else if (body.status) {
      if (!['pending', 'active', 'rejected'].includes(body.status)) {
        return NextResponse.json(
          { error: '无效账户状态', code: 'INVALID_USER_STATUS' },
          { status: 400 },
        );
      }
      if ((user.role === 'admin' || user.role === 'superadmin') && payload.role !== 'superadmin') {
        await recordDeniedAdminMutation({
          request,
          actor: payload,
          targetUserId: id,
          eventType: 'status_change',
          reasonCode: 'SUPERADMIN_REQUIRED',
          metadata: { targetRole: user.role, requestedStatus: body.status },
        });
        return NextResponse.json(
          { error: '仅超级管理员可以修改特权账户状态', code: 'SUPERADMIN_REQUIRED' },
          { status: 403 },
        );
      }
      if (id === payload.userId) {
        await recordDeniedAdminMutation({
          request,
          actor: payload,
          targetUserId: id,
          eventType: 'status_change',
          reasonCode: 'SELF_STATUS_CHANGE_FORBIDDEN',
          metadata: { targetRole: user.role, requestedStatus: body.status },
        });
        return NextResponse.json(
          { error: '不能通过管理接口修改自己的账户状态', code: 'SELF_STATUS_CHANGE_FORBIDDEN' },
          { status: 400 },
        );
      }
      if (user.role === 'admin' || user.role === 'superadmin') {
        const stepUpResponse = await requireUserManagementStepUp(request, payload);
        if (stepUpResponse) return stepUpResponse;
      }
      const statusEvent = {
        id: crypto.randomUUID(),
        eventType: 'status_change',
        actorUserId: payload.userId,
        targetUserId: id,
        actorRole: payload.role,
        outcome: 'success',
        requestId: crypto.randomUUID(),
        sourceIp: getTrustedSourceIp(request),
        userAgent: request.headers.get('user-agent') || undefined,
        metadata: {
          oldStatus: user.status,
          newStatus: body.status,
          reason: typeof body.reason === 'string' ? body.reason.slice(0, 500) : '',
        },
      };
      const result = await repos.users.updateStatusWithAudit({
        userId: id,
        status: body.status,
        approvedBy: payload.userId,
        event: statusEvent,
      });
      if (!result.ok) {
        if (result.reason === 'LAST_ACTIVE_SUPERADMIN') {
          await sendSecurityAlert({ ...statusEvent, outcome: 'failure', reasonCode: result.reason });
        }
        const status = result.reason === 'LAST_ACTIVE_SUPERADMIN' ? 409 : 404;
        return NextResponse.json(
          { error: result.reason, code: result.reason },
          { status },
        );
      }
      if (user.role === 'admin' || user.role === 'superadmin') {
        await sendSecurityAlert(statusEvent);
      }
    } else {
      return NextResponse.json(
        { error: '没有可执行的用户变更', code: 'USER_MUTATION_REQUIRED' },
        { status: 400 },
      );
    }

    const updated = await repos.users.findById(id) as Record<string, unknown>;
    return NextResponse.json({
      user: {
        id: updated.id,
        username: updated.username,
        displayName: updated.display_name,
        email: updated.email,
        role: updated.role,
        status: updated.status,
        createdAt: updated.created_at,
      },
    });
  } catch (err) {
    const authResponse = authGuardResponse(err);
    if (authResponse) return authResponse;
    console.error('[admin/users/[id]]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

export async function POST(
  _request: NextRequest,
  _context: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin();
    return NextResponse.json(
      {
        error: '旧密码重置接口已停用，请使用二次认证后的密码重置流程',
        code: 'LEGACY_PASSWORD_RESET_DISABLED',
      },
      { status: 410 },
    );
  } catch (err) {
    const authResponse = authGuardResponse(err);
    if (authResponse) return authResponse;
    console.error('[admin/users/[id] POST]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const payload = await requireAdmin();
    const { id } = await params;

    // Cannot delete self
    if (id === payload.userId) {
      await recordDeniedAdminMutation({
        request,
        actor: payload,
        targetUserId: id,
        eventType: 'user_delete',
        reasonCode: 'SELF_DELETE_FORBIDDEN',
        metadata: { targetRole: payload.role },
      });
      return NextResponse.json(
        { error: '不能删除自己的账户', code: 'SELF_DELETE_FORBIDDEN' },
        { status: 400 },
      );
    }

    const repos = getDataRepositories();
    const user = await repos.users.findById(id);
    if (!user) {
      return NextResponse.json({ error: '用户不存在' }, { status: 404 });
    }

    if ((user.role === 'admin' || user.role === 'superadmin') && payload.role !== 'superadmin') {
      await recordDeniedAdminMutation({
        request,
        actor: payload,
        targetUserId: id,
        eventType: 'user_delete',
        reasonCode: 'SUPERADMIN_REQUIRED',
        metadata: { targetRole: user.role, targetStatus: user.status },
      });
      return NextResponse.json(
        { error: '仅超级管理员可以删除特权账户', code: 'SUPERADMIN_REQUIRED' },
        { status: 403 },
      );
    }

    if (user.role === 'admin' || user.role === 'superadmin') {
      const stepUpResponse = await requireUserManagementStepUp(request, payload);
      if (stepUpResponse) return stepUpResponse;
    }

    const deleteEvent = {
      id: crypto.randomUUID(),
      eventType: 'user_delete',
      actorUserId: payload.userId,
      targetUserId: id,
      actorRole: payload.role,
      outcome: 'success',
      requestId: crypto.randomUUID(),
      sourceIp: getTrustedSourceIp(request),
      userAgent: request.headers.get('user-agent') || undefined,
      metadata: { targetRole: user.role, targetStatus: user.status },
    };
    const result = await repos.users.deleteWithAudit({
      userId: id,
      event: deleteEvent,
    });
    if (!result.ok) {
      if (result.reason === 'LAST_ACTIVE_SUPERADMIN') {
        await sendSecurityAlert({ ...deleteEvent, outcome: 'failure', reasonCode: result.reason });
      }
      const status = result.reason === 'LAST_ACTIVE_SUPERADMIN' ? 409 : 404;
      return NextResponse.json(
        { error: result.reason, code: result.reason },
        { status },
      );
    }

    if (user.role === 'admin' || user.role === 'superadmin') {
      await sendSecurityAlert(deleteEvent);
    }

    return NextResponse.json({ message: `用户 ${result.username} 已删除` });
  } catch (err) {
    const authResponse = authGuardResponse(err);
    if (authResponse) return authResponse;
    console.error('[admin/users/[id] DELETE]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
