const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const { NextRequest } = require('next/server');

const id = '12345678-1234-4234-8234-123456789abc';
const chatPath = `chat/conversations/${id}/messages`;
const compiled = ts.transpileModule(fs.readFileSync('app/api/member/[...path]/route.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function handlers(fetch) {
  const exports = {};
  vm.runInNewContext(compiled, { exports, require, process: { env: {} }, fetch, AbortSignal, URLSearchParams, FormData });
  return exports;
}
function request(path, method = 'GET', body, headers = {}) {
  return new NextRequest(`https://roommate.example/api/member/${path}`, {
    method, headers: {
      cookie: 'rmf_access=private-access; rmf_refresh=private-refresh',
      origin: 'https://roommate.example', 'content-type': 'application/json', ...headers,
    }, ...(body === undefined ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }),
  });
}
function context(path) { return { params: Promise.resolve({ path: path.split('?')[0].split('/') }) }; }
function noUpstream() { throw new Error('Unexpected backend call'); }

test('photo storage failures are actionable without exposing provider errors', async () => {
  for (const upstream of [
    async () => Response.json({ detail: 'Private storage credentials error' }, { status: 503 }),
    async () => { throw new Error('Private storage endpoint timeout'); },
  ]) {
    const form = new FormData(); form.set('file', new Blob(['image-data'], { type: 'image/png' }), 'profile.png');
    const req = new NextRequest('https://roommate.example/api/member/users/me/avatar', { method: 'POST', body: form,
      headers: { origin: 'https://roommate.example', cookie: 'rmf_access=private-access' } });
    const response = await handlers(upstream).POST(req, context('users/me/avatar'));
    assert.equal(response.status, 502);
    const body = await response.json();
    assert.match(body.message, /without a photo/);
    assert.equal(JSON.stringify(body).includes('Private'), false);
  }
});

test('seeker fields reach the completion endpoint without client-controlled account flags', async () => {
  const payload = { display_name: 'Ada', date_of_birth: '2000-05-20T00:00:00Z', phone_number: '+2348012345678',
    seeker_preferences: { occupation: 'Engineer', budget_min: 50000, budget_max: 150000 } };
  const { POST } = handlers(async (url, options) => {
    assert.deepEqual(JSON.parse(options.body), payload);
    return Response.json({ is_profile_complete: true });
  });
  const path = 'users/me/complete-profile';
  assert.equal((await POST(request(path, 'POST', payload), context(path))).status, 200);
  assert.equal((await handlers(noUpstream).POST(request(path, 'POST', { ...payload, is_profile_complete: true }), context(path))).status, 400);
});

test('avatar proxy validates and forwards multipart files with the authenticated user', async () => {
  function upload(file, headers = {}) {
    const body = new FormData(); body.set('file', file, 'user-chosen-name.png');
    return new NextRequest('https://roommate.example/api/member/users/me/avatar', { method: 'POST', body,
      headers: { origin: 'https://roommate.example', cookie: 'rmf_access=private-access', ...headers } });
  }
  const { POST } = handlers(async (url, options) => {
    assert.equal(url.endsWith('/users/me/avatar'), true);
    assert.equal(options.headers.Authorization, 'Bearer private-access');
    assert.equal(options.headers['Content-Type'], undefined);
    assert.equal(options.body.get('file').name, 'profile.png');
    assert.equal(await options.body.get('file').text(), 'image-data');
    return Response.json({ avatar_url: 'https://images.example/photo.png' });
  });
  const path = context('users/me/avatar');
  assert.equal((await POST(upload(new Blob(['image-data'], { type: 'image/png' })), path)).status, 200);
  const deny = handlers(noUpstream);
  assert.equal((await deny.POST(upload(new Blob(['bad'], { type: 'image/gif' })), path)).status, 415);
  assert.equal((await deny.POST(upload(new Blob([new Uint8Array(5 * 1024 * 1024 + 1)], { type: 'image/png' })), path)).status, 413);
  assert.equal((await deny.POST(upload(new Blob(['data'], { type: 'image/png' }), { cookie: '' }), path)).status, 401);
});

test('member calls authenticate with only the access cookie, ignoring client authorization', async () => {
  const { GET } = handlers(async (url, options) => {
    assert.equal(url, 'http://127.0.0.1:8000/api/v1/users/me');
    assert.equal(options.headers.Authorization, 'Bearer private-access');
    assert.equal(options.headers.cookie, undefined);
    assert.equal(options.headers['X-Forwarded-For'], undefined);
    assert.equal(options.cache, 'no-store');
    assert.equal(options.redirect, 'manual');
    return Response.json({ id, is_profile_complete: false });
  });
  const response = await GET(request('users/me', 'GET', undefined, { authorization: 'Bearer attacker', 'X-Forwarded-For': 'attacker' }), context('users/me'));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await response.json(), { id, is_profile_complete: false });
  assert.equal(response.headers.get('set-cookie'), null);
});

test('signed-out and cross-site requests never reach the backend', async () => {
  const { GET, POST } = handlers(noUpstream);
  assert.equal((await GET(request('users/me', 'GET', undefined, { cookie: '' }), context('users/me'))).status, 401);
  assert.equal((await GET(request(chatPath, 'GET', undefined, { 'sec-fetch-site': 'cross-site' }), context(chatPath))).status, 403);
  assert.equal((await POST(request('users/me/complete-profile', 'POST', {}, { origin: 'https://other.example' }), context('users/me/complete-profile'))).status, 403);
  const missingOrigin = request('users/me/complete-profile', 'POST', {});
  missingOrigin.headers.delete('origin');
  assert.equal((await POST(missingOrigin, context('users/me/complete-profile'))).status, 403);
});

test('only explicit member paths and methods are exposed', async () => {
  const { GET, PATCH, DELETE } = handlers(noUpstream);
  for (const path of ['auth/login', `users/${id}/role`, 'users/me/devices', 'chat/conversations/invalid-id', 'users/../auth']) {
    assert.equal((await GET(request(path), context(path))).status, 404);
  }
  assert.equal((await DELETE(request('users/me/visibility', 'DELETE'), context('users/me/visibility'))).status, 405);
  assert.equal((await PATCH(request('users/me', 'PATCH', { role: 'admin' }), context('users/me'))).status, 400);
});

test('profile completion preserves backend validation and completion state', async () => {
  const path = 'users/me/complete-profile';
  const { POST } = handlers(async (url, options) => {
    assert.equal(url.endsWith('/users/me/complete-profile'), true);
    assert.deepEqual(JSON.parse(options.body), { display_name: 'Ada', bio: 'Hello' });
    return Response.json({ id, display_name: 'Ada', is_profile_complete: true });
  });
  const response = await POST(request(path, 'POST', { display_name: 'Ada', bio: 'Hello' }), context(path));
  assert.equal((await response.json()).is_profile_complete, true);
  const invalid = handlers(async () => Response.json({ detail: [{ msg: 'Display name is required.', input: 'private input' }] }, { status: 422 }));
  const failure = await invalid.POST(request(path, 'POST', { display_name: '' }), context(path));
  assert.equal(failure.status, 422);
  assert.deepEqual(await failure.json(), { message: 'Display name is required.' });
});

test('conversation pagination is forwarded and unknown or duplicate queries are rejected', async () => {
  const path = 'chat/conversations';
  const { GET } = handlers(async url => {
    assert.equal(url, 'http://127.0.0.1:8000/api/v1/chat/conversations?page=2&page_size=10&include_archived=true');
    return Response.json({ items: [], page: 2 });
  });
  assert.equal((await GET(request(`${path}?page=2&page_size=10&include_archived=true`), context(path))).status, 200);
  const deny = handlers(noUpstream);
  for (const query of ['?user_id=someone', '?page=1&page=2', '?url=https://other.example']) {
    assert.equal((await deny.GET(request(path + query), context(path))).status, 400);
  }
});

test('encrypted message payloads are preserved without fabricating encryption', async () => {
  const payload = { encrypted_content: 'opaque-ciphertext', encryption_nonce: 'opaque-nonce', message_type: 'text' };
  const { POST } = handlers(async (url, options) => {
    assert.equal(url.endsWith(`/${chatPath}`), true);
    assert.deepEqual(JSON.parse(options.body), payload);
    return Response.json({ id, ...payload }, { status: 201 });
  });
  assert.equal((await POST(request(chatPath, 'POST', payload), context(chatPath))).status, 201);
  const deny = handlers(noUpstream);
  for (const body of [{ content: 'plaintext' }, { encrypted_content: 'missing nonce' }, { ...payload, private_key: 'never send this' }]) {
    assert.equal((await deny.POST(request(chatPath, 'POST', body), context(chatPath))).status, 400);
  }
});

test('public key publishing cannot forward a private key', async () => {
  const { PUT } = handlers(async (url, options) => {
    assert.equal(url.endsWith('/chat/keys/me'), true);
    assert.deepEqual(JSON.parse(options.body), { public_key: 'public-key-only' });
    return Response.json({ user_id: id, public_key: 'public-key-only' });
  });
  assert.equal((await PUT(request('chat/keys/me', 'PUT', { public_key: 'public-key-only' }), context('chat/keys/me'))).status, 200);
  const deny = handlers(noUpstream);
  assert.equal((await deny.PUT(request('chat/keys/me', 'PUT', { public_key: 'public', private_key: 'private' }), context('chat/keys/me'))).status, 400);
});

test('malformed JSON and incorrect content type fail before the backend', async () => {
  const { PATCH } = handlers(noUpstream);
  assert.equal((await PATCH(request('users/me', 'PATCH', '{broken'), context('users/me'))).status, 400);
  assert.equal((await PATCH(request('users/me', 'PATCH', [], {}), context('users/me'))).status, 400);
  assert.equal((await PATCH(request('users/me', 'PATCH', {}, { 'content-type': 'text/plain' }), context('users/me'))).status, 415);
});

test('expired sessions, permission failures, and rate limits retain meaningful status codes', async () => {
  for (const status of [401, 403, 404, 429]) {
    const { GET } = handlers(async () => Response.json({ detail: 'Access denied.' }, { status, headers: { 'Retry-After': '30' } }));
    const response = await GET(request(chatPath), context(chatPath));
    assert.equal(response.status, status);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    if (status === 429) assert.equal(response.headers.get('retry-after'), '30');
  }
});

test('backend outages, non-JSON replies, and redirects do not leak internal responses', async () => {
  for (const upstream of [
    async () => { throw new Error('Internal hostname'); },
    async () => new Response('<html>internal error</html>'),
    async () => new Response('Internal error', { status: 500 }),
    async () => new Response(null, { status: 302, headers: { Location: 'https://other.example' } }),
  ]) {
    const { GET } = handlers(upstream);
    const response = await GET(request('users/me'), context('users/me'));
    assert.equal(response.status, 502);
    assert.equal(JSON.stringify(await response.json()).includes('Internal'), false);
    assert.equal(response.headers.get('location'), null);
  }
});

test('chat public keys use account IDs and never forward private-key fields', async () => {
  const path = 'chat/keys/RMF-000002';
  const api = handlers(async url => {
    assert.equal(url.endsWith('/chat/keys/RMF-000002'), true);
    return Response.json({ public_key: 'public-key', user_id: 'RMF-000002' });
  });
  assert.equal((await api.GET(request(path), context(path))).status, 200);
  const invalid = `chat/keys/${id}`;
  assert.equal((await handlers(noUpstream).GET(request(invalid), context(invalid))).status, 404);
  assert.equal((await handlers(noUpstream).PUT(request('chat/keys/me', 'PUT', { public_key: 'public-key', private_key: 'never-send' }), context('chat/keys/me'))).status, 400);
});

test('chat profile actions allow only scoped endpoints and report fields', async () => {
  const api = handlers(async () => Response.json({ ok: true }));
  for (const [suffix, method, body] of [['', 'GET'], ['/block', 'PUT'], ['/block', 'DELETE'], ['/report', 'POST', { reason: 'scam', details: 'A report description.' }]]) {
    const path = `chat/conversations/${id}/profile${suffix}`;
    assert.equal((await api[method](request(path, method, body), context(path))).status, 200);
    assert.equal((await handlers(noUpstream)[method](request(path, method, body, { cookie: '' }), context(path))).status, 401);
  }
  const path = `chat/conversations/${id}/profile/report`;
  assert.equal((await handlers(noUpstream).POST(request(path, 'POST', { reason: 'scam', details: 'A report description.', reported_id: 'RMF-000002' }), context(path))).status, 400);
});


test('profile settings enforce ownership fields and deletion clears cookies only on success', async () => {
  const visibility = 'users/me/visibility';
  assert.equal((await handlers(noUpstream).PATCH(request(visibility, 'PATCH', { is_profile_visible: false, user_id: 'RMF-000002' }), context(visibility))).status, 400);
  assert.equal((await handlers(noUpstream).DELETE(request('users/me', 'DELETE', undefined, { origin: 'https://attacker.example' }), context('users/me'))).status, 403);
  for (const status of [200, 409]) {
    const response = await handlers(async () => Response.json({ message: 'Result' }, { status })).DELETE(request('users/me', 'DELETE'), context('users/me'));
    assert.equal(response.status, status);
    if (status === 200) {
      assert.match(response.headers.get('set-cookie'), /rmf_access=;/);
      assert.match(response.headers.get('set-cookie'), /rmf_refresh=;/);
    } else assert.equal(response.headers.get('set-cookie'), null);
  }
});
