import { NextRequest, NextResponse } from 'next/server';

type Endpoint = {
  path: RegExp;
  methods: Record<string, { query?: string[]; fields?: string[]; encrypted?: boolean }>;
};

const uuid = '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}';
const conversation = `chat/conversations/${uuid}`;
const endpoints: Endpoint[] = [
  { path: /^users\/me$/, methods: {
    GET: {}, PATCH: { fields: ['display_name', 'bio', 'phone_number', 'gender'] },
  } },
  { path: /^users\/me\/complete-profile$/, methods: {
    POST: { fields: ['display_name', 'bio', 'gender'] },
  } },
  { path: /^chat\/conversations$/, methods: {
    GET: { query: ['include_archived', 'page', 'page_size'] },
    POST: { fields: ['participant_id'] },
  } },
  { path: new RegExp(`^${conversation}$`), methods: { GET: {} } },
  { path: new RegExp(`^${conversation}/settings$`), methods: {
    PATCH: { fields: ['is_muted', 'is_archived', 'is_pinned'] },
  } },
  { path: new RegExp(`^${conversation}/messages$`), methods: {
    GET: { query: ['before_id', 'limit'] },
    POST: { fields: ['encrypted_content', 'encryption_nonce', 'message_type', 'reply_to_id'], encrypted: true },
  } },
  { path: new RegExp(`^${conversation}/messages/${uuid}$`), methods: {
    PATCH: { fields: ['encrypted_content', 'encryption_nonce'], encrypted: true }, DELETE: {},
  } },
  { path: new RegExp(`^${conversation}/messages/${uuid}/reactions$`), methods: {
    POST: { fields: ['emoji'] },
  } },
  { path: /^chat\/keys\/me$/, methods: { PUT: { fields: ['public_key'] } } },
  { path: new RegExp(`^chat/keys/${uuid}$`), methods: { GET: {} } },
];

function json(data: unknown, status: number) {
  return NextResponse.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
}

function upstreamMessage(data: unknown): string {
  if (!data || typeof data !== 'object') return 'Unable to complete your request.';
  const { detail, message } = data as Record<string, unknown>;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) {
    return detail.map(item => typeof item?.msg === 'string' ? item.msg : 'Invalid value.').join(' ');
  }
  if (detail && typeof detail === 'object' && 'message' in detail && typeof detail.message === 'string') return detail.message;
  return typeof message === 'string' ? message : 'Unable to complete your request.';
}

async function handle(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path: segments } = await context.params;
  // Never accept a client-selected upstream URL, account-admin endpoint, or path traversal.
  if (segments.some(segment => !/^[a-zA-Z0-9-]+$/.test(segment))) return json({ message: 'Not found.' }, 404);
  const path = segments.join('/');
  const endpoint = endpoints.find(item => item.path.test(path));
  if (!endpoint) return json({ message: 'Not found.' }, 404);
  const options = endpoint.methods[request.method];
  if (!options) return json({ message: 'Method not allowed.' }, 405);

  const origin = request.headers.get('origin');
  const expectedOrigin = process.env.FRONTEND_ORIGIN || `${request.nextUrl.protocol}//${request.headers.get('host') || request.nextUrl.host}`;
  // Message reads also mark messages as read in FastAPI, so reject cross-site GETs too.
  if (request.headers.get('sec-fetch-site') === 'cross-site' ||
      (origin !== null && origin !== expectedOrigin) ||
      (request.method !== 'GET' && origin !== expectedOrigin)) {
    return json({ message: 'Invalid request origin.' }, 403);
  }
  const token = request.cookies.get('rmf_access')?.value;
  if (!token) return json({ message: 'Please sign in to continue.' }, 401);

  const query = new URLSearchParams();
  for (const [key, value] of request.nextUrl.searchParams) {
    if (!options.query?.includes(key) || query.has(key)) return json({ message: 'Invalid query parameters.' }, 400);
    query.set(key, value);
  }

  let body: string | undefined;
  if (options.fields) {
    if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') {
      return json({ message: 'Send a JSON request body.' }, 415);
    }
    let data: unknown;
    try { data = await request.json(); } catch { return json({ message: 'Invalid JSON request body.' }, 400); }
    if (!data || typeof data !== 'object' || Array.isArray(data)) return json({ message: 'Send a JSON object.' }, 400);
    const payload = data as Record<string, unknown>;
    if (Object.keys(payload).some(key => !options.fields!.includes(key))) return json({ message: 'Unsupported request fields.' }, 400);
    // This validates the transport contract; encryption itself belongs in the browser.
    if (options.encrypted && (
      typeof payload.encrypted_content !== 'string' || !payload.encrypted_content.length ||
      typeof payload.encryption_nonce !== 'string' || !payload.encryption_nonce.length
    )) return json({ message: 'Encrypted content and a nonce are required.' }, 400);
    body = JSON.stringify(payload);
  }

  try {
    const base = (process.env.BACKEND_API_URL || 'http://127.0.0.1:8000/api/v1').replace(/\/$/, '');
    const suffix = query.size ? `?${query}` : '';
    const upstream = await fetch(`${base}/${path}${suffix}`, {
      method: request.method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        'User-Agent': request.headers.get('user-agent') || 'Roommate Finder',
      },
      body, cache: 'no-store', redirect: 'manual', signal: AbortSignal.timeout(15000),
    });
    if (upstream.status >= 500 || (upstream.status >= 300 && upstream.status < 400)) {
      return json({ message: 'The server is unavailable. Please try again.' }, 502);
    }
    if (upstream.status === 204) return new NextResponse(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
    const data: unknown = await upstream.json();
    const response = json(upstream.ok ? data : { message: upstreamMessage(data) }, upstream.status);
    if (upstream.status === 429 && upstream.headers.has('retry-after')) {
      response.headers.set('Retry-After', upstream.headers.get('retry-after')!);
    }
    return response;
  } catch {
    return json({ message: 'Unable to reach the server. Please try again.' }, 502);
  }
}

export { handle as GET, handle as POST, handle as PATCH, handle as PUT, handle as DELETE };
