import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const headers = { 'Cache-Control': 'no-store' };
  const query = new URLSearchParams();
  const allowed = new Set(['city', 'area', 'property_type', 'page', 'page_size']);
  for (const [key, value] of request.nextUrl.searchParams) {
    if (!allowed.has(key) || query.has(key)) return NextResponse.json({ message: 'Invalid search parameters.' }, { status: 400, headers });
    query.set(key, value);
  }
  try {
    const base = (process.env.BACKEND_API_URL || 'http://127.0.0.1:8000/api/v1').replace(/\/$/, '');
    const response = await fetch(`${base}/listings/public?${query}`, {
      headers: { Accept: 'application/json' }, cache: 'no-store', redirect: 'manual', signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) return NextResponse.json({ message: response.status === 422 ? 'Please check your search filters.' : 'Unable to load listings. Please try again.' }, { status: response.status === 422 ? 422 : 502, headers });
    const data = await response.json();
    if (!Array.isArray(data.items) || !Number.isInteger(data.total) || !Number.isInteger(data.pages)) throw new Error('Invalid listing response');
    return NextResponse.json(data, { headers });
  } catch {
    return NextResponse.json({ message: 'Unable to load listings. Please try again.' }, { status: 502, headers });
  }
}
