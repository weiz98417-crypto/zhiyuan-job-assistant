import { NextRequest, NextResponse } from 'next/server';
import { shouldUseSecureAuthCookie } from '@/lib/auth-cookie';

export async function POST(request: NextRequest) {
  const response = NextResponse.json({ message: '已退出' });
  response.cookies.set('auth_token', '', {
    httpOnly: true,
    secure: shouldUseSecureAuthCookie(request),
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
  return response;
}
