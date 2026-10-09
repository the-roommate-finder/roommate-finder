import { NextRequest, NextResponse } from 'next/server';
const actions = new Set(['register', 'login', 'verify-email', 'forgot-password']);
function errorMessage(data: Record<string, unknown>): string {
  if (typeof data.detail === 'string') return data.detail;
  if (data.detail && typeof data.detail === 'object' && 'message' in data.detail) return String(data.detail.message);
  if (Array.isArray(data.details)) return data.details.map((item: { message: string }) => item.message).join(' ');
  return typeof data.message === 'string' ? data.message : 'Unable to complete your request.';
}
export async function POST(request: NextRequest, { params }: { params: Promise<{ action: string }> }) {
  const { action } = await params;
  if (!actions.has(action)) return NextResponse.json({ message: 'Not found.' }, { status: 404 });
  const expectedOrigin = process.env.FRONTEND_ORIGIN || `${request.nextUrl.protocol}//${request.headers.get('host') || request.nextUrl.host}`;
  if (request.headers.get('origin') !== expectedOrigin) return NextResponse.json({ message: 'Invalid request origin.' }, { status: 403 });
  try {
    const body = await request.json();
    const base = process.env.BACKEND_API_URL || 'http://127.0.0.1:8000/api/v1';
    const upstream = await fetch(`${base}/auth/${action}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'User-Agent': request.headers.get('user-agent') || 'Roommate Finder' },
      body: JSON.stringify(body), cache: 'no-store', signal: AbortSignal.timeout(15000),
    });
    const data = await upstream.json();
    if (!upstream.ok) return NextResponse.json({ message: errorMessage(data) }, { status: upstream.status });
    const { access_token, refresh_token, ...publicData } = data;
    const response = NextResponse.json(publicData, { status: upstream.status, headers: { 'Cache-Control': 'no-store' } });
    if (access_token && refresh_token) {
      const options = { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax' as const, path: '/' };
      response.cookies.set('rmf_access', access_token, { ...options, maxAge: data.expires_in });
      response.cookies.set('rmf_refresh', refresh_token, { ...options, maxAge: 7 * 24 * 3600 });
    }
    return response;
  } catch { return NextResponse.json({ message: 'Unable to reach the server. Please try again.' }, { status: 502 }); }
}
