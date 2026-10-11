import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  const origin = process.env.FRONTEND_ORIGIN || `${request.nextUrl.protocol}//${request.headers.get('host') || request.nextUrl.host}`;
  const respond = (message: string, status: number) => NextResponse.json({ message }, { status, headers: { 'Cache-Control': 'no-store' } });
  if (request.headers.get('origin') !== origin || request.headers.get('sec-fetch-site') === 'cross-site') return respond('Invalid request origin.', 403);
  const access = request.cookies.get('rmf_access')?.value;
  const refresh = request.cookies.get('rmf_refresh')?.value;
  if (access && refresh) {
    try {
      const base = (process.env.BACKEND_API_URL || 'http://127.0.0.1:8000/api/v1').replace(/\/$/, '');
      const result = await fetch(`${base}/auth/logout`, { method: 'POST', headers: { Authorization: `Bearer ${access}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refresh, all_devices: false }), cache: 'no-store', redirect: 'manual', signal: AbortSignal.timeout(15000) });
      if (!result.ok && result.status !== 401) return respond('Unable to sign out. Please try again.', 502);
    } catch { return respond('Unable to reach the server. Please try again.', 502); }
  }
  const response = respond('Signed out.', 200);
  for (const name of ['rmf_access', 'rmf_refresh', 'rmf_verification_email']) response.cookies.set(name, '', { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 0 });
  return response;
}
