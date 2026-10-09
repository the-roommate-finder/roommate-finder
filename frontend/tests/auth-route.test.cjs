const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const { NextRequest } = require('next/server');

function handler(upstream) {
  const exports = {};
  const compiled = ts.transpileModule(fs.readFileSync('app/api/auth/[action]/route.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(compiled, { exports, require, process: { env: { NODE_ENV: 'production' } }, fetch: upstream, AbortSignal });
  return exports.POST;
}
function request(origin = 'https://roommate.example') {
  return new NextRequest('https://roommate.example/api/auth/login', {
    method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'test@example.com', password: 'example' }),
  });
}

test('tokens are removed from JSON and issued only as secure HttpOnly cookies', async () => {
  const post = handler(async () => Response.json({ access_token: 'secret-access', refresh_token: 'secret-refresh', expires_in: 900, user: { id: '123' } }));
  const response = await post(request(), { params: Promise.resolve({ action: 'login' }) });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.access_token, undefined);
  assert.equal(body.refresh_token, undefined);
  assert.equal(body.user.id, '123');
  for (const name of ['rmf_access', 'rmf_refresh']) {
    const cookie = response.cookies.get(name);
    assert.equal(cookie.httpOnly, true);
    assert.equal(cookie.secure, true);
    assert.equal(cookie.sameSite, 'lax');
  }
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
});

test('cross-origin requests are rejected before contacting the backend', async () => {
  const post = handler(() => { throw new Error('Must not call backend'); });
  const response = await post(request('https://attacker.example'), { params: Promise.resolve({ action: 'login' }) });
  assert.equal(response.status, 403);
});

test('failed login reports the API error without setting session cookies', async () => {
  const post = handler(async () => Response.json({ detail: { message: 'Invalid credentials.' } }, { status: 401 }));
  const response = await post(request(), { params: Promise.resolve({ action: 'login' }) });
  assert.equal(response.status, 401);
  assert.equal((await response.json()).message, 'Invalid credentials.');
  assert.equal(response.cookies.getAll().length, 0);
});

test('the proxy cannot be used to call arbitrary backend endpoints', async () => {
  const post = handler(() => { throw new Error('Must not call backend'); });
  const response = await post(request(), { params: Promise.resolve({ action: 'users' }) });
  assert.equal(response.status, 404);
});

test('same-origin Host header works when Next normalizes the internal URL hostname', async () => {
  const post = handler(async () => Response.json({ detail: 'Invalid credentials.' }, { status: 401 }));
  const req = new NextRequest('http://localhost:3000/api/auth/login', {
    method: 'POST', headers: { host: '127.0.0.1:3000', origin: 'http://127.0.0.1:3000', 'Content-Type': 'application/json' }, body: '{}',
  });
  const response = await post(req, { params: Promise.resolve({ action: 'login' }) });
  assert.equal(response.status, 401);
});
