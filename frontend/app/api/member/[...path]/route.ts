import { NextRequest, NextResponse } from 'next/server';

type Endpoint = {
  path: RegExp;
  methods: Record<string, { query?: string[]; fields?: string[]; encrypted?: boolean; upload?: boolean }>;
};

const uuid = '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}';
const conversation = `chat/conversations/${uuid}`;
const endpoints: Endpoint[] = [
  { path: /^dashboard$/, methods: { GET: { query: ['city', 'area', 'room_page', 'roommate_page', 'page_size', 'mode', 'location', 'min_rent', 'max_rent', 'property_type', 'amenities', 'available_by', 'min_budget', 'max_budget', 'sleep_schedule', 'cleanliness', 'move_in_timeline', 'saved_sort'] } } },
  { path: new RegExp(`^dashboard/saved/(room/${uuid}|roommate/RMF-[0-9]{6})$`), methods: { PUT: {}, DELETE: {} } },
  { path: /^dashboard\/searches$/, methods: { POST: { fields: ['city', 'area', 'kind'] } } },
  { path: /^notifications$/, methods: { GET: { query: ['page', 'page_size', 'unread_only'] } } },
  { path: /^notifications\/unread-count$/, methods: { GET: {} } },
  { path: /^notifications\/preferences$/, methods: { GET: {}, PUT: { fields: ['new_messages', 'new_rooms', 'new_matching_roommates', 'listing_unavailable', 'saved_listing_updates', 'login_alerts', 'verification_updates', 'account_activity', 'product_updates', 'promotions'] } } },
  { path: /^users\/me$/, methods: {
    GET: {}, DELETE: {}, PATCH: { fields: ['display_name', 'bio', 'phone_number', 'gender'] },
  } },
  { path: /^users\/me\/(profile-summary|blocked|sessions)$/, methods: { GET: {} } },
  { path: /^users\/me\/visibility$/, methods: { PATCH: { fields: ['is_profile_visible'] } } },
  { path: /^chat\/block\/RMF-[0-9]{6}$/, methods: { DELETE: {} } },
  { path: /^users\/me\/complete-profile$/, methods: {
    POST: { fields: ['display_name', 'bio', 'gender', 'phone_number', 'date_of_birth', 'seeker_preferences'] },
  } },
  { path: /^users\/me\/avatar$/, methods: { POST: { upload: true } } },
  { path: /^chat\/conversations$/, methods: {
    GET: { query: ['include_archived', 'page', 'page_size'] },
    POST: { fields: ['participant_id'] },
  } },
  { path: new RegExp(`^${conversation}/profile$`), methods: { GET: {} } },
  { path: new RegExp(`^${conversation}/profile/block$`), methods: { PUT: {}, DELETE: {} } },
  { path: new RegExp(`^${conversation}/profile/report$`), methods: { POST: { fields: ['reason', 'details'] } } },
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
  { path: new RegExp(`^chat/keys/RMF-[0-9]{6}$`), methods: { GET: {} } },
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

  let body: string | FormData | undefined;
  if (options.upload) {
    if (!request.headers.get('content-type')?.startsWith('multipart/form-data;')) {
      return json({ message: 'Choose a PNG or JPG photo.' }, 415);
    }
    if (Number(request.headers.get('content-length')) > 5 * 1024 * 1024 + 65536) {
      return json({ message: 'Photo must be 5 MB or smaller.' }, 413);
    }
    try {
      const form = await request.formData();
      const file = form.get('file');
      if (!file || typeof file === 'string' || form.getAll('file').length !== 1 ||
          [...form.keys()].some(key => key !== 'file') || !['image/png', 'image/jpeg'].includes(file.type)) {
        return json({ message: 'Choose a PNG or JPG photo.' }, 415);
      }
      if (!file.size || file.size > 5 * 1024 * 1024) return json({ message: 'Photo must be between 1 byte and 5 MB.' }, 413);
      body = new FormData();
      body.set('file', file, file.type === 'image/png' ? 'profile.png' : 'profile.jpg');
    } catch { return json({ message: 'Unable to read the photo.' }, 400); }
  }
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
        ...(typeof body === 'string' ? { 'Content-Type': 'application/json' } : {}),
        'User-Agent': request.headers.get('user-agent') || 'Roommate Finder',
      },
      body, cache: 'no-store', redirect: 'manual', signal: AbortSignal.timeout(15000),
    });
    if (upstream.status >= 500 || (upstream.status >= 300 && upstream.status < 400)) {
      if (options.upload) return json({ message: 'Photo upload is unavailable. Please try again later or save your profile without a photo.' }, 502);
      return json({ message: 'The server is unavailable. Please try again.' }, 502);
    }
    if (upstream.status === 204) return new NextResponse(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
    const data: unknown = await upstream.json();
    const response = json(upstream.ok ? data : { message: upstreamMessage(data) }, upstream.status);
    if (upstream.ok && path === 'users/me' && request.method === 'DELETE') {
      for (const name of ['rmf_access', 'rmf_refresh', 'rmf_verification_email']) response.cookies.delete(name);
    }
    if (upstream.status === 429 && upstream.headers.has('retry-after')) {
      response.headers.set('Retry-After', upstream.headers.get('retry-after')!);
    }
    return response;
  } catch {
    if (options.upload) return json({ message: 'Unable to upload your photo. Please try again or save your profile without a photo.' }, 502);
    return json({ message: 'Unable to reach the server. Please try again.' }, 502);
  }
}

export { handle as GET, handle as POST, handle as PATCH, handle as PUT, handle as DELETE };
