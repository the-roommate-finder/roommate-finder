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

test('registration and resending preserve the email in an HttpOnly cookie', async () => {
  for (const action of ['register', 'resend-otp']) {
    const post = handler(async (url) => {
      assert.ok(url.endsWith(`/auth/${action}`));
      return Response.json({ email: 'test@example.com' });
    });
    const response = await post(request(), { params: Promise.resolve({ action }) });
    const cookie = response.cookies.get('rmf_verification_email');
    assert.equal(cookie.value, 'test@example.com');
    assert.equal(cookie.httpOnly, true);
    assert.equal(cookie.secure, true);
    assert.equal(cookie.maxAge, 1800);
  }
});

test('successful email verification clears pending email and stores session tokens securely', async () => {
  const post = handler(async () => Response.json({ access_token: 'access', refresh_token: 'refresh', expires_in: 900, user: { is_email_verified: true } }));
  const response = await post(request(), { params: Promise.resolve({ action: 'verify-email' }) });
  assert.equal(response.cookies.get('rmf_verification_email').value, '');
  assert.equal(response.cookies.get('rmf_access').httpOnly, true);
  const body = await response.json();
  assert.equal(body.access_token, undefined);
  assert.equal(body.refresh_token, undefined);
  assert.equal(body.user.is_email_verified, true);
});

test('password reset forwards the token and new password and clears revoked session cookies', async () => {
  const payload = { token: 'test-reset-token', new_password: 'NewPassword123!' };
  const post = handler(async (url, options) => {
    assert.equal(url, 'http://127.0.0.1:8000/api/v1/auth/reset-password');
    assert.deepEqual(JSON.parse(options.body), payload);
    assert.equal(options.headers.Authorization, undefined);
    return Response.json({ message: 'Password reset successful.' });
  });
  const req = new NextRequest('https://roommate.example/api/auth/reset-password', {
    method: 'POST', headers: { Origin: 'https://roommate.example', 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
  });
  const response = await post(req, { params: Promise.resolve({ action: 'reset-password' }) });
  assert.equal(response.status, 200);
  assert.equal(response.cookies.get('rmf_access').value, '');
  assert.equal(response.cookies.get('rmf_refresh').value, '');
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await response.json(), { message: 'Password reset successful.' });
});

test('failed resets retain the error and do not clear an existing session', async () => {
  for (const [status, detail, message] of [
    [400, 'Invalid or expired reset token.', 'Invalid or expired reset token.'],
    [422, [{ msg: 'Password is too weak.', input: 'private-input' }], 'Password is too weak.'],
  ]) {
    const post = handler(async () => Response.json({ detail }, { status }));
    const response = await post(request(), { params: Promise.resolve({ action: 'reset-password' }) });
    assert.equal(response.status, status);
    assert.deepEqual(await response.json(), { message });
    assert.equal(response.cookies.getAll().length, 0);
  }
});
