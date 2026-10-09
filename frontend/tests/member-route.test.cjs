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
  vm.runInNewContext(compiled, { exports, require, process: { env: {} }, fetch, AbortSignal, URLSearchParams });
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
  for (const path of ['auth/login', `users/${id}/role`, 'users/me/sessions', 'chat/conversations/invalid-id', 'users/../auth']) {
    assert.equal((await GET(request(path), context(path))).status, 404);
  }
  assert.equal((await DELETE(request('users/me', 'DELETE'), context('users/me'))).status, 405);
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
