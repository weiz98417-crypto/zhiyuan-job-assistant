import {
  getCurrentUser,
  verifyTokenVersion,
  type JWTPayload,
} from '@/lib/auth';

export class AuthGuardError extends Error {
  constructor(
    public readonly status: 401 | 403,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'AuthGuardError';
  }
}

const AUTHENTICATION_ERRORS = new Set([
  'Not authenticated',
  'Invalid or expired token',
  'Token has been revoked',
]);

export async function requireAuthenticated(): Promise<JWTPayload> {
  try {
    const payload = await getCurrentUser();
    await verifyTokenVersion(payload);
    return payload;
  } catch (error) {
    if (AUTHENTICATION_ERRORS.has((error as Error).message)) {
      throw new AuthGuardError(401, 'UNAUTHORIZED', (error as Error).message);
    }
    throw error;
  }
}

export async function requireAdmin(): Promise<JWTPayload> {
  const payload = await requireAuthenticated();
  if (payload.role !== 'admin' && payload.role !== 'superadmin') {
    throw new AuthGuardError(403, 'FORBIDDEN', 'Forbidden');
  }
  return payload;
}

export async function requireSuperadmin(): Promise<JWTPayload> {
  const payload = await requireAuthenticated();
  if (payload.role !== 'superadmin') {
    throw new AuthGuardError(403, 'SUPERADMIN_REQUIRED', 'Forbidden');
  }
  return payload;
}
