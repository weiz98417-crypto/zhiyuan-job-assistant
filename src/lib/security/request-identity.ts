import crypto from 'crypto';
import type { NextRequest } from 'next/server';

export function getTrustedSourceIp(request: NextRequest): string {
  return request.headers.get('x-real-ip')?.trim() || 'unknown';
}

export function getUserAgentDigest(request: NextRequest): string {
  return crypto.createHash('sha256')
    .update(request.headers.get('user-agent') || '')
    .digest('hex');
}
