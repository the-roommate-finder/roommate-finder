const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const { NextRequest } = require('next/server');
const code = ts.transpileModule(fs.readFileSync('app/api/listings/route.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
function handler(fetch) {
  const exports = {};
  vm.runInNewContext(code, { exports, require, process: { env: {} }, fetch, AbortSignal, URLSearchParams });
  return exports.GET;
}

test('public feed uses the fixed public backend endpoint without forwarding cookies or credentials', async () => {
  const get = handler(async (url, options) => {
    assert.equal(url, 'http://127.0.0.1:8000/api/v1/listings/public?city=Port+Harcourt&area=Rumuola&page=2');
    assert.equal(options.headers.Authorization, undefined);
    assert.equal(options.headers.Cookie, undefined);
    assert.equal(options.cache, 'no-store');
    assert.equal(options.redirect, 'manual');
    return Response.json({ items: [], total: 0, pages: 1 });
  });
  const response = await get(new NextRequest('http://localhost/api/listings?city=Port%20Harcourt&area=Rumuola&page=2', { headers: { Cookie: 'secret', Authorization: 'secret' } }));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await response.json(), { items: [], total: 0, pages: 1 });
});

test('failures and malformed responses never become successful empty feeds', async () => {
  for (const upstream of [async () => { throw new Error('private host'); }, async () => Response.json({ private: 'error' }, { status: 500 }), async () => Response.json({ items: null })]) {
    const response = await handler(upstream)(new NextRequest('http://localhost/api/listings'));
    assert.equal(response.status, 502);
    assert.equal((await response.json()).items, undefined);
  }
});

test('unrecognised or duplicate query fields cannot change the upstream target', async () => {
  const get = handler(() => { throw new Error('Backend should not be called'); });
  for (const query of ['url=http://other.example', 'page=1&page=2', 'owner_id=123']) {
    assert.equal((await get(new NextRequest(`http://localhost/api/listings?${query}`))).status, 400);
  }
});
