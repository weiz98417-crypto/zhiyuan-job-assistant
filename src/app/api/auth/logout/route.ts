import { NextResponse } from 'next/server';

export async function POST() {
  const response = NextResponse.json({ message: '已退出' });
  response.cookies.set('auth_token', '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0, // expire immediately
  });
  return response;
}
